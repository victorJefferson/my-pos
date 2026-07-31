import uuid
from datetime import datetime
from typing import Optional, Any, List
from enum import Enum
from sqlalchemy import Column, JSON, Index
from sqlmodel import SQLModel, Field


class AiMessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


class AiThread(SQLModel, table=True):
    __tablename__ = "ai_threads"
    __table_args__ = (
        Index("ix_ai_threads_tenant_user_updated", "tenant_id", "clerk_user_id", "updated_at"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    clerk_user_id: str = Field(index=True, max_length=255)
    title: str = Field(default="New chat", max_length=200)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AiMessage(SQLModel, table=True):
    __tablename__ = "ai_messages"
    __table_args__ = (
        Index("ix_ai_messages_thread_created", "thread_id", "created_at"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    thread_id: uuid.UUID = Field(foreign_key="ai_threads.id", index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    role: AiMessageRole = Field(default=AiMessageRole.USER)
    content: str
    sql_used: Optional[str] = Field(default=None)
    stages_json: Optional[Any] = Field(default=None, sa_column=Column(JSON, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
