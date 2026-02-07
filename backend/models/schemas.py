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


class ChatResponse(BaseModel):
    """Schema for chat response."""

    message: str
    vehicles: List[VehicleCardResponse] = []
    suggested_questions: List[str] = []


class SeriesCount(BaseModel):
    """Schema for series with vehicle count."""

    series: str
    count: int
