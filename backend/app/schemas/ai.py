from typing import Optional, List, Any
from pydantic import BaseModel


class AIQueryRequest(BaseModel):
    question: str
    tenant_id: str
    thread_id: Optional[str] = None


class PipelineStage(BaseModel):
    name: str
    status: str
    detail: Optional[str] = None


class AIQueryResponse(BaseModel):
    question: str
    answer: str
    sql_used: Optional[str] = None
    data: Optional[Any] = None
    is_mock: bool = True
    stages: Optional[List[PipelineStage]] = None
    thread_id: Optional[str] = None
    rephrased_question: Optional[str] = None


class EODSummaryResponse(BaseModel):
    date: str
    summary_text: str
    highlights: List[str]
    recommendations: List[str]
    is_mock: bool = True


class AIThreadCreate(BaseModel):
    tenant_id: str
    title: Optional[str] = None


class AIThreadResponse(BaseModel):
    id: str
    tenant_id: str
    title: str
    created_at: str
    updated_at: str


class AIMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    sql_used: Optional[str] = None
    stages: Optional[List[Any]] = None
    created_at: str
