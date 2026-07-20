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
from app.models.sale import Sale, PaymentMode
from app.models.expense import Expense
from app.schemas.analytics import (
    DailySummary,
    ChartPoint,
    PaymentBreakdown,
    CategoryExpenseBreakdown,
    AnalyticsSummaryResponse,
    DailyReportRow,
    AnalyticsReportResponse,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _zero() -> Decimal:
    return Decimal("0")


@router.get("/summary", response_model=AnalyticsSummaryResponse, dependencies=[Depends(get_current_user)])
def get_summary(
    tenant_id: uuid.UUID,
    target_date: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to today"),
    db: Session = Depends(get_session),
):
    """Return today's KPIs, payment breakdown, expense breakdown, and chart data for the analytics dashboard."""
    if target_date:
        day = datetime.strptime(target_date, "%Y-%m-%d").date()
    else:
        day = date.today()

    day_start = datetime.combine(day, datetime.min.time())
    day_end = datetime.combine(day, datetime.max.time())

    # --- Today's Sales ---
    today_sales = db.exec(
        select(Sale).where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= day_start,
            Sale.created_at <= day_end,
        )
    ).all()

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
        date=day.isoformat(),
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
    thirty_days_ago = datetime.combine(day - timedelta(days=30), datetime.min.time())
    recent_sales = db.exec(
        select(Sale).where(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= thirty_days_ago,
        )
    ).all()

    recent_expenses = db.exec(
        select(Expense).where(
            Expense.tenant_id == tenant_id,
            Expense.created_at >= thirty_days_ago,
        )
    ).all()

    pb_cash = sum((s.total_amount for s in recent_sales if s.payment_mode == PaymentMode.CASH), _zero())
    pb_upi = sum((s.total_amount for s in recent_sales if s.payment_mode == PaymentMode.UPI), _zero())
    pb_card = sum((s.total_amount for s in recent_sales if s.payment_mode == PaymentMode.CARD), _zero())
    pb_cash_c = sum(1 for s in recent_sales if s.payment_mode == PaymentMode.CASH)
    pb_upi_c = sum(1 for s in recent_sales if s.payment_mode == PaymentMode.UPI)
    pb_card_c = sum(1 for s in recent_sales if s.payment_mode == PaymentMode.CARD)

    payment_breakdown = PaymentBreakdown(
        cash=pb_cash, upi=pb_upi, card=pb_card,
        cash_count=pb_cash_c, upi_count=pb_upi_c, card_count=pb_card_c,
    )

    # --- Expense Category Breakdown (last 30 days) ---
    cat_map = {}
    for e in recent_expenses:
        cat_map[e.category] = cat_map.get(e.category, _zero()) + e.amount

    category_expenses = [
        CategoryExpenseBreakdown(category=cat, amount=amt)
        for cat, amt in sorted(cat_map.items(), key=lambda x: x[1], reverse=True)
    ]

    # --- Daily Chart (last 14 days) ---
    daily_chart = []
    for i in range(13, -1, -1):
        d = day - timedelta(days=i)
        d_start = datetime.combine(d, datetime.min.time())
        d_end = datetime.combine(d, datetime.max.time())
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
    six_months_ago = datetime.combine(day - timedelta(days=180), datetime.min.time())
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
        m_start = datetime.combine(target_month, datetime.min.time())
        m_end = datetime.combine(next_month - timedelta(days=1), datetime.max.time())

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

    return AnalyticsSummaryResponse(
        today=today_summary,
        payment_breakdown=payment_breakdown,
        category_expenses=category_expenses,
        daily_chart=daily_chart,
        monthly_chart=monthly_chart,
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

    range_start = datetime.combine(s_date, datetime.min.time())
    range_end = datetime.combine(e_date, datetime.max.time())

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
        d_start = datetime.combine(curr_d, datetime.min.time())
        d_end = datetime.combine(curr_d, datetime.max.time())

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
