"""Vehicle API endpoints."""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.vehicle_service import VehicleService
from ..models.schemas import VehicleResponse, VehicleListResponse, SeriesCount

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])


@router.get("", response_model=VehicleListResponse)
def list_vehicles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=5000),
    series: Optional[str] = None,
    fuel_type: Optional[str] = None,
    body_type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get paginated list of vehicles."""
    service = VehicleService(db)
    vehicles, total = service.get_all(
        page=page,
        page_size=page_size,
        series=series,
        fuel_type=fuel_type,
        body_type=body_type,
        search=search,
    )

    total_pages = (total + page_size - 1) // page_size

    return VehicleListResponse(
        items=[VehicleResponse(**v.to_dict()) for v in vehicles],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/series", response_model=list[SeriesCount])
def list_series(db: Session = Depends(get_db)):
    """Get all vehicle series with counts."""
    service = VehicleService(db)
    return service.get_series()


@router.get("/search")
def search_vehicles(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Search vehicles by text query."""
    service = VehicleService(db)
    vehicles = service.search(q, limit)
    return [VehicleResponse(**v.to_dict()) for v in vehicles]


@router.get("/{vin}", response_model=VehicleResponse)
def get_vehicle(vin: str, db: Session = Depends(get_db)):
    """Get a single vehicle by VIN."""
    service = VehicleService(db)
    vehicle = service.get_by_vin(vin)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return VehicleResponse(**vehicle.to_dict())
