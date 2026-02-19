"""Backoffice database models for leads, conversations, and activity tracking."""

import json
from datetime import datetime
from typing import List, Optional

from sqlalchemy import Column, String, Float, Integer, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import relationship

from .vehicle import Base


class Lead(Base):
    """A potential customer lead captured from chat interactions."""

    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), index=True, nullable=False)
    customer_name = Column(String(200))
    customer_email = Column(String(200))
    customer_phone = Column(String(50))
    status = Column(String(20), default="new", index=True)  # new/contacted/qualified/converted/lost
    score = Column(Integer, default=0)  # 0-100
    interested_vehicles = Column(Text, default="[]")  # JSON array of VINs
    summary = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    conversations = relationship("Conversation", back_populates="lead")

    @property
    def interested_vehicles_list(self) -> List[str]:
        try:
            return json.loads(self.interested_vehicles or "[]")
        except (json.JSONDecodeError, TypeError):
            return []

    @interested_vehicles_list.setter
    def interested_vehicles_list(self, value: List[str]):
        self.interested_vehicles = json.dumps(value)

    def __repr__(self):
        return f"<Lead(id={self.id}, session='{self.session_id}', status='{self.status}', score={self.score})>"


class Conversation(Base):
    """A chat conversation session."""

    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), index=True, nullable=False)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)
    message_count = Column(Integer, default=0)
    status = Column(String(20), default="active")  # active/ended
    operator = Column(String(20), default="ai")  # ai/human
    summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lead = relationship("Lead", back_populates="conversations")
    messages = relationship("ConversationMessage", back_populates="conversation", order_by="ConversationMessage.created_at")

    def __repr__(self):
        return f"<Conversation(id={self.id}, session='{self.session_id}', messages={self.message_count})>"


class ConversationMessage(Base):
    """A single message in a conversation."""

    __tablename__ = "conversation_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    role = Column(String(20), nullable=False)  # user/assistant
    content = Column(Text, nullable=False)
    vehicles_shown = Column(Text, default="[]")  # JSON array of VINs
    sender = Column(String(20), default="ai")  # ai/customer/human
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")

    @property
    def vehicles_shown_list(self) -> List[str]:
        try:
            return json.loads(self.vehicles_shown or "[]")
        except (json.JSONDecodeError, TypeError):
            return []

    def __repr__(self):
        return f"<ConversationMessage(id={self.id}, role='{self.role}')>"


class ActivityLog(Base):
    """Activity log for the backoffice feed."""

    __tablename__ = "activity_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(String(50), nullable=False, index=True)  # new_lead/message/vehicle_shown/email_sent/status_change
    title = Column(String(500), nullable=False)
    description = Column(Text)
    metadata_json = Column(Text, default="{}")
    session_id = Column(String(100))
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_activity_created", "created_at"),
    )

    def __repr__(self):
        return f"<ActivityLog(id={self.id}, type='{self.event_type}', title='{self.title}')>"


class ServiceRequest(Base):
    """A service appointment request (maintenance, tire change, repair, etc.)."""

    __tablename__ = "service_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), index=True)
    service_type = Column(String(50), nullable=False, index=True)  # maintenance/repair/tire_change/inspection/recall/other
    vehicle_description = Column(String(500))
    customer_name = Column(String(200))
    contact = Column(String(200))
    preferred_date = Column(String(200))
    description = Column(Text)
    status = Column(String(20), default="pending")  # pending/confirmed/completed
    dealer_name = Column(String(300))
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<ServiceRequest(id={self.id}, type='{self.service_type}', status='{self.status}')>"


class TestDriveBooking(Base):
    """A test drive booking request — mirrors BMW Switzerland booking flow."""

    __tablename__ = "test_drive_bookings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), index=True)
    booking_ref = Column(String(20), unique=True)  # e.g. TD-2026-0042

    # Vehicle
    vin = Column(String(50))
    vehicle_name = Column(String(500))
    series = Column(String(100))
    body_type = Column(String(100))
    fuel_type = Column(String(50))

    # Customer
    salutation = Column(String(20))  # Herr/Frau
    first_name = Column(String(200))
    last_name = Column(String(200))
    email = Column(String(300))
    phone = Column(String(100))

    # Appointment
    preferred_date = Column(String(200))
    time_preference = Column(String(50))  # morning/midday/afternoon/evening
    dealer_name = Column(String(300))
    dealer_id = Column(String(50))
    comments = Column(Text)

    # Status
    status = Column(String(30), default="pending")  # pending/confirmed/completed/cancelled
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<TestDriveBooking(id={self.id}, ref='{self.booking_ref}', status='{self.status}')>"
