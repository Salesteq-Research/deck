"""Backoffice API endpoints for the dealer command center."""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.backoffice import Lead, Conversation, ConversationMessage, ActivityLog
from ..models.vehicle import Vehicle
from ..models.schemas import (
    LeadResponse,
    LeadUpdate,
    ConversationResponse,
    ConversationDetailResponse,
    ConversationMessageResponse,
    ActivityItemResponse,
    BackofficeStats,
    AgentChatRequest,
    AgentChatResponse,
    EmailRequest,
    DealerReplyRequest,
)
from ..services.lead_service import log_activity
from ..services.agent_service import AgentService

router = APIRouter(prefix="/api/backoffice", tags=["backoffice"])
logger = logging.getLogger(__name__)


def _lead_to_response(lead: Lead, db: Session) -> LeadResponse:
    """Convert a Lead ORM object to response schema."""
    conv = db.query(Conversation).filter(Conversation.lead_id == lead.id).first()
    return LeadResponse(
        id=lead.id,
        session_id=lead.session_id,
        customer_name=lead.customer_name,
        customer_email=lead.customer_email,
        customer_phone=lead.customer_phone,
        status=lead.status,
        score=lead.score or 0,
        interested_vehicles=lead.interested_vehicles_list,
        summary=lead.summary,
        notes=lead.notes,
        message_count=conv.message_count if conv else 0,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )


@router.get("/stats", response_model=BackofficeStats)
def get_stats(db: Session = Depends(get_db)):
    """Dashboard KPIs."""
    total_leads = db.query(func.count(Lead.id)).scalar() or 0
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    new_today = db.query(func.count(Lead.id)).filter(Lead.created_at >= today).scalar() or 0
    active_convs = db.query(func.count(Conversation.id)).filter(Conversation.status == "active").scalar() or 0
    total_convs = db.query(func.count(Conversation.id)).scalar() or 0
    avg_score = db.query(func.avg(Lead.score)).scalar() or 0

    # Top vehicles across all leads — resolved to full details
    leads = db.query(Lead).all()
    vin_counts: dict[str, int] = {}
    for lead in leads:
        for vin in lead.interested_vehicles_list:
            vin_counts[vin] = vin_counts.get(vin, 0) + 1
    top_vins = sorted(vin_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    top_vehicles_list = []
    for vin, count in top_vins:
        vehicle = db.query(Vehicle).filter(Vehicle.vin == vin).first()
        entry = {"vin": vin, "count": count}
        if vehicle:
            entry.update({
                "name": vehicle.name,
                "series": vehicle.series,
                "fuel_type": vehicle.fuel_type,
                "price_offer": vehicle.price_offer,
                "price": vehicle.price,
                "color": vehicle.color,
                "dealer_name": vehicle.dealer_name,
                "image": vehicle.image,
            })
        top_vehicles_list.append(entry)

    # Total inventory count
    total_vehicles = db.query(func.count(Vehicle.vin)).scalar() or 0

    return BackofficeStats(
        total_leads=total_leads,
        new_leads_today=new_today,
        active_conversations=active_convs,
        total_conversations=total_convs,
        avg_score=round(avg_score, 1),
        top_vehicles=top_vehicles_list,
        total_vehicles=total_vehicles,
    )


@router.get("/leads", response_model=list[LeadResponse])
def list_leads(status: Optional[str] = None, db: Session = Depends(get_db)):
    """List all leads, optionally filtered by status."""
    query = db.query(Lead).order_by(desc(Lead.updated_at))
    if status:
        query = query.filter(Lead.status == status)
    return [_lead_to_response(lead, db) for lead in query.all()]


@router.get("/leads/{lead_id}", response_model=LeadResponse)
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    """Get a single lead with details."""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return _lead_to_response(lead, db)


@router.patch("/leads/{lead_id}", response_model=LeadResponse)
def update_lead(lead_id: int, update: LeadUpdate, db: Session = Depends(get_db)):
    """Update lead status, notes, or contact info."""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    old_status = lead.status
    for field, value in update.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(lead, field, value)
    lead.updated_at = datetime.utcnow()

    if update.status and update.status != old_status:
        log_activity(
            db, "status_change",
            f"Lead status changed to {update.status}",
            f"From {old_status} to {update.status}",
            session_id=lead.session_id, lead_id=lead.id,
        )

    db.commit()
    db.refresh(lead)
    return _lead_to_response(lead, db)


@router.get("/conversations", response_model=list[ConversationResponse])
def list_conversations(db: Session = Depends(get_db)):
    """List all conversations."""
    convs = db.query(Conversation).order_by(desc(Conversation.updated_at)).all()
    return [
        ConversationResponse(
            id=c.id,
            session_id=c.session_id,
            lead_id=c.lead_id,
            message_count=c.message_count or 0,
            status=c.status,
            operator=c.operator or "ai",
            summary=c.summary,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in convs
    ]


@router.get("/conversations/{conv_id}", response_model=ConversationDetailResponse)
def get_conversation(conv_id: int, db: Session = Depends(get_db)):
    """Get full conversation with messages."""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = [
        ConversationMessageResponse(
            id=m.id,
            role=m.role,
            content=m.content,
            vehicles_shown=m.vehicles_shown_list,
            sender=m.sender or "ai",
            created_at=m.created_at,
        )
        for m in conv.messages
    ]

    lead_resp = None
    if conv.lead:
        lead_resp = _lead_to_response(conv.lead, db)

    return ConversationDetailResponse(
        id=conv.id,
        session_id=conv.session_id,
        lead_id=conv.lead_id,
        message_count=conv.message_count or 0,
        status=conv.status,
        operator=conv.operator or "ai",
        summary=conv.summary,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=messages,
        lead=lead_resp,
    )


@router.post("/conversations/{conv_id}/takeover")
def takeover_conversation(conv_id: int, db: Session = Depends(get_db)):
    """Dealer takes over a conversation from AI."""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv.operator = "human"
    conv.updated_at = datetime.utcnow()
    log_activity(db, "takeover", "Dealer took over conversation", f"Conversation #{conv_id}", session_id=conv.session_id, lead_id=conv.lead_id)
    db.commit()
    return {"status": "ok", "operator": "human"}


@router.post("/conversations/{conv_id}/handback")
def handback_conversation(conv_id: int, db: Session = Depends(get_db)):
    """Dealer hands conversation back to AI."""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv.operator = "ai"
    conv.updated_at = datetime.utcnow()
    log_activity(db, "handback", "Dealer handed back to AI", f"Conversation #{conv_id}", session_id=conv.session_id, lead_id=conv.lead_id)
    db.commit()
    return {"status": "ok", "operator": "ai"}


@router.post("/conversations/{conv_id}/reply")
def dealer_reply(conv_id: int, request: DealerReplyRequest, db: Session = Depends(get_db)):
    """Dealer sends a reply in a taken-over conversation."""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    msg = ConversationMessage(
        conversation_id=conv.id,
        role="assistant",
        content=request.message,
        vehicles_shown="[]",
        sender="human",
    )
    db.add(msg)
    conv.message_count = (conv.message_count or 0) + 1
    conv.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "ok", "message_id": msg.id}


@router.get("/activity", response_model=list[ActivityItemResponse])
def list_activity(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    """Paginated activity feed."""
    items = (
        db.query(ActivityLog)
        .order_by(desc(ActivityLog.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )
    results = []
    for a in items:
        desc_text = a.description or ""
        # Resolve VINs in description to vehicle names
        if a.event_type == "vehicle_shown" and "Showed:" in desc_text:
            vins_part = desc_text.split("Showed: ", 1)[1] if "Showed: " in desc_text else ""
            vins = [v.strip() for v in vins_part.split(",") if v.strip()]
            names = []
            for vin in vins[:3]:
                v = db.query(Vehicle).filter(Vehicle.vin == vin).first()
                names.append(v.name if v else vin[:11])
            desc_text = ", ".join(names)
        results.append(ActivityItemResponse(
            id=a.id,
            event_type=a.event_type,
            title=a.title,
            description=desc_text,
            metadata_json=a.metadata_json,
            session_id=a.session_id,
            lead_id=a.lead_id,
            created_at=a.created_at,
        ))
    return results


@router.post("/agent-chat", response_model=AgentChatResponse)
def agent_chat(request: AgentChatRequest, db: Session = Depends(get_db)):
    """Hedin AI Agent with tool access to inventory, leads, and conversations."""
    agent = AgentService(db)
    history = [{"role": m.role, "content": m.content} for m in request.conversation_history]

    result = agent.chat(
        message=request.message,
        conversation_history=history,
    )

    return AgentChatResponse(
        message=result["message"],
        tool_calls=[
            {"name": tc["name"], "input": tc["input"], "result_summary": tc["result_summary"]}
            for tc in result.get("tool_calls", [])
        ],
    )


@router.get("/ai-insight")
def get_ai_insight(context: str = "dashboard", lead_id: Optional[int] = None, conversation_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Generate contextual AI insight for the current view."""
    agent = AgentService(db)

    if context == "lead" and lead_id:
        prompt = f"Give a brief 2-3 sentence actionable insight about lead #{lead_id}. Use get_lead_detail to look up the lead, then suggest a specific next action. Be concise and direct."
    elif context == "conversation" and conversation_id:
        prompt = f"Analyze conversation #{conversation_id}. Use get_conversation_transcript to read it. Give a 2-3 sentence analysis: what is the customer looking for, their sentiment, and what the dealer should do next. Be specific and actionable."
    elif context == "leads_overview":
        prompt = "Analyze the leads pipeline. Use get_leads to see all current leads. Give a 2-3 sentence summary: how many hot leads need immediate attention, which leads have gone cold, and the overall pipeline health. Be specific with names/numbers."
    elif context == "dashboard":
        prompt = "Give a brief 3-4 sentence executive summary of the current dealership status. Use get_dashboard_stats and get_leads to understand the situation. Focus on what needs attention right now. Be concise, data-driven, no fluff."
    else:
        prompt = "Give a 2-sentence summary of current activity. Use get_dashboard_stats."

    result = agent.chat(message=prompt, conversation_history=[])
    return {
        "insight": result["message"],
        "tool_calls": [
            {"name": tc["name"], "result_summary": tc["result_summary"]}
            for tc in result.get("tool_calls", [])
        ],
    }


@router.post("/email")
def send_email(request: EmailRequest, db: Session = Depends(get_db)):
    """Mock email send — stores in activity log and updates lead status."""
    lead = db.query(Lead).filter(Lead.id == request.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Update lead status to contacted
    if lead.status == "new":
        lead.status = "contacted"
        lead.updated_at = datetime.utcnow()

    # Log the email send
    log_activity(
        db, "email_sent",
        f"Email sent to {request.to_email}",
        f"Subject: {request.subject}",
        metadata_json=json.dumps({"to": request.to_email, "subject": request.subject, "body": request.body}),
        session_id=lead.session_id, lead_id=lead.id,
    )

    db.commit()
    return {"status": "sent", "message": f"Email sent to {request.to_email}"}
