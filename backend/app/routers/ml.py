from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlmodel import select
from uuid import UUID
from typing import List

from app.database import get_session
from app.auth import get_current_user
from app.models.embeddings import ProductEmbedding
from app.models.product import Product
from app.services.vision import recognize_product

router = APIRouter(prefix="/ml", tags=["ML"])

class RecognizeRequest(BaseModel):
    vector: List[float]

class RecognizeResponse(BaseModel):
    product: dict | None = None
    confidence: float

class TeachRequest(BaseModel):
    product_id: UUID
    vector: List[float]

@router.post("/recognize", response_model=RecognizeResponse, dependencies=[Depends(get_current_user)])
def recognize(
    request: RecognizeRequest,
    tenant_id: UUID,
    db: Session = Depends(get_session)
):
    """
    Finds the closest matching product given a feature vector.
    """
    best_match_id, confidence = recognize_product(db, tenant_id, request.vector)
    
    if best_match_id is None:
        return RecognizeResponse(product=None, confidence=0.0)
    
    # Fetch the product details
    product = db.get(Product, best_match_id)
    if not product or product.tenant_id != tenant_id:
        return RecognizeResponse(product=None, confidence=0.0)

    # Return product dict mapping
    return RecognizeResponse(
        product=product.model_dump(),
        confidence=confidence
    )

@router.post("/teach", dependencies=[Depends(get_current_user)])
def teach(
    request: TeachRequest,
    tenant_id: UUID,
    db: Session = Depends(get_session)
):
    """
    Saves a feature vector for a specific product.
    """
    # Verify product exists and belongs to tenant
    product = db.get(Product, request.product_id)
    if not product or product.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Product not found")

    embedding = ProductEmbedding(
        tenant_id=tenant_id,
        product_id=request.product_id,
        vector=request.vector
    )
    db.add(embedding)
    db.commit()
    return {"status": "success"}
