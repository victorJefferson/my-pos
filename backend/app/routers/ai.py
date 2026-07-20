from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_session
from app.auth import get_current_user
from app.schemas.ai import AIQueryRequest, AIQueryResponse, EODSummaryResponse
from app.services import llm_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/query", response_model=AIQueryResponse, dependencies=[Depends(get_current_user)])
def ai_query(payload: AIQueryRequest, db: Session = Depends(get_session)):
    """
    Natural language analytics query.
    Phase 1: Returns mock response.
    Phase 2: Calls Gemini API with Text-to-SQL (set GEMINI_API_KEY in .env).
    """
    result = llm_service.query_natural_language(
        question=payload.question,
        tenant_id=str(payload.tenant_id),
    )
    return AIQueryResponse(**result)


@router.get("/eod-summary", response_model=EODSummaryResponse, dependencies=[Depends(get_current_user)])
def eod_summary(
    tenant_id: str,
    target_date: str = None,
    db: Session = Depends(get_session),
):
    """
    End-of-day executive summary.
    Phase 1: Returns mock response.
    Phase 2: Calls Gemini API with actual daily metrics.
    """
    date_str = target_date or date.today().isoformat()
    result = llm_service.generate_eod_summary(
        tenant_id=tenant_id,
        date_str=date_str,
    )
    return EODSummaryResponse(**result)
