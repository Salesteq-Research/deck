"""Specialized AI agent for BMW test drive booking — conversational flow."""

import json
import logging
import random
from datetime import datetime
from typing import List, Dict, Any, Generator

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import OPENAI_API_KEY
from ..models.vehicle import Vehicle
from ..models.backoffice import TestDriveBooking, ActivityLog

logger = logging.getLogger(__name__)

TESTDRIVE_MODEL = "gpt-5.2"

SYSTEM_PROMPT = """You are the BMW Test Drive Booking Assistant for the Swiss market.

## Your Role
You guide customers through booking a test drive at their preferred BMW dealer in Switzerland. You are warm, professional, and efficient. You speak German and English fluently.

## Booking Flow
Guide the customer through these steps naturally in conversation:

1. **Vehicle Selection** — Help them choose which BMW to test drive. Use search_test_drive_vehicles to find available models. Show them options based on their interests.
2. **Dealer Selection** — Use get_available_dealers to show nearby dealers. Let them pick one.
3. **Date & Time** — Ask for their preferred date and time of day (morning, midday, afternoon, or evening).
4. **Personal Details** — Collect: salutation (Herr/Frau), first name, last name, email, phone number.
5. **Confirmation** — Use confirm_test_drive_booking to finalize. Show them a summary.

## Rules
- ALWAYS use search_test_drive_vehicles first when the customer mentions any vehicle interest
- Be conversational — don't dump all questions at once. Ask one or two things at a time.
- When showing vehicles, let the card UI do the work. Don't list specs in text.
- After they pick a vehicle, naturally move to dealer, then date, then personal info.
- If they haven't decided on a vehicle, help them explore options.
- Format dates naturally: "Dienstag, 4. Marz" or "next Tuesday"
- Time preferences: Morgens (8-11), Mittags (11-13), Nachmittags (13-17), Abends (17-19)

## Response Format (STRICT)
Keep responses SHORT — max 2-3 sentences. Be direct and helpful.

At the end of your response, include vehicle recommendations:
[RECOMMEND: vin1, vin2, vin3] or [RECOMMEND: none]

## Confirmation Format
When confirming a booking, format it clearly:
- Vehicle: [name]
- Dealer: [name]
- Date: [date], [time preference]
- Reference: [booking ref]

Let them know the dealer will contact them within 24 hours to confirm the exact time."""

TESTDRIVE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_test_drive_vehicles",
            "description": "Search BMW vehicles available for test drives. Use this to help customers find the right model.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Free-text search (model name, type, etc.)"},
                    "series": {"type": "string", "description": "BMW series: 1, 2, 3, 4, 5, 7, 8, X1, X2, X3, X4, X5, X6, X7, Z4, i4, i5, i7, iX, iX1, iX2, iX3, M"},
                    "fuel_type": {"type": "string", "enum": ["GASOLINE", "DIESEL", "ELECTRIC"], "description": "Fuel type"},
                    "body_type": {"type": "string", "enum": ["LIMOUSINE", "TOURING", "COUPE", "CABRIOLET", "SPORT_ACTIVITY_VEHICLE", "SC", "GRAN_COUPE", "GRAN_TURISMO", "SPORTS_HATCH", "ROADSTER"], "description": "Body type"},
                    "limit": {"type": "integer", "description": "Max results (default 6)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_vehicle_details",
            "description": "Get full details of a specific vehicle by VIN for test drive.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vin": {"type": "string", "description": "Vehicle Identification Number"},
                },
                "required": ["vin"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_available_dealers",
            "description": "Get list of BMW dealers in Switzerland that offer test drives.",
            "parameters": {
                "type": "object",
                "properties": {
                    "region": {"type": "string", "description": "Optional region filter (e.g. Zurich, Bern, Basel, Geneva)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "confirm_test_drive_booking",
            "description": "Confirm and create the test drive booking. Call this when all details are collected.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vin": {"type": "string", "description": "VIN of selected vehicle"},
                    "dealer_name": {"type": "string", "description": "Selected dealer name"},
                    "preferred_date": {"type": "string", "description": "Preferred date (e.g. '2026-03-04' or 'next Tuesday')"},
                    "time_preference": {"type": "string", "enum": ["morning", "midday", "afternoon", "evening"], "description": "Preferred time of day"},
                    "salutation": {"type": "string", "enum": ["Herr", "Frau"], "description": "Salutation"},
                    "first_name": {"type": "string", "description": "Customer first name"},
                    "last_name": {"type": "string", "description": "Customer last name"},
                    "email": {"type": "string", "description": "Customer email"},
                    "phone": {"type": "string", "description": "Customer phone number"},
                    "comments": {"type": "string", "description": "Optional comments"},
                },
                "required": ["vin", "dealer_name", "preferred_date", "time_preference", "first_name", "last_name", "email"],
            },
        },
    },
]


class TestDriveAgentService:
    """AI agent specialized for test drive booking flow."""

    def __init__(self, db: Session):
        self.db = db
        self.client = None
        self._init_client()

    def _init_client(self):
        if not OPENAI_API_KEY:
            return
        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=OPENAI_API_KEY)
        except Exception as e:
            logger.error(f"Failed to init OpenAI client: {e}")

    def chat_stream(self, message: str, conversation_history: List[Dict[str, str]] = None, session_id: str = None) -> Generator[Dict[str, Any], None, None]:
        if not self.client:
            yield {"type": "text_delta", "content": "AI service is currently unavailable."}
            yield {"type": "done", "recommended_vins": [], "all_vins": []}
            return

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        if conversation_history:
            for msg in conversation_history[-20:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": message})

        all_vehicle_vins = []

        for _ in range(8):
            try:
                response = self.client.chat.completions.create(
                    model=TESTDRIVE_MODEL,
                    max_completion_tokens=1024,
                    messages=messages,
                    tools=TESTDRIVE_TOOLS,
                )
            except Exception as e:
                logger.error(f"OpenAI error: {e}")
                yield {"type": "text_delta", "content": "I apologize, but I encountered an error. Please try again."}
                yield {"type": "done", "recommended_vins": [], "all_vins": []}
                return

            choice = response.choices[0]

            if choice.finish_reason == "tool_calls":
                messages.append(choice.message)
                for tc in choice.message.tool_calls:
                    args = json.loads(tc.function.arguments)
                    yield {"type": "tool_call", "name": tc.function.name, "input": args}
                    result = self._execute_tool(tc.function.name, args, session_id)
                    self._collect_vins(result, all_vehicle_vins)
                    result_str = json.dumps(result, default=str)
                    if len(result_str) > 8000:
                        result_str = result_str[:8000] + "... (truncated)"
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result_str})
            else:
                import re
                text = choice.message.content or ""
                recommend_match = re.search(r"\[RECOMMEND:\s*([^\]]*)\]", text)
                recommended_vins = []
                if recommend_match:
                    raw = recommend_match.group(1).strip()
                    if raw.lower() != "none":
                        recommended_vins = [v.strip() for v in raw.split(",") if v.strip()]
                clean_text = re.sub(r"\s*\[RECOMMEND:[^\]]*\]\s*", "", text).strip()
                yield {"type": "text_delta", "content": clean_text}
                deduped_vins = list(dict.fromkeys(all_vehicle_vins))
                yield {"type": "vehicles", "vins": recommended_vins if recommended_vins else deduped_vins[:5]}
                yield {"type": "done", "recommended_vins": recommended_vins, "all_vins": deduped_vins}
                return

        yield {"type": "text_delta", "content": "Could you rephrase your question?"}
        yield {"type": "done", "recommended_vins": [], "all_vins": list(dict.fromkeys(all_vehicle_vins))}

    def _collect_vins(self, result: Any, vins: List[str]):
        if isinstance(result, dict):
            if "vin" in result:
                vins.append(result["vin"])
            if "vehicles" in result and isinstance(result["vehicles"], list):
                for v in result["vehicles"]:
                    if isinstance(v, dict) and "vin" in v:
                        vins.append(v["vin"])
        elif isinstance(result, list):
            for item in result:
                if isinstance(item, dict) and "vin" in item:
                    vins.append(item["vin"])

    def _execute_tool(self, name: str, input: Dict[str, Any], session_id: str = None) -> Any:
        try:
            if name == "search_test_drive_vehicles":
                return self._search_vehicles(input)
            elif name == "get_vehicle_details":
                return self._get_vehicle(input)
            elif name == "get_available_dealers":
                return self._get_dealers(input)
            elif name == "confirm_test_drive_booking":
                return self._confirm_booking(input, session_id)
            else:
                return {"error": f"Unknown tool: {name}"}
        except Exception as e:
            logger.error(f"Tool {name} error: {e}")
            return {"error": str(e)}

    def _search_vehicles(self, input: Dict) -> Dict:
        query = self.db.query(Vehicle)
        if input.get("series"):
            query = query.filter(Vehicle.series == input["series"])
        if input.get("fuel_type"):
            query = query.filter(Vehicle.fuel_type == input["fuel_type"])
        if input.get("body_type"):
            query = query.filter(Vehicle.body_type == input["body_type"])
        if input.get("query"):
            from sqlalchemy import or_
            term = f"%{input['query']}%"
            query = query.filter(or_(
                Vehicle.name.ilike(term),
                Vehicle.series.ilike(term),
                Vehicle.body_type.ilike(term),
                Vehicle.fuel_type.ilike(term),
            ))
        total = query.count()
        limit = min(input.get("limit", 6), 12)
        # Get a representative sample: one per series/body combo
        vehicles = query.order_by(Vehicle.price_offer.asc().nullslast()).limit(limit).all()
        return {
            "total_available": total,
            "showing": len(vehicles),
            "vehicles": [{
                "vin": v.vin, "name": v.name, "series": v.series,
                "body_type": v.body_type, "fuel_type": v.fuel_type,
                "drive_type": v.drive_type, "color": v.color,
                "price_chf": v.price_offer, "price_formatted": v.price,
                "power_hp": v.power_hp, "dealer": v.dealer_name,
            } for v in vehicles],
        }

    def _get_vehicle(self, input: Dict) -> Dict:
        v = self.db.query(Vehicle).filter(Vehicle.vin == input["vin"]).first()
        if not v:
            return {"error": f"Vehicle {input['vin']} not found"}
        return {
            "vin": v.vin, "name": v.name, "series": v.series,
            "body_type": v.body_type, "fuel_type": v.fuel_type,
            "drive_type": v.drive_type, "color": v.color,
            "price_chf": v.price_offer, "price_formatted": v.price,
            "power_hp": v.power_hp, "dealer": v.dealer_name,
        }

    def _get_dealers(self, input: Dict) -> Dict:
        # Get distinct dealers from inventory
        dealer_rows = (
            self.db.query(Vehicle.dealer_name, Vehicle.dealer_id, func.count(Vehicle.vin))
            .filter(Vehicle.dealer_name.isnot(None))
            .group_by(Vehicle.dealer_name, Vehicle.dealer_id)
            .order_by(Vehicle.dealer_name)
            .all()
        )

        region = (input.get("region") or "").lower()
        dealers = []
        for name, did, count in dealer_rows:
            if region and region not in (name or "").lower():
                continue
            dealers.append({
                "name": name,
                "dealer_id": did,
                "vehicles_in_stock": count,
                "test_drive_available": True,
                "opening_hours": "Mo-Fr 08:00-18:30, Sa 09:00-16:00",
            })

        return {
            "total_dealers": len(dealers),
            "dealers": dealers[:20],
        }

    def _confirm_booking(self, input: Dict, session_id: str = None) -> Dict:
        vin = input.get("vin", "")
        v = self.db.query(Vehicle).filter(Vehicle.vin == vin).first()
        vehicle_name = v.name if v else "BMW"
        series = v.series if v else ""
        body_type = v.body_type if v else ""
        fuel_type = v.fuel_type if v else ""

        # Generate booking reference
        year = datetime.utcnow().year
        count = self.db.query(TestDriveBooking).count() + 1
        booking_ref = f"TD-{year}-{count:04d}"

        time_labels = {
            "morning": "Morgens (08:00 - 11:00)",
            "midday": "Mittags (11:00 - 13:00)",
            "afternoon": "Nachmittags (13:00 - 17:00)",
            "evening": "Abends (17:00 - 19:00)",
        }

        try:
            booking = TestDriveBooking(
                session_id=session_id or "",
                booking_ref=booking_ref,
                vin=vin,
                vehicle_name=vehicle_name,
                series=series,
                body_type=body_type,
                fuel_type=fuel_type,
                salutation=input.get("salutation", ""),
                first_name=input.get("first_name", ""),
                last_name=input.get("last_name", ""),
                email=input.get("email", ""),
                phone=input.get("phone", ""),
                preferred_date=input.get("preferred_date", ""),
                time_preference=input.get("time_preference", ""),
                dealer_name=input.get("dealer_name", ""),
                comments=input.get("comments", ""),
                status="confirmed",
            )
            self.db.add(booking)

            self.db.add(ActivityLog(
                event_type="test_drive_booked",
                title=f"Test Drive: {vehicle_name}",
                description=f"{input.get('first_name', '')} {input.get('last_name', '')} - {input.get('dealer_name', '')} - {input.get('preferred_date', '')}",
                session_id=session_id or "",
            ))
            self.db.commit()
        except Exception as e:
            logger.error(f"Failed to persist test drive booking: {e}")
            self.db.rollback()

        return {
            "status": "confirmed",
            "booking_reference": booking_ref,
            "vehicle": vehicle_name,
            "dealer": input.get("dealer_name", ""),
            "date": input.get("preferred_date", ""),
            "time": time_labels.get(input.get("time_preference", ""), input.get("time_preference", "")),
            "customer": f"{input.get('salutation', '')} {input.get('first_name', '')} {input.get('last_name', '')}".strip(),
            "email": input.get("email", ""),
            "phone": input.get("phone", ""),
            "note": "Your BMW dealer will contact you within 24 hours to confirm the exact appointment time.",
        }

    def is_available(self) -> bool:
        return self.client is not None
