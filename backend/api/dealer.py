"""Dealer-specific API for the dealer product page."""

import json
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.vehicle import Vehicle

router = APIRouter(prefix="/api/dealer", tags=["dealer"])

INVENTORY_META_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "inventory_meta.json"


def _detect_language(lat: float | None, lon: float | None, dealer_name: str) -> str:
    """Detect primary language from dealer coordinates / name.

    Swiss language regions:
    - Italian (Ticino): south of Alps, lon > 8.0 and lat < 46.5
    - French (Romandie): western Switzerland, lon < 7.2
    - German: everything else (default)
    """
    if lat and lon:
        # Ticino — Italian
        if lat < 46.5 and lon > 8.0:
            return "it"
        # Romandie — French (Geneva, Lausanne, Neuchâtel, western Fribourg/Valais)
        if lon < 7.2:
            return "fr"
    # Name heuristics for border cases
    name_lower = dealer_name.lower()
    if any(w in name_lower for w in ["genève", "geneve", "lausanne", "fribourg", "sion", "neuchâtel", "neuchatel"]):
        return "fr"
    if any(w in name_lower for w in ["bellinzona", "lugano", "locarno", "minusio", "biasca", "chiasso", "torretta"]):
        return "it"
    return "de"


# Dealer group mapping: only obviously same company (same brand name)
DEALER_GROUPS = {
    "Dimab": [
        "Dimab SA",
        "Dimab Rossens SA",
        "Dimab Riviera SA",
        "Dimab Chablais SA",
    ],
    "Garage Torretta": [
        "Garage Torretta SA Bellinzona",
        "Garage Torretta SA Biasca",
        "Garage Torretta SA Minusio",
    ],
    "Sepp Fässler": [
        "Sepp Fässler AG",
        "Sepp Fässler (Wil) AG",
    ],
}

# Build reverse lookup: dealer_name → group name
_DEALER_TO_GROUP = {}
for group, members in DEALER_GROUPS.items():
    for m in members:
        _DEALER_TO_GROUP[m] = group


def _get_group_members(name: str) -> list[str]:
    """Get all dealer_name values for a group or single dealer."""
    if name in DEALER_GROUPS:
        return DEALER_GROUPS[name]
    # Check if it's a group member name — return all siblings
    if name in _DEALER_TO_GROUP:
        return DEALER_GROUPS[_DEALER_TO_GROUP[name]]
    # Single dealer
    return [name]


def _get_group_display_name(dealer_name: str) -> str:
    """Get the group display name for a dealer."""
    return _DEALER_TO_GROUP.get(dealer_name, dealer_name)


@router.get("/info")
def get_dealer_info(name: str = Query(..., description="Dealer or group name"), db: Session = Depends(get_db)):
    """Get dealer-specific stats and sample vehicles for the dealer product page."""
    members = _get_group_members(name)
    display_name = name if name in DEALER_GROUPS else _get_group_display_name(name)

    # Vehicle count
    vehicle_count = (
        db.query(func.count(Vehicle.vin))
        .filter(Vehicle.dealer_name.in_(members))
        .scalar() or 0
    )

    if vehicle_count == 0:
        return {"found": False, "dealer_name": display_name}

    # Locations
    location_rows = (
        db.query(Vehicle.dealer_name, Vehicle.dealer_id, Vehicle.dealer_latitude, Vehicle.dealer_longitude)
        .filter(Vehicle.dealer_name.in_(members))
        .distinct()
        .all()
    )
    locations = [{"name": r.dealer_name, "id": r.dealer_id} for r in location_rows]

    # Detect language from first location's coordinates
    first_loc = location_rows[0] if location_rows else None
    language = _detect_language(
        first_loc.dealer_latitude if first_loc else None,
        first_loc.dealer_longitude if first_loc else None,
        display_name,
    )

    # Series breakdown
    series_rows = (
        db.query(Vehicle.series, func.count(Vehicle.vin))
        .filter(Vehicle.dealer_name.in_(members), Vehicle.series.isnot(None))
        .group_by(Vehicle.series)
        .order_by(func.count(Vehicle.vin).desc())
        .all()
    )

    # Fuel type breakdown
    fuel_rows = (
        db.query(Vehicle.fuel_type, func.count(Vehicle.vin))
        .filter(Vehicle.dealer_name.in_(members), Vehicle.fuel_type.isnot(None))
        .group_by(Vehicle.fuel_type)
        .order_by(func.count(Vehicle.vin).desc())
        .all()
    )

    # Price range
    price_min = db.query(func.min(Vehicle.price_offer)).filter(
        Vehicle.dealer_name.in_(members), Vehicle.price_offer.isnot(None)
    ).scalar()
    price_max = db.query(func.max(Vehicle.price_offer)).filter(
        Vehicle.dealer_name.in_(members), Vehicle.price_offer.isnot(None)
    ).scalar()

    # Sample vehicles (top 6 by price, with images)
    samples = (
        db.query(Vehicle)
        .filter(Vehicle.dealer_name.in_(members), Vehicle.image.isnot(None), Vehicle.image != "")
        .order_by(Vehicle.price_offer.desc().nullslast())
        .limit(6)
        .all()
    )

    sample_vehicles = [
        {
            "vin": v.vin,
            "name": v.name,
            "series": v.series,
            "fuel_type": v.fuel_type,
            "color": v.color,
            "price": v.price,
            "price_offer": v.price_offer,
            "image": v.image,
        }
        for v in samples
    ]

    # Last updated
    last_updated = None
    if INVENTORY_META_PATH.exists():
        try:
            meta = json.loads(INVENTORY_META_PATH.read_text())
            last_updated = meta.get("last_updated")
        except Exception:
            pass

    return {
        "found": True,
        "dealer_name": display_name,
        "language": language,
        "locations": locations,
        "location_count": len(locations),
        "vehicle_count": vehicle_count,
        "series": [{"name": s, "count": c} for s, c in series_rows],
        "fuel_types": {ft: c for ft, c in fuel_rows},
        "price_range": {"min": price_min, "max": price_max},
        "sample_vehicles": sample_vehicles,
        "last_updated": last_updated,
    }


@router.get("/groups")
def get_dealer_groups(db: Session = Depends(get_db)):
    """Get all dealer groups with vehicle counts for the picker page."""
    # Get all dealers with counts
    rows = (
        db.query(
            Vehicle.dealer_name,
            func.count(Vehicle.vin).label("count"),
        )
        .filter(Vehicle.dealer_name.isnot(None))
        .group_by(Vehicle.dealer_name)
        .all()
    )

    # Build per-dealer counts
    dealer_counts = {r.dealer_name: r.count for r in rows}

    # Aggregate into groups
    groups: dict[str, dict] = {}
    assigned = set()

    for group_name, members in DEALER_GROUPS.items():
        total = 0
        locs = []
        for m in members:
            if m in dealer_counts:
                total += dealer_counts[m]
                locs.append(m)
                assigned.add(m)
        if total > 0:
            groups[group_name] = {
                "name": group_name,
                "vehicle_count": total,
                "location_count": len(locs),
                "locations": locs,
            }

    # Add standalone dealers
    for dealer_name, count in dealer_counts.items():
        if dealer_name not in assigned:
            groups[dealer_name] = {
                "name": dealer_name,
                "vehicle_count": count,
                "location_count": 1,
                "locations": [dealer_name],
            }

    # Sort by vehicle count descending
    result = sorted(groups.values(), key=lambda x: -x["vehicle_count"])
    return result
