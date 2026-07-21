import numpy as np
from uuid import UUID
from sqlmodel import Session, select
from app.models.embeddings import ProductEmbedding

def cosine_similarity(v1, v2):
    dot_product = np.dot(v1, v2)
    norm_v1 = np.linalg.norm(v1)
    norm_v2 = np.linalg.norm(v2)
    if norm_v1 == 0 or norm_v2 == 0:
        return 0.0
    return dot_product / (norm_v1 * norm_v2)

def recognize_product(db: Session, tenant_id: UUID, target_vector: list[float], threshold: float = 0.6):
    """
    Find the closest matching product for a given vector using cosine similarity.
    Returns (product_id, confidence) or (None, 0.0).
    """
    # Fetch all embeddings for this tenant
    # For a production system with millions of products, we'd use pgvector or FAISS.
    # For a POS system with a few thousand products, in-memory numpy is blazingly fast.
    statement = select(ProductEmbedding).where(ProductEmbedding.tenant_id == tenant_id)
    embeddings = db.exec(statement).all()

    if not embeddings:
        return None, 0.0

    target_np = np.array(target_vector, dtype=np.float32)
    
    best_match = None
    best_score = -1.0

    for emb in embeddings:
        emb_np = np.array(emb.vector, dtype=np.float32)
        score = cosine_similarity(target_np, emb_np)
        if score > best_score:
            best_score = float(score)
            best_match = emb.product_id

    if best_score >= threshold:
        return best_match, best_score
    
    return best_match, best_score  # Returning even if below threshold, let frontend handle it
