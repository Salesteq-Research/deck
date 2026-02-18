"""Application configuration."""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
CHROMA_DIR = DATA_DIR / "chroma"

# Database
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'bmw_chat.db'}")

# OpenAI API
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Keep for backwards compat — unused now
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# Server settings
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8002"))

# RAG Settings
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

# Chat settings
MAX_CONTEXT_VEHICLES = 10
CHAT_MODEL = "gpt-5.2"
