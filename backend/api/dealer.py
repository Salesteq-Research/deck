"""Dealer-specific API for the dealer product page."""

import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.vehicle import Vehicle

# Video patterns — only models with actual generated video files
VIDEO_PATTERNS = [
    re.compile(r'\bi7\s*m70\b', re.I),          # i7-m70.mp4
    re.compile(r'\bi4\s*m50\b', re.I),          # i4-m50.mp4
    re.compile(r'\bm3\b(?!4).*\blimousine\b', re.I),  # m3-limousine.mp4
    re.compile(r'\bi7\b', re.I),                # i7.mp4
    re.compile(r'\biX\b(?!\d)', re.I),          # ix.mp4
    re.compile(r'\bx5\b', re.I),                # x5.mp4
]


def _has_video(name: str) -> bool:
    """Check if a vehicle name matches any video pattern."""
    return any(p.search(name) for p in VIDEO_PATTERNS)

router = APIRouter(prefix="/api/dealer", tags=["dealer"])

INVENTORY_META_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "inventory_meta.json"


def _detect_language(lat: float | None, lon: float | None, dealer_name: str) -> str:
    """Detect primary language from dealer coordinates / name.

    Swiss language regions:
    - Italian (Ticino): south of Alps, lon > 8.0 and lat < 46.5
    - French (Romandie): western Switzerland, lon < 7.2
    - French (Valais): Rhone valley, lat < 46.5 and 7.2 <= lon < 7.6
    - German: everything else (default)
    """
    if lat and lon:
        # Ticino — Italian
        if lat < 46.5 and lon > 8.0:
            return "it"
        # Romandie — French (Geneva, Lausanne, Neuchâtel, western Fribourg/Valais)
        if lon < 7.2:
            return "fr"
        # French-speaking Valais — Rhone valley (Sion, Sierre, Martigny, Monthey)
        # lat < 46.5 avoids catching Bern (~46.95) while covering the valley
        if lat < 46.5 and lon < 7.6:
            return "fr"
    # Name heuristics for border cases
    name_lower = dealer_name.lower()
    if any(w in name_lower for w in [
        "genève", "geneve", "lausanne", "fribourg", "sion", "neuchâtel", "neuchatel",
        "facchinetti", "urfer", "monthey", "sierre", "martigny", "brig",
    ]):
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
    "Facchinetti": [
        "Facchinetti Automobiles",
        "Facchinetti Automobiles SA",
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

    # Locations — distinct on dealer_id to avoid lat/lon duplicates
    location_rows = (
        db.query(Vehicle.dealer_name, Vehicle.dealer_id)
        .filter(Vehicle.dealer_name.in_(members))
        .distinct()
        .all()
    )
    locations = [{"name": r.dealer_name, "id": r.dealer_id} for r in location_rows]

    # Detect language from first location's coordinates
    first_coords = (
        db.query(Vehicle.dealer_latitude, Vehicle.dealer_longitude)
        .filter(Vehicle.dealer_name.in_(members), Vehicle.dealer_latitude.isnot(None))
        .first()
    )
    language = _detect_language(
        first_coords.dealer_latitude if first_coords else None,
        first_coords.dealer_longitude if first_coords else None,
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

    # Sample vehicles — prioritize models with cinematic videos, then by price
    all_dealer_vehicles = (
        db.query(Vehicle)
        .filter(Vehicle.dealer_name.in_(members), Vehicle.image.isnot(None), Vehicle.image != "")
        .order_by(Vehicle.price_offer.desc().nullslast())
        .all()
    )
    with_video = [v for v in all_dealer_vehicles if _has_video(v.name)]
    without_video = [v for v in all_dealer_vehicles if not _has_video(v.name)]
    # Deduplicate by model name — pick one per unique model for variety
    seen_models = set()
    samples = []
    for v in with_video + without_video:
        # Normalize: strip VIN-like suffixes, use base model name
        model_key = v.name.strip().lower()
        if model_key not in seen_models:
            seen_models.add(model_key)
            samples.append(v)
        if len(samples) >= 6:
            break
    # If not enough unique models, fill with remaining
    if len(samples) < 6:
        for v in with_video + without_video:
            if v not in samples:
                samples.append(v)
            if len(samples) >= 6:
                break

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
