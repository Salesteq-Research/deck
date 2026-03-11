"""Inventory API endpoints for stock dashboard."""

import json
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.vehicle import Vehicle

router = APIRouter(prefix="/api/inventory", tags=["inventory"])

INVENTORY_META_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "inventory_meta.json"


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Get aggregated inventory statistics."""
    total = db.query(func.count(Vehicle.vin)).scalar() or 0
    dealer_count = db.query(func.count(func.distinct(Vehicle.dealer_name))).scalar() or 0

    # Fuel type breakdown
    fuel_rows = (
        db.query(Vehicle.fuel_type, func.count(Vehicle.vin))
        .filter(Vehicle.fuel_type.isnot(None))
        .group_by(Vehicle.fuel_type)
        .all()
    )
    fuel_type_breakdown = {ft: count for ft, count in fuel_rows}

    # Series breakdown
    series_rows = (
        db.query(Vehicle.series, func.count(Vehicle.vin))
        .filter(Vehicle.series.isnot(None))
        .group_by(Vehicle.series)
        .order_by(func.count(Vehicle.vin).desc())
        .all()
    )
    series_breakdown = {s: count for s, count in series_rows}

    # Price range
    price_min = db.query(func.min(Vehicle.price_offer)).filter(Vehicle.price_offer.isnot(None)).scalar()
    price_max = db.query(func.max(Vehicle.price_offer)).filter(Vehicle.price_offer.isnot(None)).scalar()
    price_avg = db.query(func.avg(Vehicle.price_offer)).filter(Vehicle.price_offer.isnot(None)).scalar()

    # Read last-updated from metadata file
    last_updated = None
    if INVENTORY_META_PATH.exists():
        try:
            meta = json.loads(INVENTORY_META_PATH.read_text())
            last_updated = meta.get("last_updated")
        except Exception:
            pass

    return {
        "total_vehicles": total,
        "dealer_count": dealer_count,
        "fuel_type_breakdown": fuel_type_breakdown,
        "series_breakdown": series_breakdown,
        "price_range": {
            "min": price_min,
            "max": price_max,
            "avg": round(price_avg, 2) if price_avg else None,
        },
        "last_updated": last_updated,
    }


@router.get("/dealers")
def get_dealers(db: Session = Depends(get_db)):
    """Get list of dealers with vehicle counts."""
    rows = (
        db.query(
            Vehicle.dealer_name,
            Vehicle.dealer_id,
            Vehicle.dealer_latitude,
            Vehicle.dealer_longitude,
            func.count(Vehicle.vin).label("count"),
        )
        .filter(Vehicle.dealer_name.isnot(None))
        .group_by(Vehicle.dealer_name, Vehicle.dealer_id, Vehicle.dealer_latitude, Vehicle.dealer_longitude)
        .order_by(Vehicle.dealer_name)
        .all()
    )
    return [
        {
            "dealer_name": r.dealer_name,
            "dealer_id": r.dealer_id,
            "latitude": r.dealer_latitude,
            "longitude": r.dealer_longitude,
            "count": r.count,
        }
        for r in rows
    ]


@router.get("/filter-options")
def get_filter_options(db: Session = Depends(get_db)):
    """Get distinct values for all filter dropdowns."""
    def distinct_values(column):
        rows = db.query(column).filter(column.isnot(None)).distinct().order_by(column).all()
        return [r[0] for r in rows]

    return {
        "series": distinct_values(Vehicle.series),
        "fuel_types": distinct_values(Vehicle.fuel_type),
        "body_types": distinct_values(Vehicle.body_type),
        "colors": distinct_values(Vehicle.color),
        "dealers": distinct_values(Vehicle.dealer_name),
        "drive_types": distinct_values(Vehicle.drive_type),
        "transmissions": distinct_values(Vehicle.transmission),
    }
