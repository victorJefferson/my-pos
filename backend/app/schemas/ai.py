from typing import Optional, List, Any
from pydantic import BaseModel


class AIQueryRequest(BaseModel):
    question: str
    tenant_id: str


class AIQueryResponse(BaseModel):
    question: str
    answer: str
    sql_used: Optional[str] = None
    data: Optional[List[Any]] = None
    is_mock: bool = True


class EODSummaryResponse(BaseModel):
    date: str
    summary_text: str
    highlights: List[str]
    recommendations: List[str]
    is_mock: bool = True
