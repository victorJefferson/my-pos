import json
import os
import re
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from dotenv import load_dotenv
from openai import OpenAI
from sqlmodel import Session, select

from app.models.expense import Expense
from app.models.product import Product
from app.models.sale import PaymentMode, Sale, SaleItem
from app.models.tenant import Tenant

load_dotenv()

# Prefer GROQ_API_KEY; fall back to GEMINI_API_KEY if a Groq key was stored there.
GROQ_API_KEY = os.getenv("GROQ_API_KEY") or os.getenv("GEMINI_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"


def _is_configured() -> bool:
    return bool(
        GROQ_API_KEY
        and GROQ_API_KEY not in ("your_gemini_api_key_here", "your_groq_api_key_here")
    )


def _client() -> OpenAI:
    return OpenAI(api_key=GROQ_API_KEY, base_url=GROQ_BASE_URL)


def _money(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    return round(float(value), 2)


def _parse_tenant_id(tenant_id: str) -> uuid.UUID:
    return uuid.UUID(str(tenant_id))


def _day_bounds(day: date) -> tuple[datetime, datetime]:
    from app.timeutil import local_day_utc_bounds
    return local_day_utc_bounds(day)


def _build_store_context(db: Session, tenant_id: str, target_day: Optional[date] = None) -> dict[str, Any]:
    """Pull real tenant metrics so the model answers from data, not guesses."""
    from app.timeutil import local_today
    tid = _parse_tenant_id(tenant_id)
    day = target_day or local_today()
    day_start, day_end = _day_bounds(day)
    week_start, _ = _day_bounds(day - timedelta(days=6))
    month_start, _ = _day_bounds(day.replace(day=1))

    tenant = db.exec(select(Tenant).where(Tenant.id == tid)).first()
    store_name = tenant.store_name if tenant else "Store"

    def sales_in(start: datetime, end: datetime) -> list[Sale]:
        return list(
            db.exec(
                select(Sale).where(
                    Sale.tenant_id == tid,
                    Sale.created_at >= start,
                    Sale.created_at <= end,
                )
            ).all()
        )

    def expenses_in(start: datetime, end: datetime) -> list[Expense]:
        return list(
            db.exec(
                select(Expense).where(
                    Expense.tenant_id == tid,
                    Expense.created_at >= start,
                    Expense.created_at <= end,
                )
            ).all()
        )

    def summarize(sales: list[Sale], expenses: list[Expense]) -> dict[str, Any]:
        revenue = sum((s.total_amount for s in sales), Decimal("0"))
        cogs = sum((s.total_cost for s in sales), Decimal("0"))
        exp = sum((e.amount for e in expenses), Decimal("0"))
        profit = revenue - cogs - exp
        bills = len(sales)
        cash = sum((s.total_amount for s in sales if s.payment_mode == PaymentMode.CASH), Decimal("0"))
        upi = sum((s.total_amount for s in sales if s.payment_mode == PaymentMode.UPI), Decimal("0"))
        card = sum((s.total_amount for s in sales if s.payment_mode == PaymentMode.CARD), Decimal("0"))
        return {
            "gross_revenue": _money(revenue),
            "total_cogs": _money(cogs),
            "total_expenses": _money(exp),
            "net_profit": _money(profit),
            "bill_count": bills,
            "avg_basket_size": _money(revenue / bills) if bills else 0.0,
            "payment_split": {
                "cash": _money(cash),
                "upi": _money(upi),
                "card": _money(card),
            },
        }

    today_sales = sales_in(day_start, day_end)
    today_expenses = expenses_in(day_start, day_end)
    week_sales = sales_in(week_start, day_end)
    week_expenses = expenses_in(week_start, day_end)
    month_sales = sales_in(month_start, day_end)
    month_expenses = expenses_in(month_start, day_end)

    # Top sold products today
    today_sale_ids = [s.id for s in today_sales]
    today_items = (
        list(db.exec(select(SaleItem).where(SaleItem.sale_id.in_(today_sale_ids))).all())
        if today_sale_ids
        else []
    )
    product_ids = list({si.product_id for si in today_items})
    products_map: dict[uuid.UUID, Product] = {}
    if product_ids:
        for p in db.exec(select(Product).where(Product.id.in_(product_ids))).all():
            products_map[p.id] = p

    sold_agg: dict[uuid.UUID, dict[str, Any]] = {}
    category_rev: dict[str, float] = {}
    for si in today_items:
        p = products_map.get(si.product_id)
        name = p.name if p else "Unknown"
        category = p.category if p else "Misc"
        rev = float(si.total_price if si.total_price > 0 else si.unit_selling_price * si.quantity)
        entry = sold_agg.setdefault(
            si.product_id,
            {"name": name, "category": category, "quantity": 0, "revenue": 0.0},
        )
        entry["quantity"] += si.quantity
        entry["revenue"] = round(entry["revenue"] + rev, 2)
        category_rev[category] = round(category_rev.get(category, 0.0) + rev, 2)

    top_products = sorted(sold_agg.values(), key=lambda x: x["quantity"], reverse=True)[:5]
    top_categories = sorted(
        [{"category": k, "revenue": v} for k, v in category_rev.items()],
        key=lambda x: x["revenue"],
        reverse=True,
    )[:5]

    low_stock = list(
        db.exec(
            select(Product)
            .where(
                Product.tenant_id == tid,
                Product.is_active == True,  # noqa: E712
                Product.stock_quantity > 0,
                Product.stock_quantity <= 10,
            )
            .order_by(Product.stock_quantity.asc())
            .limit(8)
        ).all()
    )
    out_of_stock = list(
        db.exec(
            select(Product)
            .where(
                Product.tenant_id == tid,
                Product.is_active == True,  # noqa: E712
                Product.stock_quantity == 0,
            )
            .order_by(Product.name.asc())
            .limit(8)
        ).all()
    )

    expense_cats: dict[str, float] = {}
    for e in today_expenses:
        expense_cats[e.category] = round(expense_cats.get(e.category, 0.0) + float(e.amount), 2)

    return {
        "store_name": store_name,
        "as_of_date": day.isoformat(),
        "currency": "INR",
        "today": summarize(today_sales, today_expenses),
        "last_7_days": summarize(week_sales, week_expenses),
        "month_to_date": summarize(month_sales, month_expenses),
        "top_products_today": top_products,
        "top_categories_today": top_categories,
        "expense_categories_today": [
            {"category": k, "amount": v}
            for k, v in sorted(expense_cats.items(), key=lambda x: x[1], reverse=True)
        ],
        "low_stock_items": [
            {"name": p.name, "category": p.category, "stock_quantity": p.stock_quantity}
            for p in low_stock
        ],
        "out_of_stock_items": [
            {"name": p.name, "category": p.category, "stock_quantity": p.stock_quantity}
            for p in out_of_stock
        ],
    }


def _chat(system: str, user: str, *, temperature: float = 0.3, max_tokens: int = 1024) -> str:
    response = _client().chat.completions.create(
        model=GROQ_MODEL,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return (response.choices[0].message.content or "").strip()


def _extract_json(text: str) -> dict[str, Any]:
    """Parse JSON from a model reply, tolerating markdown fences."""
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fence:
        cleaned = fence.group(1).strip()
    return json.loads(cleaned)


def query_natural_language(
    question: str,
    tenant_id: str,
    db: Optional[Session] = None,
    db_context: Optional[str] = None,
    history: Optional[list] = None,
) -> dict:
    """
    Answer analytics questions via a Wren-like Text-to-SQL pipeline (Groq + Postgres).
    Falls back to mock responses when GROQ_API_KEY is unset.
    Optional history (last turns) is used only to rephrase follow-ups into a standalone question.
    """
    if not _is_configured() or db is None:
        result = _mock_query(question)
        result["rephrased_question"] = None
        return result

    try:
        from app.services.text_to_sql import TextToSQLPipeline

        pipeline = TextToSQLPipeline(_chat, model_hint=GROQ_MODEL)
        return pipeline.run(
            question=question,
            tenant_id=tenant_id,
            db=db,
            history=history or [],
        )
    except Exception as exc:
        return {
            "question": question,
            "rephrased_question": None,
            "answer": f"AI request failed: {exc}. Check GROQ_API_KEY and network access.",
            "sql_used": None,
            "data": None,
            "is_mock": False,
            "stages": [
                {"name": "understanding", "status": "failed", "detail": str(exc)[:300]},
            ],
        }


def generate_eod_summary(
    tenant_id: str,
    date_str: str,
    db: Optional[Session] = None,
    metrics: Optional[dict] = None,
) -> dict:
    """Generate an executive end-of-day summary via Groq using real daily metrics."""
    if not _is_configured() or db is None:
        return _mock_eod(date_str)

    try:
        target = datetime.strptime(date_str, "%Y-%m-%d").date()
        context = metrics or _build_store_context(db, tenant_id, target_day=target)
        context_json = json.dumps(context, ensure_ascii=False, indent=2)
        system = (
            "You are an executive retail analyst. Given store metrics JSON, "
            "return ONLY valid JSON with keys: "
            "summary_text (string, 2–4 sentences), "
            "highlights (array of 3–5 short strings with ₹ amounts where useful), "
            "recommendations (array of 2–4 actionable strings). "
            "No markdown, no extra keys."
        )
        user = (
            f"Date: {date_str}\n"
            f"Store metrics:\n{context_json}\n\n"
            "Produce the end-of-day executive JSON now."
        )
        raw = _chat(system, user, temperature=0.4, max_tokens=900)
        parsed = _extract_json(raw)
        return {
            "date": date_str,
            "summary_text": str(parsed.get("summary_text") or "").strip()
            or "Summary unavailable.",
            "highlights": [str(h) for h in (parsed.get("highlights") or [])][:6],
            "recommendations": [str(r) for r in (parsed.get("recommendations") or [])][:5],
            "is_mock": False,
        }
    except Exception as exc:
        return {
            "date": date_str,
            "summary_text": f"Could not generate AI summary: {exc}",
            "highlights": [],
            "recommendations": ["Verify GROQ_API_KEY and try again."],
            "is_mock": False,
        }


def _mock_query(question: str) -> dict:
    mock_answers = {
        "revenue": "Today's gross revenue is ₹4,280. Your best-selling category is CoolDrinks with ₹1,840 in sales.",
        "profit": "Net profit today is ₹1,024 (23.9% margin). Ice cream items are your highest-margin products.",
        "stock": "3 items are running low on stock: Amul Chocobar (5 units), Red Bull (3 units), Dove Body Wash (2 units).",
        "best": "Best selling item today: Coca-Cola 250ml Can (42 units sold, ₹1,680 revenue).",
    }

    lower_q = question.lower()
    if "revenue" in lower_q or "sales" in lower_q:
        answer = mock_answers["revenue"]
    elif "profit" in lower_q or "margin" in lower_q:
        answer = mock_answers["profit"]
    elif "stock" in lower_q or "inventory" in lower_q:
        answer = mock_answers["stock"]
    elif "best" in lower_q or "top" in lower_q:
        answer = mock_answers["best"]
    else:
        answer = (
            f"[Mock] I would analyze your question: '{question}'. "
            "Set GROQ_API_KEY in .env to enable real AI analytics powered by Groq."
        )

    return {
        "question": question,
        "answer": answer,
        "sql_used": "SELECT -- mock SQL -- FROM sales WHERE tenant_id = :tenant_id",
        "data": None,
        "is_mock": True,
        "stages": [
            {"name": "rephrasing", "status": "skipped", "detail": "mock mode"},
            {"name": "understanding", "status": "skipped", "detail": "mock mode"},
            {"name": "planning", "status": "skipped"},
            {"name": "generating", "status": "skipped"},
            {"name": "validating", "status": "skipped"},
            {"name": "correcting", "status": "skipped"},
            {"name": "executing", "status": "skipped"},
            {"name": "answering", "status": "done", "detail": "mock"},
        ],
        "rephrased_question": None,
    }


def _mock_eod(date_str: str) -> dict:
    return {
        "date": date_str,
        "summary_text": (
            "Relax Corner had a solid trading day. CoolDrinks and Snacks drove the majority of footfall. "
            "Ice cream sales peaked between 3PM–6PM suggesting afternoon customer traffic. "
            "UPI was the preferred payment method (62% of transactions)."
        ),
        "highlights": [
            "💰 Gross Revenue: ₹4,280 across 38 bills",
            "📈 Net Profit: ₹1,024 (23.9% margin)",
            "🏆 Top Product: Coca-Cola 250ml Can",
            "💳 Payment Split: Cash 30% | UPI 62% | Card 8%",
        ],
        "recommendations": [
            "Restock Amul Chocobar and Red Bull — both below 5 units",
            "Consider promoting Dairy items during morning hours (low sales recorded)",
            "Ice cream sales peak 3–6PM — ensure freezer is fully stocked by noon",
        ],
        "is_mock": True,
    }
