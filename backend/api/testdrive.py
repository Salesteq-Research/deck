"""Test Drive Booking API — model catalog + AI-guided booking flow."""

import json
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.testdrive_agent import TestDriveAgentService
from ..services.lead_service import upsert_lead
from ..models.backoffice import TestDriveBooking
from ..models.schemas import ChatRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/testdrive", tags=["testdrive"])

# ── Load model catalog from JSON (in-memory, not DB) ─────────

_models_cache: list[dict] | None = None


def _load_models() -> list[dict]:
    global _models_cache
    if _models_cache is not None:
        return _models_cache
    catalog_path = Path(__file__).parent.parent.parent / "data" / "test_drive_models.json"
    if catalog_path.exists():
        with open(catalog_path) as f:
            _models_cache = json.load(f)
    else:
        _models_cache = []
    logger.info(f"Loaded {len(_models_cache)} test drive models from catalog")
    return _models_cache


# ── Chat / Booking Flow ──────────────────────────────────────

@router.post("/chat/stream")
def testdrive_chat_stream(request: ChatRequest, db: Session = Depends(get_db)):
    """SSE streaming chat for test drive booking flow."""
    models = _load_models()

    def generate():
        agent = TestDriveAgentService(db, models)
        conversation_history = [
            {"role": msg.role, "content": msg.content}
            for msg in request.conversation_history
        ]

        full_text = ""
        shown_model_ids = []

        for event in agent.chat_stream(
            message=request.message,
            conversation_history=conversation_history,
            session_id=request.session_id,
        ):
            if event["type"] == "tool_call":
                yield f"data: {json.dumps({'type': 'tool_call', 'name': event['name']})}\n\n"

            elif event["type"] == "text_delta":
                full_text += event["content"]
                yield f"data: {json.dumps({'type': 'text', 'content': event['content']})}\n\n"

            elif event["type"] == "models":
                model_ids = event.get("model_ids", [])
                cards = []
                for mid in model_ids[:5]:
                    m = next((x for x in models if x["id"] == mid), None)
                    if m:
                        cards.append(_model_to_card(m))
                        shown_model_ids.append(mid)
                if cards:
                    yield f"data: {json.dumps({'type': 'vehicles', 'vehicles': cards})}\n\n"

            elif event["type"] == "done":
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

        # Capture as lead
        if request.session_id and full_text:
            try:
                import re
                clean_text = re.sub(r"\s*\[RECOMMEND:[^\]]*\]\s*", "", full_text).strip()
                upsert_lead(db, request.session_id, request.message, clean_text, shown_model_ids)
                db.commit()
            except Exception as e:
                logger.warning(f"Lead capture failed: {e}")
                db.rollback()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _model_to_card(m: dict) -> dict:
    """Convert a model catalog entry to a VehicleCard for the frontend."""
    powertrain_labels = {"electric": "Electric", "hybrid": "Plug-in Hybrid", "gasoline": "Gasoline", "diesel": "Diesel"}
    return {
        "vin": m["id"],
        "name": m["name"],
        "series": m.get("series", ""),
        "body_type": m.get("body_type", ""),
        "fuel_type": powertrain_labels.get(m.get("powertrain", ""), ""),
        "color": m.get("highlight", ""),
        "price": f"ab CHF {m.get('starting_price', 0):,.0f}".replace(",", "'"),
        "price_offer": m.get("starting_price"),
        "monthly_installment": None,
        "currency": "CHF",
        "image": m.get("image", ""),
        "images": [m["image"]] if m.get("image") else [],
        "dealer_name": None,
        "url": m.get("url", ""),
    }


# ── Bookings ─────────────────────────────────────────────────

@router.get("/bookings")
def get_bookings(limit: int = 20, db: Session = Depends(get_db)):
    """Get recent test drive bookings."""
    bookings = (
        db.query(TestDriveBooking)
        .order_by(TestDriveBooking.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": b.id,
            "booking_ref": b.booking_ref,
            "vehicle_name": b.vehicle_name,
            "series": b.series,
            "customer_name": f"{b.first_name} {b.last_name}".strip(),
            "email": b.email,
            "phone": b.phone,
            "dealer_name": b.dealer_name,
            "preferred_date": b.preferred_date,
            "time_preference": b.time_preference,
            "status": b.status,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        }
        for b in bookings
    ]


@router.get("/stats")
def get_testdrive_stats(db: Session = Depends(get_db)):
    """Get test drive booking statistics."""
    total = db.query(TestDriveBooking).count()
    confirmed = db.query(TestDriveBooking).filter(TestDriveBooking.status == "confirmed").count()
    pending = db.query(TestDriveBooking).filter(TestDriveBooking.status == "pending").count()

    return {
        "total_bookings": total,
        "confirmed": confirmed,
        "pending": pending,
    }


# ── Model Catalog API (serves from JSON, not DB) ─────────────

@router.get("/vehicles")
def get_testdrive_models(
    series: str = Query(None),
    powertrain: str = Query(None),
    body_type: str = Query(None),
    search: str = Query(None),
):
    """Get BMW test drive model catalog."""
    models = _load_models()
    result = models

    if series:
        result = [m for m in result if m.get("series", "").lower() == series.lower()]
    if powertrain:
        result = [m for m in result if m.get("powertrain", "").lower() == powertrain.lower()]
    if body_type:
        result = [m for m in result if m.get("body_type", "").lower() == body_type.lower()]
    if search:
        q = search.lower()
        result = [m for m in result if q in m.get("name", "").lower() or q in m.get("series", "").lower() or q in m.get("highlight", "").lower()]

    return {
        "items": result,
        "total": len(result),
    }


@router.get("/vehicles/stats")
def get_testdrive_model_stats():
    """Get statistics for the test drive model catalog."""
    models = _load_models()

    series_count: dict[str, int] = {}
    powertrain_count: dict[str, int] = {}
    body_count: dict[str, int] = {}
    prices = []

    for m in models:
        s = m.get("series", "Other")
        series_count[s] = series_count.get(s, 0) + 1
        p = m.get("powertrain", "other")
        powertrain_count[p] = powertrain_count.get(p, 0) + 1
        b = m.get("body_type", "Other")
        body_count[b] = body_count.get(b, 0) + 1
        if m.get("starting_price"):
            prices.append(m["starting_price"])

    return {
        "total_vehicles": len(models),
        "series_breakdown": dict(sorted(series_count.items(), key=lambda x: -x[1])),
        "powertrain_breakdown": powertrain_count,
        "body_type_breakdown": dict(sorted(body_count.items(), key=lambda x: -x[1])),
        "price_range": {
            "min": min(prices) if prices else None,
            "max": max(prices) if prices else None,
            "avg": round(sum(prices) / len(prices), 0) if prices else None,
        },
    }


@router.get("/vehicles/filter-options")
def get_testdrive_model_filter_options():
    """Get distinct filter values for the test drive model catalog."""
    models = _load_models()

    return {
        "series": sorted(set(m.get("series", "") for m in models if m.get("series"))),
        "powertrains": sorted(set(m.get("powertrain", "") for m in models if m.get("powertrain"))),
        "body_types": sorted(set(m.get("body_type", "") for m in models if m.get("body_type"))),
    }
