import uuid
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date
from sqlmodel import select

from app.database import get_session
from app.auth import get_current_user
from app.models.tenant import Tenant
from app.models.sale import Sale, SaleItem, PaymentMode
from app.models.expense import Expense
from app.models.product import Product
from app.schemas.analytics import (
    DailySummary,
    ChartPoint,
    PaymentBreakdown,
    CategoryExpenseBreakdown,
    AnalyticsSummaryResponse,
    DailyReportRow,
    AnalyticsReportResponse,
    TopSoldItem,
    TopProfitItem,
    StockAlertItem,
)
from app.timeutil import local_today, local_day_utc_bounds, local_date_range_utc_bounds

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _zero() -> Decimal:
    return Decimal("0")


def _recalculate_sales_if_needed(sales: List[Sale], db: Session):
    """Ensure all Sale objects have total_amount, total_cost, total_profit aligned with SaleItem totals."""
    if not sales:
        return
    sale_ids = [s.id for s in sales]
    items = db.exec(select(SaleItem).where(SaleItem.sale_id.in_(sale_ids))).all()
    items_by_sale = {}
    for item in items:
        items_by_sale.setdefault(item.sale_id, []).append(item)

    need_commit = False
    for sale in sales:
        s_items = items_by_sale.get(sale.id, [])
        if s_items:
            tot = sum((si.total_price if si.total_price > 0 else (si.unit_selling_price * si.quantity)) for si in s_items)
            cost = sum(si.unit_cost_price * si.quantity for si in s_items)
            prof = sum((si.total_profit if si.total_profit != 0 else ((si.unit_selling_price - si.unit_cost_price) * si.quantity)) for si in s_items)
            if sale.total_amount != tot or sale.total_cost != cost or sale.total_profit != prof:
                sale.total_amount = tot
                sale.total_cost = cost
                sale.total_profit = prof
                db.add(sale)
                need_commit = True
    if need_commit:
        db.commit()


@router.get("/summary", response_model=AnalyticsSummaryResponse, dependencies=[Depends(get_current_user)])
def get_summary(
    tenant_id: uuid.UUID,
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_session),
):
    """Return KPIs, payment breakdown, expense breakdown, and chart data for the analytics dashboard."""
    if start_date:
        s_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    else:
        s_date = local_today()

    if end_date:
        e_date = datetime.strptime(end_date, "%Y-%m-%d").date()
    else:
        e_date = s_date

    day_start, day_end = local_date_range_utc_bounds(s_date, e_date)
    
    # Keeping 'day' variable for the charts which depend on a single reference day (usually today/end_date)
    day = e_date

    # --- Today's Sales ---
    today_sales = db.exec(
        select(Sale).where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= day_start,
            Sale.created_at <= day_end,
        )
    ).all()
    _recalculate_sales_if_needed(today_sales, db)

    # --- Today's Expenses ---
    today_expenses = db.exec(
        select(Expense).where(
            Expense.tenant_id == tenant_id,
            Expense.created_at >= day_start,
            Expense.created_at <= day_end,
        )
    ).all()

    gross_revenue = sum((s.total_amount for s in today_sales), _zero())
    total_cogs = sum((s.total_cost for s in today_sales), _zero())
    total_expenses = sum((e.amount for e in today_expenses), _zero())

    # True Net Profit = Revenue - Cost of Goods Sold - Operating Expenses
    net_profit = (gross_revenue - total_cogs) - total_expenses
    bill_count = len(today_sales)
    avg_basket = gross_revenue / bill_count if bill_count else _zero()

    cash_amt = sum((s.total_amount for s in today_sales if s.payment_mode == PaymentMode.CASH), _zero())
    upi_amt = sum((s.total_amount for s in today_sales if s.payment_mode == PaymentMode.UPI), _zero())
    card_amt = sum((s.total_amount for s in today_sales if s.payment_mode == PaymentMode.CARD), _zero())

    today_summary = DailySummary(
        date=s_date.isoformat() if s_date == e_date else f"{s_date.isoformat()} to {e_date.isoformat()}",
        gross_revenue=gross_revenue,
        total_cogs=total_cogs,
        total_expenses=total_expenses,
        net_profit=net_profit,
        bill_count=bill_count,
        avg_basket_size=round(avg_basket, 2),
        cash_amount=cash_amt,
        upi_amount=upi_amt,
        card_amount=card_amt,
    )

    # --- Payment Breakdown (last 30 days) ---
    thirty_days_ago, _ = local_day_utc_bounds(day - timedelta(days=30))
    recent_sales = db.exec(
        select(Sale).where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= thirty_days_ago,
        )
    ).all()
    _recalculate_sales_if_needed(recent_sales, db)

    recent_expenses = db.exec(
        select(Expense).where(
            Expense.tenant_id == tenant_id,
            Expense.created_at >= thirty_days_ago,
        )
    ).all()

    pb_cash = sum((s.total_amount for s in today_sales if s.payment_mode == PaymentMode.CASH), _zero())
    pb_upi = sum((s.total_amount for s in today_sales if s.payment_mode == PaymentMode.UPI), _zero())
    pb_card = sum((s.total_amount for s in today_sales if s.payment_mode == PaymentMode.CARD), _zero())
    pb_cash_c = sum(1 for s in today_sales if s.payment_mode == PaymentMode.CASH)
    pb_upi_c = sum(1 for s in today_sales if s.payment_mode == PaymentMode.UPI)
    pb_card_c = sum(1 for s in today_sales if s.payment_mode == PaymentMode.CARD)

    payment_breakdown = PaymentBreakdown(
        cash=pb_cash, upi=pb_upi, card=pb_card,
        cash_count=pb_cash_c, upi_count=pb_upi_c, card_count=pb_card_c,
    )

    # --- Expense Category Breakdown (target date) ---
    cat_map = {}
    for e in today_expenses:
        cat_map[e.category] = cat_map.get(e.category, _zero()) + e.amount

    category_expenses = [
        CategoryExpenseBreakdown(category=cat, amount=amt)
        for cat, amt in sorted(cat_map.items(), key=lambda x: x[1], reverse=True)
    ]

    # --- Daily Chart (last 14 days) ---
    daily_chart = []
    for i in range(13, -1, -1):
        d = day - timedelta(days=i)
        d_start, d_end = local_day_utc_bounds(d)
        day_sales = [s for s in recent_sales if d_start <= s.created_at <= d_end]
        day_exps = [e for e in recent_expenses if d_start <= e.created_at <= d_end]

        rev = sum((s.total_amount for s in day_sales), _zero())
        cost = sum((s.total_cost for s in day_sales), _zero())
        exp = sum((e.amount for e in day_exps), _zero())
        prof = (rev - cost) - exp

        daily_chart.append(
            ChartPoint(
                label=d.strftime("%d %b"),
                revenue=rev,
                profit=prof,
                cost=cost,
                expenses=exp,
            )
        )

    # --- Monthly Chart (last 6 months) ---
    monthly_chart = []
    six_months_ago, _ = local_day_utc_bounds(day - timedelta(days=180))
    all_sales_6m = db.exec(
        select(Sale).where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= six_months_ago,
        )
    ).all()
    all_expenses_6m = db.exec(
        select(Expense).where(
            Expense.tenant_id == tenant_id,
            Expense.created_at >= six_months_ago,
        )
    ).all()

    for i in range(5, -1, -1):
        target_month = (day.replace(day=1) - timedelta(days=i * 30)).replace(day=1)
        next_month = (target_month.replace(day=28) + timedelta(days=4)).replace(day=1)
        m_start, m_end = local_date_range_utc_bounds(
            target_month, next_month - timedelta(days=1)
        )

        m_sales = [s for s in all_sales_6m if m_start <= s.created_at <= m_end]
        m_exps = [e for e in all_expenses_6m if m_start <= e.created_at <= m_end]

        rev = sum((s.total_amount for s in m_sales), _zero())
        cost = sum((s.total_cost for s in m_sales), _zero())
        exp = sum((e.amount for e in m_exps), _zero())
        prof = (rev - cost) - exp

        monthly_chart.append(
            ChartPoint(
                label=target_month.strftime("%b %Y"),
                revenue=rev,
                profit=prof,
                cost=cost,
                expenses=exp,
            )
        )

    # --- Top Sold & Top Profit Items (last 30 days) ---
    recent_sale_ids = [s.id for s in recent_sales]
    sale_items = db.exec(select(SaleItem).where(SaleItem.sale_id.in_(recent_sale_ids))).all() if recent_sale_ids else []

    product_ids = list({si.product_id for si in sale_items})
    products_map = {}
    if product_ids:
        prods = db.exec(select(Product).where(Product.id.in_(product_ids))).all()
        products_map = {p.id: p for p in prods}

    sold_agg = {}
    for si in sale_items:
        p = products_map.get(si.product_id)
        pname = p.name if p else (si.product_name or "Product")
        pcat = p.category if p else "Misc"
        if si.product_id not in sold_agg:
            sold_agg[si.product_id] = {
                "id": si.product_id,
                "name": pname,
                "category": pcat,
                "quantity": 0,
                "revenue": Decimal("0"),
                "profit": Decimal("0"),
            }
        sold_agg[si.product_id]["quantity"] += si.quantity
        sold_agg[si.product_id]["revenue"] += (si.total_price if si.total_price > 0 else (si.unit_selling_price * si.quantity))
        sold_agg[si.product_id]["profit"] += (si.total_profit if si.total_profit != 0 else ((si.unit_selling_price - si.unit_cost_price) * si.quantity))

    # Top 5 by quantity
    top_sold_sorted = sorted(sold_agg.values(), key=lambda x: x["quantity"], reverse=True)[:5]
    top_sold_items = [
        TopSoldItem(
            product_id=x["id"],
            product_name=x["name"],
            category=x["category"],
            total_quantity=x["quantity"],
            total_revenue=x["revenue"],
        )
        for x in top_sold_sorted
    ]

    # Top 5 by profit
    top_profit_sorted = sorted(sold_agg.values(), key=lambda x: x["profit"], reverse=True)[:5]
    top_profit_items = []
    for x in top_profit_sorted:
        rev = float(x["revenue"])
        prof = float(x["profit"])
        margin = (prof / rev * 100) if rev > 0 else 0.0
        top_profit_items.append(
            TopProfitItem(
                product_id=x["id"],
                product_name=x["name"],
                category=x["category"],
                total_profit=x["profit"],
                margin_pct=round(margin, 1),
            )
        )

    # --- Low Stock Items (1 <= stock <= 10) ---
    low_prods = db.exec(
        select(Product)
        .where(
            Product.tenant_id == tenant_id,
            Product.is_active == True,  # noqa: E712
            Product.stock_quantity > 0,
            Product.stock_quantity <= 10,
        )
        .order_by(Product.stock_quantity.asc())
        .limit(5)
    ).all()

    low_stock_items = [
        StockAlertItem(
            product_id=p.id,
            product_name=p.name,
            category=p.category,
            stock_quantity=p.stock_quantity,
            selling_price=p.selling_price,
        )
        for p in low_prods
    ]

    # --- Out of Stock Items (stock == 0) ---
    out_prods = db.exec(
        select(Product)
        .where(
            Product.tenant_id == tenant_id,
            Product.is_active == True,  # noqa: E712
            Product.stock_quantity == 0,
        )
        .order_by(Product.name.asc())
        .limit(5)
    ).all()

    out_of_stock_items = [
        StockAlertItem(
            product_id=p.id,
            product_name=p.name,
            category=p.category,
            stock_quantity=p.stock_quantity,
            selling_price=p.selling_price,
        )
        for p in out_prods
    ]

    # --- Date Specific Sold Items (target_date) ---
    today_sale_ids = [s.id for s in today_sales]
    today_sale_items = db.exec(select(SaleItem).where(SaleItem.sale_id.in_(today_sale_ids))).all() if today_sale_ids else []
    
    today_product_ids = list({si.product_id for si in today_sale_items})
    today_products_map = {}
    if today_product_ids:
        today_prods = db.exec(select(Product).where(Product.id.in_(today_product_ids))).all()
        today_products_map = {p.id: p for p in today_prods}

    today_sold_agg = {}
    for si in today_sale_items:
        p = today_products_map.get(si.product_id)
        pname = p.name if p else (si.product_name or "Product")
        pcat = p.category if p else "Misc"
        if si.product_id not in today_sold_agg:
            today_sold_agg[si.product_id] = {
                "id": si.product_id,
                "name": pname,
                "category": pcat,
                "quantity": 0,
                "revenue": Decimal("0")
            }
        today_sold_agg[si.product_id]["quantity"] += si.quantity
        today_sold_agg[si.product_id]["revenue"] += (si.total_price if si.total_price > 0 else (si.unit_selling_price * si.quantity))

    date_sold_sorted = sorted(today_sold_agg.values(), key=lambda x: x["quantity"], reverse=True)
    date_sold_items = [
        TopSoldItem(
            product_id=x["id"],
            product_name=x["name"],
            category=x["category"],
            total_quantity=x["quantity"],
            total_revenue=x["revenue"],
        )
        for x in date_sold_sorted
    ]

    return AnalyticsSummaryResponse(
        today=today_summary,
        payment_breakdown=payment_breakdown,
        category_expenses=category_expenses,
        daily_chart=daily_chart,
        monthly_chart=monthly_chart,
        top_sold_items=top_sold_items,
        top_profit_items=top_profit_items,
        date_sold_items=date_sold_items,
        low_stock_items=low_stock_items,
        out_of_stock_items=out_of_stock_items,
    )


@router.get("/report", response_model=AnalyticsReportResponse, dependencies=[Depends(get_current_user)])
def get_analytics_report(
    tenant_id: uuid.UUID,
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_session),
):
    """Generate financial & sales report data for a specified date range (Today, 7d, 30d, custom)."""
    s_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    e_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    range_start, range_end = local_date_range_utc_bounds(s_date, e_date)

    # Get Tenant Name (Tenant model uses `store_name`)
    tenant = db.exec(select(Tenant).where(Tenant.id == tenant_id)).first()
    store_name = tenant.store_name if tenant else "My Store"

    sales = db.exec(
        select(Sale).where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= range_start,
            Sale.created_at <= range_end,
        )
    ).all()
    _recalculate_sales_if_needed(sales, db)

    expenses = db.exec(
        select(Expense).where(
            Expense.tenant_id == tenant_id,
            Expense.created_at >= range_start,
            Expense.created_at <= range_end,
        )
    ).all()

    gross_revenue = sum((s.total_amount for s in sales), _zero())
    total_cogs = sum((s.total_cost for s in sales), _zero())
    total_expenses = sum((e.amount for e in expenses), _zero())
    net_profit = (gross_revenue - total_cogs) - total_expenses
    margin_pct = float(round((net_profit / gross_revenue * 100), 1)) if gross_revenue > 0 else 0.0

    total_bills = len(sales)
    avg_basket = gross_revenue / total_bills if total_bills else _zero()

    pb_cash = sum((s.total_amount for s in sales if s.payment_mode == PaymentMode.CASH), _zero())
    pb_upi = sum((s.total_amount for s in sales if s.payment_mode == PaymentMode.UPI), _zero())
    pb_card = sum((s.total_amount for s in sales if s.payment_mode == PaymentMode.CARD), _zero())
    pb_cash_c = sum(1 for s in sales if s.payment_mode == PaymentMode.CASH)
    pb_upi_c = sum(1 for s in sales if s.payment_mode == PaymentMode.UPI)
    pb_card_c = sum(1 for s in sales if s.payment_mode == PaymentMode.CARD)

    payment_breakdown = PaymentBreakdown(
        cash=pb_cash, upi=pb_upi, card=pb_card,
        cash_count=pb_cash_c, upi_count=pb_upi_c, card_count=pb_card_c,
    )

    cat_map = {}
    for e in expenses:
        cat_map[e.category] = cat_map.get(e.category, _zero()) + e.amount

    category_expenses = [
        CategoryExpenseBreakdown(category=cat, amount=amt)
        for cat, amt in sorted(cat_map.items(), key=lambda x: x[1], reverse=True)
    ]

    # Build Daily Rows
    daily_rows = []
    curr_d = s_date
    while curr_d <= e_date:
        d_start, d_end = local_day_utc_bounds(curr_d)

        d_sales = [s for s in sales if d_start <= s.created_at <= d_end]
        d_exps = [e for e in expenses if d_start <= e.created_at <= d_end]

        d_rev = sum((s.total_amount for s in d_sales), _zero())
        d_cogs = sum((s.total_cost for s in d_sales), _zero())
        d_exp = sum((e.amount for e in d_exps), _zero())
        d_prof = (d_rev - d_cogs) - d_exp

        d_cash = sum((s.total_amount for s in d_sales if s.payment_mode == PaymentMode.CASH), _zero())
        d_upi = sum((s.total_amount for s in d_sales if s.payment_mode == PaymentMode.UPI), _zero())
        d_card = sum((s.total_amount for s in d_sales if s.payment_mode == PaymentMode.CARD), _zero())

        daily_rows.append(
            DailyReportRow(
                date=curr_d.strftime("%Y-%m-%d"),
                gross_revenue=d_rev,
                total_cogs=d_cogs,
                total_expenses=d_exp,
                net_profit=d_prof,
                bill_count=len(d_sales),
                cash_amount=d_cash,
                upi_amount=d_upi,
                card_amount=d_card,
            )
        )
        curr_d += timedelta(days=1)

    return AnalyticsReportResponse(
        store_name=store_name,
        start_date=start_date,
        end_date=end_date,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        gross_revenue=gross_revenue,
        total_cogs=total_cogs,
        total_expenses=total_expenses,
        net_profit=net_profit,
        net_margin_pct=margin_pct,
        total_bills=total_bills,
        avg_basket_size=round(avg_basket, 2),
        payment_breakdown=payment_breakdown,
        category_expenses=category_expenses,
        daily_rows=daily_rows,
    )
