"""Lead management service — scoring, extraction, and upsert logic."""

import json
import logging
import re
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from ..models.backoffice import Lead, Conversation, ConversationMessage, ActivityLog

logger = logging.getLogger(__name__)


def extract_contact_info(text: str) -> dict:
    """Extract email and phone from message text."""
    info = {}
    email_match = re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text)
    if email_match:
        info["email"] = email_match.group(0)

    phone_match = re.search(r"(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{2,4}", text)
    if phone_match:
        candidate = re.sub(r"[\s.()\-]", "", phone_match.group(0))
        if len(candidate) >= 7:
            info["phone"] = phone_match.group(0)

    return info


def score_lead(lead: Lead, message: str, vehicles_shown: List[str]) -> int:
    """Heuristic lead scoring. Returns new score (0-100)."""
    score = lead.score or 0
    text = message.lower()

    # Contact info signals high intent
    if re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", message):
        score += 15
    if re.search(r"(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{2,4}", message):
        candidate = re.sub(r"[\s.()\-]", "", re.search(r"(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{2,4}", message).group(0))
        if len(candidate) >= 7:
            score += 15

    # Price discussion
    price_words = ["price", "cost", "preis", "kosten", "chf", "budget", "financing", "leasing", "finanzierung", "monthly", "monatlich"]
    if any(w in text for w in price_words):
        score += 10

    # Specific vehicle interest
    if vehicles_shown:
        score += 10

    # General engagement (per message)
    score += 5

    # Test drive / visit intent
    visit_words = ["test drive", "probefahrt", "visit", "besuch", "appointment", "termin", "come in", "vorbeikommen"]
    if any(w in text for w in visit_words):
        score += 20

    return min(score, 100)


def upsert_lead(
    db: Session,
    session_id: str,
    user_message: str,
    assistant_message: str,
    vehicles_shown: List[str],
) -> Lead:
    """Create or update a lead for the given session."""
    lead = db.query(Lead).filter(Lead.session_id == session_id).first()
    is_new = lead is None

    if is_new:
        lead = Lead(session_id=session_id, status="new", score=0, interested_vehicles="[]")
        db.add(lead)
        db.flush()

    # Extract contact info
    contact = extract_contact_info(user_message)
    if contact.get("email") and not lead.customer_email:
        lead.customer_email = contact["email"]
    if contact.get("phone") and not lead.customer_phone:
        lead.customer_phone = contact["phone"]

    # Update vehicles of interest
    current_vins = set(lead.interested_vehicles_list)
    current_vins.update(vehicles_shown)
    lead.interested_vehicles = json.dumps(list(current_vins))

    # Score
    lead.score = score_lead(lead, user_message, vehicles_shown)

    # Auto-generate summary
    if vehicles_shown:
        lead.summary = f"Interested in {len(current_vins)} vehicle(s). Last discussed: {', '.join(vehicles_shown[:3])}"

    lead.updated_at = datetime.utcnow()

    # Activity log
    if is_new:
        log_activity(db, "new_lead", "New lead created", f"Session {session_id[:8]}... started chatting", session_id=session_id, lead_id=lead.id)

    return lead


def upsert_conversation(
    db: Session,
    session_id: str,
    lead: Lead,
    user_message: str,
    assistant_message: str,
    vehicles_shown: List[str],
) -> Conversation:
    """Create or update a conversation and append messages."""
    conv = db.query(Conversation).filter(Conversation.session_id == session_id).first()
    if not conv:
        conv = Conversation(session_id=session_id, lead_id=lead.id, message_count=0, status="active")
        db.add(conv)
        db.flush()

    # Add user message
    user_msg = ConversationMessage(
        conversation_id=conv.id,
        role="user",
        content=user_message,
        vehicles_shown="[]",
        sender="customer",
    )
    db.add(user_msg)

    # Add assistant message
    asst_msg = ConversationMessage(
        conversation_id=conv.id,
        role="assistant",
        content=assistant_message,
        vehicles_shown=json.dumps(vehicles_shown),
        sender="ai",
    )
    db.add(asst_msg)

    conv.message_count = (conv.message_count or 0) + 2
    conv.updated_at = datetime.utcnow()

    # Log activity for vehicle recommendations
    if vehicles_shown:
        log_activity(
            db, "vehicle_shown",
            f"{len(vehicles_shown)} vehicle(s) recommended",
            f"Showed: {', '.join(vehicles_shown[:3])}",
            session_id=session_id, lead_id=lead.id,
        )

    return conv


def log_activity(
    db: Session,
    event_type: str,
    title: str,
    description: str = "",
    metadata_json: str = "{}",
    session_id: Optional[str] = None,
    lead_id: Optional[int] = None,
):
    """Write an entry to the activity log."""
    entry = ActivityLog(
        event_type=event_type,
        title=title,
        description=description,
        metadata_json=metadata_json,
        session_id=session_id,
        lead_id=lead_id,
    )
    db.add(entry)
