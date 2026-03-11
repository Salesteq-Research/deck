"""Chat API endpoints — powered by tool-use agent with streaming."""

import json
import logging
import re
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.customer_agent import CustomerAgentService
from ..services.lead_service import upsert_lead, upsert_conversation
from ..models.vehicle import Vehicle
from ..models.backoffice import Conversation, ConversationMessage
from ..models.schemas import ChatRequest, ChatResponse, VehicleCardResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _vehicle_card(v: Vehicle) -> dict:
    """Build a vehicle card dict from a Vehicle ORM object."""
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
        "images": v.images_list,
        "dealer_name": v.dealer_name,
        "url": v.url,
    }


@router.post("/stream")
def chat_stream(request: ChatRequest, db: Session = Depends(get_db)):
    """SSE streaming chat endpoint. Returns events as they happen."""

    # Gate: if operator is "human", store customer message and return human_mode event
    if request.session_id:
        conv = db.query(Conversation).filter(Conversation.session_id == request.session_id).first()
        if conv and conv.operator == "human":
            msg = ConversationMessage(
                conversation_id=conv.id,
                role="user",
                content=request.message,
                vehicles_shown="[]",
                sender="customer",
            )
            db.add(msg)
            conv.message_count = (conv.message_count or 0) + 1
            db.commit()

            def human_generate():
                yield f"data: {json.dumps({'type': 'human_mode'})}\n\n"

            return StreamingResponse(
                human_generate(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )

    def generate():
        agent = CustomerAgentService(db)
        conversation_history = [
            {"role": msg.role, "content": msg.content}
            for msg in request.conversation_history
        ]

        full_text = ""
        shown_vins = []

        for event in agent.chat_stream(
            message=request.message,
            conversation_history=conversation_history,
            language=request.language,
            dealer_name=request.dealer_name,
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

        # Capture lead after streaming completes
        if request.session_id and full_text:
            try:
                clean_text = re.sub(r"\s*\[RECOMMEND:[^\]]*\]\s*", "", full_text).strip()
                lead = upsert_lead(db, request.session_id, request.message, clean_text, shown_vins)
                upsert_conversation(db, request.session_id, lead, request.message, clean_text, shown_vins)
                db.commit()
            except Exception as e:
                logger.warning(f"Backoffice capture failed: {e}")
                db.rollback()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("", response_model=ChatResponse)
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """Non-streaming chat endpoint (fallback)."""

    # Gate: if operator is "human", store customer message and signal human mode
    if request.session_id:
        conv = db.query(Conversation).filter(Conversation.session_id == request.session_id).first()
        if conv and conv.operator == "human":
            msg = ConversationMessage(
                conversation_id=conv.id,
                role="user",
                content=request.message,
                vehicles_shown="[]",
                sender="customer",
            )
            db.add(msg)
            conv.message_count = (conv.message_count or 0) + 1
            db.commit()
            return ChatResponse(message="__human_mode__", vehicles=[], suggested_questions=[])

    agent = CustomerAgentService(db)

    conversation_history = [
        {"role": msg.role, "content": msg.content}
        for msg in request.conversation_history
    ]

    result = agent.chat(
        message=request.message,
        conversation_history=conversation_history,
        language=request.language,
        dealer_name=request.dealer_name,
    )

    clean_text = result["message"]
    recommended_vins = result["recommended_vins"]
    all_vins = result["all_vehicle_vins"]

    card_vins = recommended_vins if recommended_vins else all_vins[:5]
    vehicle_cards = []
    for vin in card_vins:
        v = db.query(Vehicle).filter(Vehicle.vin == vin).first()
        if v:
            vehicle_cards.append(VehicleCardResponse(**_vehicle_card(v)))

    # Capture lead
    if request.session_id:
        try:
            shown_vins = [vc.vin for vc in vehicle_cards]
            lead = upsert_lead(db, request.session_id, request.message, clean_text, shown_vins)
            upsert_conversation(db, request.session_id, lead, request.message, clean_text, shown_vins)
            db.commit()
        except Exception as e:
            logger.warning(f"Backoffice capture failed: {e}")
            db.rollback()

    return ChatResponse(
        message=clean_text,
        vehicles=vehicle_cards,
        suggested_questions=[],
    )


@router.post("/suggestions")
def get_suggestions(request: ChatRequest, db: Session = Depends(get_db)):
    """Generate follow-up suggestions (called async after main response)."""
    agent = CustomerAgentService(db)
    if not agent.client:
        return {"suggestions": []}

    try:
        response = agent.client.chat.completions.create(
            model="gpt-5.2",
            max_completion_tokens=150,
            messages=[{
                "role": "user",
                "content": f"""Based on this BMW sales conversation:
Last user message: {request.message[:200]}

Generate 3 short follow-up questions a car buyer might ask. One per line, no numbering."""
            }],
        )
        questions = response.choices[0].message.content.strip().split("\n")
        return {"suggestions": [q.strip() for q in questions if q.strip()][:3]}
    except Exception as e:
        logger.error(f"Suggestions error: {e}")
        return {"suggestions": []}


@router.get("/poll")
def poll_messages(session_id: str, after: int = 0, db: Session = Depends(get_db)):
    """Poll for new dealer messages (used by customer chat during human takeover)."""
    conv = db.query(Conversation).filter(Conversation.session_id == session_id).first()
    if not conv:
        return {"operator": "ai", "messages": []}

    new_msgs = (
        db.query(ConversationMessage)
        .filter(
            ConversationMessage.conversation_id == conv.id,
            ConversationMessage.id > after,
            ConversationMessage.role == "assistant",
            ConversationMessage.sender == "human",
        )
        .order_by(ConversationMessage.id)
        .all()
    )

    return {
        "operator": conv.operator or "ai",
        "messages": [
            {"id": m.id, "role": m.role, "content": m.content, "sender": m.sender}
            for m in new_msgs
        ],
    }


@router.get("/status")
def get_chat_status(db: Session = Depends(get_db)):
    """Get chat service status."""
    agent = CustomerAgentService(db)
    return {
        "agent_available": agent.is_available(),
        "mode": "tool-use-streaming",
    }
