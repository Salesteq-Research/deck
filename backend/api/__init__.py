"""API routes."""

from .vehicles import router as vehicles_router
from .admin import router as admin_router
from .chat import router as chat_router
from .inventory import router as inventory_router

__all__ = [
    "vehicles_router",
    "admin_router",
    "chat_router",
    "inventory_router",
]
