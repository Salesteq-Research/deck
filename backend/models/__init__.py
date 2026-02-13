"""Database models."""

from .vehicle import Vehicle, Base
from .backoffice import Lead, Conversation, ConversationMessage, ActivityLog
from .schemas import (
    VehicleResponse,
    VehicleListResponse,
    VehicleCardResponse,
    ChatMessage,
    ChatRequest,
    ChatResponse,
    SeriesCount,
    LeadResponse,
    ConversationResponse,
    ConversationDetailResponse,
    ConversationMessageResponse,
    ActivityItemResponse,
    BackofficeStats,
    AgentChatRequest,
    AgentChatResponse,
    EmailRequest,
    LeadUpdate,
)

__all__ = [
    "Vehicle",
    "Base",
    "Lead",
    "Conversation",
    "ConversationMessage",
    "ActivityLog",
    "VehicleResponse",
    "VehicleListResponse",
    "VehicleCardResponse",
    "ChatMessage",
    "ChatRequest",
    "ChatResponse",
    "SeriesCount",
    "LeadResponse",
    "ConversationResponse",
    "ConversationDetailResponse",
    "ConversationMessageResponse",
    "ActivityItemResponse",
    "BackofficeStats",
    "AgentChatRequest",
    "AgentChatResponse",
    "EmailRequest",
    "LeadUpdate",
]
