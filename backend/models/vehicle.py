"""Vehicle SQLAlchemy model."""

import json
from datetime import datetime
from typing import List, Dict, Any, Optional

from sqlalchemy import Column, String, Float, Integer, DateTime, Text, Index
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Vehicle(Base):
    """BMW vehicle database model."""

    __tablename__ = "vehicles"

    vin = Column(String(50), primary_key=True)
    name = Column(String(500), nullable=False, index=True)
    brand = Column(String(50), default="BMW")
    series = Column(String(100), index=True)
    model_range = Column(String(100))
    body_type = Column(String(100), index=True)
    fuel_type = Column(String(50), index=True)
    drive_type = Column(String(50))
    transmission = Column(String(50))
    color = Column(String(100))
    upholstery_color = Column(String(100))
    price = Column(String(200))  # Formatted string, e.g. "CHF 220,010.00"
    price_offer = Column(Float)
    price_list = Column(Float)
    currency = Column(String(10), default="CHF")
    image = Column(Text)  # Primary image URL
    images = Column(Text)  # JSON array of image URLs
    dealer_name = Column(String(500), index=True)
    dealer_id = Column(String(50))
    dealer_latitude = Column(Float)
    dealer_longitude = Column(Float)
    power_kw = Column(Integer)
    power_hp = Column(Integer)
    door_count = Column(Integer)
    country = Column(String(10), default="CH")
    sales_status = Column(String(50))
    url = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_vehicle_series_body", "series", "body_type"),
        Index("ix_vehicle_fuel", "fuel_type"),
    )

    def _parse_json(self, value: str, default: Any = None) -> Any:
        if value is None:
            return default if default is not None else []
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return default if default is not None else []

    @property
    def images_list(self) -> List[str]:
        return self._parse_json(self.images, [])

    def to_dict(self) -> Dict[str, Any]:
        return {
            "vin": self.vin,
            "name": self.name,
            "brand": self.brand,
            "series": self.series,
            "model_range": self.model_range,
            "body_type": self.body_type,
            "fuel_type": self.fuel_type,
            "drive_type": self.drive_type,
            "transmission": self.transmission,
            "color": self.color,
            "upholstery_color": self.upholstery_color,
            "price": self.price,
            "price_offer": self.price_offer,
            "price_list": self.price_list,
            "currency": self.currency,
            "image": self.image,
            "images": self.images_list,
            "dealer_name": self.dealer_name,
            "dealer_id": self.dealer_id,
            "dealer_latitude": self.dealer_latitude,
            "dealer_longitude": self.dealer_longitude,
            "power_kw": self.power_kw,
            "power_hp": self.power_hp,
            "door_count": self.door_count,
            "country": self.country,
            "sales_status": self.sales_status,
            "url": self.url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_search_text(self) -> str:
        """Generate searchable text for RAG indexing."""
        parts = [
            f"Vehicle: {self.name}",
            f"VIN: {self.vin}",
            f"Series: {self.series}" if self.series else "",
            f"Body type: {self.body_type}" if self.body_type else "",
            f"Fuel type: {self.fuel_type}" if self.fuel_type else "",
            f"Drive type: {self.drive_type}" if self.drive_type else "",
            f"Transmission: {self.transmission}" if self.transmission else "",
            f"Color: {self.color}" if self.color else "",
            f"Interior: {self.upholstery_color}" if self.upholstery_color else "",
            f"Price: {self.price}" if self.price else "",
            f"Dealer: {self.dealer_name}" if self.dealer_name else "",
            f"Power: {self.power_kw} kW / {self.power_hp} HP" if self.power_kw else "",
            f"Doors: {self.door_count}" if self.door_count else "",
            f"Status: {self.sales_status}" if self.sales_status else "",
        ]
        return "\n".join(p for p in parts if p)

    def __repr__(self) -> str:
        return f"<Vehicle(vin='{self.vin}', name='{self.name}')>"
