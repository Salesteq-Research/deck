"""Test Drive Booking API — dedicated AI-guided booking flow."""

import json
import logging
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.testdrive_agent import TestDriveAgentService
from ..services.lead_service import upsert_lead
from ..models.vehicle import Vehicle
from ..models.backoffice import TestDriveBooking
from ..models.schemas import ChatRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/testdrive", tags=["testdrive"])


def _vehicle_card(v: Vehicle) -> dict:
    return {
        "vin": v.vin,
        "name": v.name,
        "series": v.series,
        "body_type": v.body_type,
        "fuel_type": v.fuel_type,
        "color": v.color,
        "price": v.price,
        "price_offer": v.price_offer,
        "monthly_installment": v.monthly_installment,
        "currency": v.currency or "CHF",
        "image": v.image,
        "images": v.images_list if hasattr(v, 'images_list') else [],
        "dealer_name": v.dealer_name,
        "url": v.url,
    }


@router.post("/chat/stream")
def testdrive_chat_stream(request: ChatRequest, db: Session = Depends(get_db)):
    """SSE streaming chat for test drive booking flow."""

    def generate():
        agent = TestDriveAgentService(db)
        conversation_history = [
            {"role": msg.role, "content": msg.content}
            for msg in request.conversation_history
        ]

        full_text = ""
        shown_vins = []

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

            elif event["type"] == "vehicles":
                vins = event["vins"]
                cards = []
                for vin in vins[:5]:
                    v = db.query(Vehicle).filter(Vehicle.vin == vin).first()
                    if v:
                        cards.append(_vehicle_card(v))
                        shown_vins.append(vin)
                yield f"data: {json.dumps({'type': 'vehicles', 'vehicles': cards})}\n\n"

            elif event["type"] == "done":
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

        # Capture as lead
        if request.session_id and full_text:
            try:
                import re
                clean_text = re.sub(r"\s*\[RECOMMEND:[^\]]*\]\s*", "", full_text).strip()
                upsert_lead(db, request.session_id, request.message, clean_text, shown_vins)
                db.commit()
            except Exception as e:
                logger.warning(f"Lead capture failed: {e}")
                db.rollback()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
