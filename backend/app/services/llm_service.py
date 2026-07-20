import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


def _is_configured() -> bool:
    return bool(GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here")


def query_natural_language(question: str, tenant_id: str, db_context: Optional[str] = None) -> dict:
    """
    Phase 2: Replace mock with real Gemini API call.
    
    When GEMINI_API_KEY is set, this will:
    1. Build a Text-to-SQL prompt with schema context
    2. Call gemini-1.5-flash (free tier) via google-genai SDK
    3. Execute the generated SQL against the DB
    4. Return formatted results
    
    Example (Phase 2 code):
    -------------------------
    import google.generativeai as genai
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash')
    prompt = f"Given this schema: {db_context}, answer: {question}. Return SQL only."
    response = model.generate_content(prompt)
    sql = response.text.strip()
    # execute sql...
    """
    if _is_configured():
        # TODO (Phase 2): implement real Gemini call here
        return {
            "question": question,
            "answer": "Gemini API key is set but Phase 2 integration is pending. Coming soon!",
            "sql_used": None,
            "data": None,
            "is_mock": False,
        }

    # --- MOCK RESPONSE (Phase 1) ---
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
        answer = f"[Mock] I would analyze your question: '{question}'. Set GEMINI_API_KEY in .env to enable real AI analytics powered by Gemini."

    return {
        "question": question,
        "answer": answer,
        "sql_used": "SELECT -- mock SQL -- FROM sales WHERE tenant_id = :tenant_id",
        "data": None,
        "is_mock": True,
    }


def generate_eod_summary(tenant_id: str, date_str: str, metrics: Optional[dict] = None) -> dict:
    """
    Phase 2: Generate an executive end-of-day summary via Gemini.
    Uses gemini-1.5-flash (free tier, ~1500 requests/day).
    """
    if _is_configured() and metrics:
        # TODO (Phase 2): implement real Gemini EOD summary
        pass

    # --- MOCK RESPONSE (Phase 1) ---
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
