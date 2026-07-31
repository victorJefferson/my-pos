"""Helpers for AI chat threads / messages (tenant + Clerk user scoped)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select, col

from app.models.ai_chat import AiMessage, AiMessageRole, AiThread

HISTORY_LIMIT = 6  # last 3 Q&A pairs


def _parse_uuid(value: str, label: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {label}") from exc


def create_thread(db: Session, tenant_id: str, clerk_user_id: str, title: str = "New chat") -> AiThread:
    tid = _parse_uuid(tenant_id, "tenant_id")
    thread = AiThread(
        tenant_id=tid,
        clerk_user_id=clerk_user_id,
        title=(title or "New chat")[:200],
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def list_threads(db: Session, tenant_id: str, clerk_user_id: str, limit: int = 50) -> list[AiThread]:
    tid = _parse_uuid(tenant_id, "tenant_id")
    return list(
        db.exec(
            select(AiThread)
            .where(
                AiThread.tenant_id == tid,
                AiThread.clerk_user_id == clerk_user_id,
            )
            .order_by(col(AiThread.updated_at).desc())
            .limit(limit)
        ).all()
    )


def get_thread_for_user(
    db: Session,
    thread_id: str,
    tenant_id: str,
    clerk_user_id: str,
) -> AiThread:
    tid = _parse_uuid(tenant_id, "tenant_id")
    th_id = _parse_uuid(thread_id, "thread_id")
    thread = db.exec(
        select(AiThread).where(
            AiThread.id == th_id,
            AiThread.tenant_id == tid,
            AiThread.clerk_user_id == clerk_user_id,
        )
    ).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


def delete_thread(db: Session, thread_id: str, tenant_id: str, clerk_user_id: str) -> None:
    thread = get_thread_for_user(db, thread_id, tenant_id, clerk_user_id)
    messages = db.exec(select(AiMessage).where(AiMessage.thread_id == thread.id)).all()
    for m in messages:
        db.delete(m)
    db.delete(thread)
    db.commit()


def list_messages(db: Session, thread_id: str, tenant_id: str, clerk_user_id: str) -> list[AiMessage]:
    thread = get_thread_for_user(db, thread_id, tenant_id, clerk_user_id)
    return list(
        db.exec(
            select(AiMessage)
            .where(AiMessage.thread_id == thread.id)
            .order_by(col(AiMessage.created_at).asc())
        ).all()
    )


def load_recent_history(
    db: Session,
    thread_id: uuid.UUID,
    *,
    limit: int = HISTORY_LIMIT,
) -> list[dict[str, str]]:
    rows = list(
        db.exec(
            select(AiMessage)
            .where(AiMessage.thread_id == thread_id)
            .order_by(col(AiMessage.created_at).desc())
            .limit(limit)
        ).all()
    )
    rows.reverse()
    return [{"role": m.role.value if hasattr(m.role, "value") else str(m.role), "content": m.content} for m in rows]


def append_turn(
    db: Session,
    *,
    thread: AiThread,
    question: str,
    answer: str,
    sql_used: Optional[str] = None,
    stages: Optional[list[dict[str, Any]]] = None,
) -> None:
    """Persist user + assistant messages; never raises to caller — logs via return False."""
    try:
        capped_stages = None
        if stages:
            capped_stages = [
                {
                    "name": s.get("name"),
                    "status": s.get("status"),
                    "detail": (s.get("detail") or "")[:300] or None,
                }
                for s in stages
            ]

        user_msg = AiMessage(
            thread_id=thread.id,
            tenant_id=thread.tenant_id,
            role=AiMessageRole.USER,
            content=question,
        )
        assistant_msg = AiMessage(
            thread_id=thread.id,
            tenant_id=thread.tenant_id,
            role=AiMessageRole.ASSISTANT,
            content=answer,
            sql_used=sql_used,
            stages_json=capped_stages,
        )
        thread.updated_at = datetime.utcnow()
        if thread.title in ("New chat", "") and question.strip():
            thread.title = question.strip()[:80]

        db.add(user_msg)
        db.add(assistant_msg)
        db.add(thread)
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[AI chat] Failed to persist messages: {exc}")
