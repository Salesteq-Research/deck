"""FastAPI application entry point."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db, import_vehicles_from_json
from .services.rag_service import RAGService
from .database import SessionLocal
from .api import vehicles_router, admin_router, chat_router, inventory_router, backoffice_router, network_router, testdrive_router, dealer_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="BMW Sales Advisor",
    description="AI-powered vehicle sales advisor for BMW Switzerland",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vehicles_router)
app.include_router(admin_router)
app.include_router(chat_router)
app.include_router(inventory_router)
app.include_router(backoffice_router)
app.include_router(network_router)
app.include_router(testdrive_router)
app.include_router(dealer_router)


@app.on_event("startup")
async def startup_event():
    """Initialize database, import vehicles, and index for RAG on startup."""
    logger.info("Initializing database...")
    init_db()

    logger.info("Importing vehicles from JSON...")
    count = import_vehicles_from_json()
    logger.info(f"Imported {count} vehicles")

    logger.info("Indexing vehicles for RAG search...")
    db = SessionLocal()
    try:
        rag_service = RAGService(db)
        indexed = rag_service.index_vehicles()
        logger.info(f"Indexed {indexed} vehicles in ChromaDB")
    finally:
        db.close()

    logger.info("BMW Sales Advisor ready!")


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    from .config import HOST, PORT

    uvicorn.run(app, host=HOST, port=PORT)
