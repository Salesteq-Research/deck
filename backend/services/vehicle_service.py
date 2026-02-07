"""Vehicle service for database operations."""

from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from ..models.vehicle import Vehicle


class VehicleService:
    """Service for vehicle database operations."""

    def __init__(self, db: Session):
        self.db = db

    def get_all(
        self,
        page: int = 1,
        page_size: int = 20,
        series: Optional[str] = None,
        fuel_type: Optional[str] = None,
        body_type: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[Vehicle], int]:
        """Get paginated list of vehicles with optional filters."""
        query = self.db.query(Vehicle)

        if series:
            query = query.filter(Vehicle.series == series)
        if fuel_type:
            query = query.filter(Vehicle.fuel_type == fuel_type)
        if body_type:
            query = query.filter(Vehicle.body_type == body_type)
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    Vehicle.name.ilike(search_term),
                    Vehicle.series.ilike(search_term),
                    Vehicle.color.ilike(search_term),
                    Vehicle.dealer_name.ilike(search_term),
                    Vehicle.vin.ilike(search_term),
                )
            )

        total = query.count()
        offset = (page - 1) * page_size
        vehicles = query.order_by(Vehicle.name).offset(offset).limit(page_size).all()

        return vehicles, total

    def get_by_vin(self, vin: str) -> Optional[Vehicle]:
        return self.db.query(Vehicle).filter(Vehicle.vin == vin).first()

    def search(self, query: str, limit: int = 10) -> List[Vehicle]:
        search_term = f"%{query}%"
        return (
            self.db.query(Vehicle)
            .filter(
                or_(
                    Vehicle.name.ilike(search_term),
                    Vehicle.series.ilike(search_term),
                    Vehicle.body_type.ilike(search_term),
                    Vehicle.fuel_type.ilike(search_term),
                    Vehicle.color.ilike(search_term),
                    Vehicle.dealer_name.ilike(search_term),
                )
            )
            .limit(limit)
            .all()
        )

    def get_series(self) -> List[Dict[str, Any]]:
        """Get all series with vehicle counts."""
        results = (
            self.db.query(Vehicle.series, func.count(Vehicle.vin))
            .group_by(Vehicle.series)
            .all()
        )
        return [{"series": s, "count": count} for s, count in results if s]

    def get_stats(self) -> Dict[str, Any]:
        total = self.db.query(Vehicle).count()
        with_images = self.db.query(Vehicle).filter(Vehicle.image != None, Vehicle.image != "").count()
        with_price = self.db.query(Vehicle).filter(Vehicle.price_offer != None).count()

        return {
            "total_vehicles": total,
            "vehicles_with_images": with_images,
            "vehicles_with_price": with_price,
        }
