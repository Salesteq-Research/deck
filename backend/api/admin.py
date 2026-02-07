"""Admin API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db, import_vehicles_from_json
from ..services.vehicle_service import VehicleService
from ..services.rag_service import RAGService

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Get vehicle statistics."""
    service = VehicleService(db)
    return service.get_stats()


@router.post("/import")
def import_vehicles(db: Session = Depends(get_db)):
    """Import vehicles from JSON file into database."""
    try:
        count = import_vehicles_from_json(db=db)
        return {"status": "success", "imported": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reindex")
def reindex_vehicles(db: Session = Depends(get_db)):
    """Reindex vehicles for RAG search."""
    try:
        rag_service = RAGService(db)
        count = rag_service.index_vehicles()
        return {"status": "success", "indexed": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rag-stats")
def get_rag_stats(db: Session = Depends(get_db)):
    """Get RAG index statistics."""
    try:
        rag_service = RAGService(db)
        return rag_service.get_stats()
    except Exception as e:
        return {"error": str(e), "indexed_vehicles": 0}
