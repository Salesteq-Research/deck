"""Database setup and management."""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from .config import DATABASE_URL, DATA_DIR
from .models.vehicle import Base, Vehicle
from .models.backoffice import Lead, Conversation, ConversationMessage, ActivityLog, ServiceRequest  # noqa: F401 — registers tables

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create engine
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    engine = create_engine(DATABASE_URL)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency for getting database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")


def import_vehicles_from_json(filepath: Path = None, db: Session = None) -> int:
    """Import vehicles from JSON file into database."""
    if filepath is None:
        filepath = DATA_DIR / "vehicles.json"

    if not filepath.exists():
        logger.warning(f"Vehicles file not found: {filepath}")
        return 0

    with open(filepath) as f:
        vehicles_data = json.load(f)

    if db is None:
        db = SessionLocal()
        should_close = True
    else:
        should_close = False

    try:
        imported = 0
        for data in vehicles_data:
            vin = data.get("vin")
            if not vin:
                continue

            existing = db.query(Vehicle).filter(Vehicle.vin == vin).first()

            if existing:
                for key, value in data.items():
                    if key not in ["created_at"] and hasattr(existing, key):
                        if isinstance(value, (list, dict)):
                            value = json.dumps(value)
                        setattr(existing, key, value)
                existing.updated_at = datetime.utcnow()
            else:
                images = data.get("images", [])
                if isinstance(images, list):
                    images = json.dumps(images)

                vehicle = Vehicle(
                    vin=vin,
                    name=data.get("name", ""),
                    brand=data.get("brand", "BMW"),
                    series=data.get("series"),
                    model_range=data.get("model_range"),
                    body_type=data.get("body_type"),
                    fuel_type=data.get("fuel_type"),
                    drive_type=data.get("drive_type"),
                    transmission=data.get("transmission"),
                    color=data.get("color"),
                    upholstery_color=data.get("upholstery_color"),
                    price=data.get("price"),
                    price_offer=data.get("price_offer"),
                    price_list=data.get("price_list"),
                    currency=data.get("currency", "CHF"),
                    image=data.get("image"),
                    images=images,
                    dealer_name=data.get("dealer_name"),
                    dealer_id=data.get("dealer_id"),
                    dealer_latitude=data.get("dealer_latitude"),
                    dealer_longitude=data.get("dealer_longitude"),
                    power_kw=data.get("power_kw"),
                    power_hp=data.get("power_hp"),
                    door_count=data.get("door_count"),
                    country=data.get("country", "CH"),
                    sales_status=data.get("sales_status"),
                    url=data.get("url"),
                )
                db.add(vehicle)

            imported += 1

        db.commit()
        logger.info(f"Imported {imported} vehicles into database")
        return imported

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to import vehicles: {e}")
        raise
    finally:
        if should_close:
            db.close()


if __name__ == "__main__":
    init_db()
    import_vehicles_from_json()
