import uuid
from datetime import datetime
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON

class ProductEmbedding(SQLModel, table=True):
    __tablename__ = "product_embeddings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    product_id: uuid.UUID = Field(foreign_key="products.id", index=True)
    vector: list[float] = Field(sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
