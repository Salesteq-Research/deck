"""Pydantic schemas for API request/response validation."""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class VehicleResponse(BaseModel):
    """Schema for vehicle response."""

    vin: str
    name: str
    brand: str = "BMW"
    series: Optional[str] = None
    model_range: Optional[str] = None
    body_type: Optional[str] = None
    fuel_type: Optional[str] = None
    drive_type: Optional[str] = None
    transmission: Optional[str] = None
    color: Optional[str] = None
    upholstery_color: Optional[str] = None
    price: Optional[str] = None
    price_offer: Optional[float] = None
    price_list: Optional[float] = None
    monthly_installment: Optional[float] = None
    currency: str = "CHF"
    image: Optional[str] = None
    images: List[str] = []
    dealer_name: Optional[str] = None
    dealer_id: Optional[str] = None
    dealer_latitude: Optional[float] = None
    dealer_longitude: Optional[float] = None
    power_kw: Optional[int] = None
    power_hp: Optional[int] = None
    door_count: Optional[int] = None
    country: str = "CH"
    sales_status: Optional[str] = None
    url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class VehicleListResponse(BaseModel):
    """Schema for paginated vehicle list."""

    items: List[VehicleResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class VehicleCardResponse(BaseModel):
    """Compact vehicle card for chat responses."""

    vin: str
    name: str
    series: Optional[str] = None
    body_type: Optional[str] = None
    fuel_type: Optional[str] = None
    color: Optional[str] = None
    price: Optional[str] = None
    price_offer: Optional[float] = None
    monthly_installment: Optional[float] = None
    currency: str = "CHF"
    image: Optional[str] = None
    images: List[str] = []
    dealer_name: Optional[str] = None
    url: Optional[str] = None


class ChatMessage(BaseModel):
    """Schema for a single chat message."""

    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    """Schema for chat request."""

    message: str
    conversation_history: List[ChatMessage] = []
    session_id: Optional[str] = None
    language: Optional[str] = None


class ChatResponse(BaseModel):
    """Schema for chat response."""

    message: str
    vehicles: List[VehicleCardResponse] = []
    suggested_questions: List[str] = []


class SeriesCount(BaseModel):
    """Schema for series with vehicle count."""

    series: str
    count: int


# ── Backoffice Schemas ──────────────────────────────────────────────


class LeadResponse(BaseModel):
    id: int
    session_id: str
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    status: str = "new"
    score: int = 0
    interested_vehicles: List[str] = []
    summary: Optional[str] = None
    notes: Optional[str] = None
    message_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LeadUpdate(BaseModel):
    status: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    notes: Optional[str] = None


class ConversationMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    vehicles_shown: List[str] = []
    sender: str = "ai"
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    id: int
    session_id: str
    lead_id: Optional[int] = None
    message_count: int = 0
    status: str = "active"
    operator: str = "ai"
    summary: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ConversationDetailResponse(ConversationResponse):
    messages: List[ConversationMessageResponse] = []
    lead: Optional[LeadResponse] = None


class ActivityItemResponse(BaseModel):
    id: int
    event_type: str
    title: str
    description: Optional[str] = None
    metadata_json: Optional[str] = None
    session_id: Optional[str] = None
    lead_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BackofficeStats(BaseModel):
    total_leads: int = 0
    new_leads_today: int = 0
    active_conversations: int = 0
    total_conversations: int = 0
    avg_score: float = 0
    top_vehicles: List[dict] = []
    total_vehicles: int = 0


class AgentChatRequest(BaseModel):
    message: str
    conversation_history: List[ChatMessage] = []


class AgentToolCall(BaseModel):
    name: str
    input: dict = {}
    result_summary: str = ""


class AgentChatResponse(BaseModel):
    message: str
    tool_calls: List[AgentToolCall] = []


class DealerReplyRequest(BaseModel):
    message: str


class EmailRequest(BaseModel):
    lead_id: int
    subject: str
    body: str
    to_email: str
