"""OpenAI chat service (legacy compatibility wrapper)."""

import logging
from typing import List

from ..config import OPENAI_API_KEY, CHAT_MODEL, MAX_CONTEXT_VEHICLES

logger = logging.getLogger(__name__)


class ClaudeService:
    """Legacy wrapper — now uses OpenAI."""

    def __init__(self):
        self.client = None
        self._init_client()

    def _init_client(self):
        if not OPENAI_API_KEY:
            logger.warning("OPENAI_API_KEY not set")
            return
        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=OPENAI_API_KEY)
            logger.info("OpenAI client initialized (claude_service compat)")
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI client: {e}")

    def is_available(self) -> bool:
        return self.client is not None
