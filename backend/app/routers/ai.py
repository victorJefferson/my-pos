from datetime import date
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_session
from app.auth import get_current_user
from app.schemas.ai import (
    AIQueryRequest,
    AIQueryResponse,
    EODSummaryResponse,
    AIThreadCreate,
    AIThreadResponse,
    AIMessageResponse,
)
from app.services import llm_service
from app.services import chat_history

router = APIRouter(prefix="/ai", tags=["ai"])


class AIStatusResponse(BaseModel):
    groq_configured: bool


@router.get("/status", response_model=AIStatusResponse)
def ai_status(user: dict = Depends(get_current_user)):
    """Whether GROQ_API_KEY is set — used by the UI for Mock vs Live badge."""
    return AIStatusResponse(groq_configured=llm_service._is_configured())


def _thread_to_response(thread) -> AIThreadResponse:
    return AIThreadResponse(
        id=str(thread.id),
        tenant_id=str(thread.tenant_id),
        title=thread.title,
        created_at=thread.created_at.isoformat(),
        updated_at=thread.updated_at.isoformat(),
    )


def _message_to_response(msg) -> AIMessageResponse:
    role = msg.role.value if hasattr(msg.role, "value") else str(msg.role)
    return AIMessageResponse(
        id=str(msg.id),
        role=role,
        content=msg.content,
        sql_used=msg.sql_used,
        stages=msg.stages_json,
        created_at=msg.created_at.isoformat(),
    )


@router.get("/threads", response_model=list[AIThreadResponse])
def list_threads(
    tenant_id: str,
    db: Session = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    clerk_user_id = user["sub"]
    threads = chat_history.list_threads(db, tenant_id, clerk_user_id)
    return [_thread_to_response(t) for t in threads]


@router.post("/threads", response_model=AIThreadResponse)
def create_thread(
    payload: AIThreadCreate,
    db: Session = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    clerk_user_id = user["sub"]
    thread = chat_history.create_thread(
        db,
        tenant_id=payload.tenant_id,
        clerk_user_id=clerk_user_id,
        title=payload.title or "New chat",
    )
    return _thread_to_response(thread)


@router.get("/threads/{thread_id}/messages", response_model=list[AIMessageResponse])
def get_thread_messages(
    thread_id: str,
    tenant_id: str,
    db: Session = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    clerk_user_id = user["sub"]
    messages = chat_history.list_messages(db, thread_id, tenant_id, clerk_user_id)
    return [_message_to_response(m) for m in messages]


@router.delete("/threads/{thread_id}")
def delete_thread(
    thread_id: str,
    tenant_id: str,
    db: Session = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    clerk_user_id = user["sub"]
    chat_history.delete_thread(db, thread_id, tenant_id, clerk_user_id)
    return {"ok": True}


@router.post("/query", response_model=AIQueryResponse)
def ai_query(
    payload: AIQueryRequest,
    db: Session = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """
    Natural language analytics via Text-to-SQL.
    Optional thread_id enables Wren-style rephrase from recent history and persists turns.
    """
    clerk_user_id = user["sub"]
    tenant_id = str(payload.tenant_id)

    if payload.thread_id:
        thread = chat_history.get_thread_for_user(
            db, payload.thread_id, tenant_id, clerk_user_id
        )
    else:
        title = (payload.question or "New chat").strip()[:80] or "New chat"
        thread = chat_history.create_thread(
            db, tenant_id=tenant_id, clerk_user_id=clerk_user_id, title=title
        )

    history = chat_history.load_recent_history(db, thread.id)

    result = llm_service.query_natural_language(
        question=payload.question,
        tenant_id=tenant_id,
        db=db,
        history=history,
    )
    result["thread_id"] = str(thread.id)

    chat_history.append_turn(
        db,
        thread=thread,
        question=payload.question,
        answer=result.get("answer") or "",
        sql_used=result.get("sql_used"),
        stages=result.get("stages"),
    )

    return AIQueryResponse(**result)


@router.get("/eod-summary", response_model=EODSummaryResponse)
def eod_summary(
    tenant_id: str,
    target_date: str = None,
    db: Session = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """
    End-of-day executive summary.
    Uses Groq with real daily metrics when GROQ_API_KEY is set.
    """
    date_str = target_date or date.today().isoformat()
    result = llm_service.generate_eod_summary(
        tenant_id=tenant_id,
        date_str=date_str,
        db=db,
    )
    return EODSummaryResponse(**result)
