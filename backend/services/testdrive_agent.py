"""Specialized AI agent for BMW test drive booking — conversational booking flow."""

import json
import logging
import re
from datetime import datetime
from typing import List, Dict, Any, Generator

from sqlalchemy.orm import Session

from ..config import OPENAI_API_KEY
from ..models.backoffice import TestDriveBooking, ActivityLog

logger = logging.getLogger(__name__)

TESTDRIVE_MODEL = "gpt-5.2"

SYSTEM_PROMPT = """You are the BMW Probefahrt (Test Drive) Booking Assistant for Switzerland.

## Your Mission
Guide each customer step-by-step through booking a test drive. You are warm, efficient, and professional. Speak the language the customer uses (German or English).

## STRICT Booking Flow — follow these steps IN ORDER:

### Step 1: Vehicle Selection
- Ask what BMW model they'd like to test drive
- Use browse_test_drive_models to show available models
- Once they pick a model, CONFIRM their choice and move to Step 2
- Do NOT show more cars after they've chosen one

### Step 2: Dealer / Location
- Use get_available_dealers to list BMW partners in their area
- Ask which dealer they prefer, or if they have a location preference
- Once they pick a dealer, CONFIRM and move to Step 3

### Step 3: Date & Time
- Ask for their preferred date and time of day
- Time options: Morgens (8-11), Mittags (11-13), Nachmittags (13-17), Abends (17-19)
- Once they provide date + time, CONFIRM and move to Step 4

### Step 4: Personal Details
- Collect: Anrede (Herr/Frau), Vorname, Nachname, E-Mail, Telefon
- Ask for all details in ONE message to keep it efficient
- Once provided, CONFIRM everything and proceed to booking

### Step 5: Confirmation
- Use confirm_test_drive_booking with ALL collected details
- Show a clear summary with the booking reference
- Tell them their BMW partner will contact them within 24h

## CRITICAL RULES:
1. Move through steps sequentially. Do NOT skip steps or go back.
2. After showing models, do NOT keep showing more unless asked. Guide them to CHOOSE.
3. Keep responses SHORT — 2-3 sentences max.
4. NEVER dump all questions at once. One step at a time.
5. When the customer selects a model, immediately move to dealer selection.
6. Do NOT include [RECOMMEND:...] tags in your text output.

## Model Recommendation Format
At the END of your response (only when showing models), add:
[RECOMMEND: model_id1, model_id2]
Use "none" when not recommending models: [RECOMMEND: none]"""

TESTDRIVE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "browse_test_drive_models",
            "description": "Browse BMW models available for test drive. Use to show the customer what they can test drive.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Free-text search (e.g. 'electric SUV', 'X3', 'M Performance')"},
                    "series": {"type": "string", "description": "BMW series: 1, 2, 3, 4, 5, 7, X1, X2, X3, X4, X5, X6, X7, Z4, i4, i5, i7, iX, M, XM"},
                    "powertrain": {"type": "string", "enum": ["gasoline", "electric", "hybrid"], "description": "Powertrain type"},
                    "body_type": {"type": "string", "description": "Body type: SAV, SAC, Limousine, Touring, Coupé, Cabriolet, Gran Coupé, Roadster, Hatchback, Active Tourer"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_model_details",
            "description": "Get full details of a specific test drive model.",
            "parameters": {
                "type": "object",
                "properties": {
                    "model_id": {"type": "string", "description": "Model ID from the catalog"},
                },
                "required": ["model_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_available_dealers",
            "description": "Get BMW dealers in Switzerland offering test drives. Call this after the customer has selected a vehicle.",
            "parameters": {
                "type": "object",
                "properties": {
                    "region": {"type": "string", "description": "Region filter: Zurich, Bern, Basel, Geneva, Lausanne, Luzern, St. Gallen, Winterthur, etc."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "confirm_test_drive_booking",
            "description": "Finalize and confirm the test drive booking. Call ONLY when all details are collected: model, dealer, date, time, and personal info.",
            "parameters": {
                "type": "object",
                "properties": {
                    "model_id": {"type": "string", "description": "Selected model ID"},
                    "model_name": {"type": "string", "description": "Selected model name"},
                    "dealer_name": {"type": "string", "description": "Selected dealer"},
                    "preferred_date": {"type": "string", "description": "Preferred date"},
                    "time_preference": {"type": "string", "enum": ["morning", "midday", "afternoon", "evening"], "description": "Time of day"},
                    "salutation": {"type": "string", "enum": ["Herr", "Frau"], "description": "Anrede"},
                    "first_name": {"type": "string", "description": "Vorname"},
                    "last_name": {"type": "string", "description": "Nachname"},
                    "email": {"type": "string", "description": "E-Mail"},
                    "phone": {"type": "string", "description": "Telefon"},
                    "comments": {"type": "string", "description": "Optional comments"},
                },
                "required": ["model_id", "model_name", "dealer_name", "preferred_date", "time_preference", "first_name", "last_name", "email"],
            },
        },
    },
]

# Swiss BMW dealers (curated list)
SWISS_DEALERS = [
    {"name": "BMW Niederlassung Zürich-Dielsdorf", "region": "Zürich", "address": "Wehntalerstrasse 180, 8157 Dielsdorf"},
    {"name": "BMW Niederlassung Zürich", "region": "Zürich", "address": "Badenerstrasse 600, 8048 Zürich"},
    {"name": "Auto Frey AG", "region": "Zürich", "address": "Luggwegstrasse 9, 8048 Zürich"},
    {"name": "Häusermann AG", "region": "Zürich", "address": "Giesshübelstrasse 40, 8045 Zürich"},
    {"name": "BMW Niederlassung Bern", "region": "Bern", "address": "Worblentalstrasse 32, 3063 Ittigen"},
    {"name": "Auto Wederich AG", "region": "Bern", "address": "Bernstrasse 388, 3154 Rüschegg"},
    {"name": "Hedin Automotive Basel AG", "region": "Basel", "address": "St. Jakobs-Strasse 399, 4052 Basel"},
    {"name": "BMW Niederlassung Basel", "region": "Basel", "address": "Grosspeterstrasse 45, 4002 Basel"},
    {"name": "Automobile Fankhauser AG", "region": "Luzern", "address": "Friedentalstrasse 43, 6004 Luzern"},
    {"name": "Gruss AG", "region": "Luzern", "address": "Industriestrasse 18, 6034 Inwil"},
    {"name": "Heron Automobiles SA", "region": "Genève", "address": "Chemin de la Marbrerie 8, 1227 Carouge"},
    {"name": "Grand Garage Simond SA", "region": "Genève", "address": "Route de Meyrin 49, 1202 Genève"},
    {"name": "Garage de l'Union SA", "region": "Lausanne", "address": "Route de Berne 2, 1010 Lausanne"},
    {"name": "Autobritt SA", "region": "Lausanne", "address": "Avenue du Grey 48, 1004 Lausanne"},
    {"name": "Alpstaeg Automobile AG", "region": "St. Gallen", "address": "Zürcher Strasse 505, 9015 St. Gallen"},
    {"name": "Keller Automobile AG", "region": "Winterthur", "address": "Zürcherstrasse 41, 8400 Winterthur"},
    {"name": "Auto Ziegler AG", "region": "Aarau", "address": "Rohrerstrasse 25, 5000 Aarau"},
    {"name": "Garage Galliker AG", "region": "Zug", "address": "Zugerbergstrasse 2, 6300 Zug"},
    {"name": "Schaller Automobile AG", "region": "Thun", "address": "Gwattstrasse 142, 3600 Thun"},
    {"name": "Itin + Holliger AG", "region": "Solothurn", "address": "Bielstrasse 56, 4500 Solothurn"},
]


class TestDriveAgentService:
    """AI agent for test drive booking — uses model catalog, not dealer inventory."""

    def __init__(self, db: Session, models: list[dict] | None = None):
        self.db = db
        self.models = models or []
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
            yield {"type": "done"}
            return

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        if conversation_history:
            for msg in conversation_history[-20:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": message})

        all_model_ids: list[str] = []

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
                yield {"type": "done"}
                return

            choice = response.choices[0]

            if choice.finish_reason == "tool_calls":
                messages.append(choice.message)
                for tc in choice.message.tool_calls:
                    args = json.loads(tc.function.arguments)
                    yield {"type": "tool_call", "name": tc.function.name, "input": args}
                    result = self._execute_tool(tc.function.name, args, session_id)
                    self._collect_model_ids(result, all_model_ids)
                    result_str = json.dumps(result, default=str)
                    if len(result_str) > 8000:
                        result_str = result_str[:8000] + "... (truncated)"
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result_str})
            else:
                text = choice.message.content or ""
                # Extract recommendations
                recommend_match = re.search(r"\[RECOMMEND:\s*([^\]]*)\]", text)
                recommended_ids = []
                if recommend_match:
                    raw = recommend_match.group(1).strip()
                    if raw.lower() != "none":
                        recommended_ids = [v.strip() for v in raw.split(",") if v.strip()]
                clean_text = re.sub(r"\s*\[RECOMMEND:[^\]]*\]\s*", "", text).strip()

                yield {"type": "text_delta", "content": clean_text}

                # Send model cards if we have recommendations
                ids_to_show = recommended_ids if recommended_ids else [x for x in all_model_ids if x]
                if ids_to_show:
                    yield {"type": "models", "model_ids": ids_to_show[:5]}

                yield {"type": "done"}
                return

        yield {"type": "text_delta", "content": "Could you rephrase your question?"}
        yield {"type": "done"}

    def _collect_model_ids(self, result: Any, ids: list[str]):
        if isinstance(result, dict):
            if "id" in result:
                ids.append(result["id"])
            if "models" in result and isinstance(result["models"], list):
                for m in result["models"]:
                    if isinstance(m, dict) and "id" in m:
                        ids.append(m["id"])

    def _execute_tool(self, name: str, args: Dict[str, Any], session_id: str = None) -> Any:
        try:
            if name == "browse_test_drive_models":
                return self._browse_models(args)
            elif name == "get_model_details":
                return self._get_model(args)
            elif name == "get_available_dealers":
                return self._get_dealers(args)
            elif name == "confirm_test_drive_booking":
                return self._confirm_booking(args, session_id)
            else:
                return {"error": f"Unknown tool: {name}"}
        except Exception as e:
            logger.error(f"Tool {name} error: {e}")
            return {"error": str(e)}

    def _browse_models(self, args: Dict) -> Dict:
        results = list(self.models)

        if args.get("series"):
            s = args["series"].lower()
            results = [m for m in results if m.get("series", "").lower() == s]
        if args.get("powertrain"):
            p = args["powertrain"].lower()
            results = [m for m in results if m.get("powertrain", "").lower() == p]
        if args.get("body_type"):
            b = args["body_type"].lower()
            results = [m for m in results if b in m.get("body_type", "").lower()]
        if args.get("query"):
            q = args["query"].lower()
            results = [m for m in results if
                       q in m.get("name", "").lower() or
                       q in m.get("series", "").lower() or
                       q in m.get("body_type", "").lower() or
                       q in m.get("highlight", "").lower() or
                       q in m.get("powertrain", "").lower()]

        return {
            "total_available": len(results),
            "models": [{
                "id": m["id"],
                "name": m["name"],
                "series": m.get("series", ""),
                "body_type": m.get("body_type", ""),
                "powertrain": m.get("powertrain", ""),
                "starting_price_chf": m.get("starting_price"),
                "power_hp": m.get("power_hp"),
                "range_km": m.get("range_km"),
                "highlight": m.get("highlight", ""),
            } for m in results[:8]],
        }

    def _get_model(self, args: Dict) -> Dict:
        model_id = args.get("model_id", "")
        m = next((x for x in self.models if x["id"] == model_id), None)
        if not m:
            return {"error": f"Model '{model_id}' not found"}
        return {
            "id": m["id"],
            "name": m["name"],
            "series": m.get("series", ""),
            "body_type": m.get("body_type", ""),
            "powertrain": m.get("powertrain", ""),
            "starting_price_chf": m.get("starting_price"),
            "power_hp": m.get("power_hp"),
            "range_km": m.get("range_km"),
            "highlight": m.get("highlight", ""),
            "url": m.get("url", ""),
        }

    def _get_dealers(self, args: Dict) -> Dict:
        region = (args.get("region") or "").lower()
        dealers = SWISS_DEALERS
        if region:
            dealers = [d for d in dealers if region in d["region"].lower()]
        return {
            "total_dealers": len(dealers),
            "dealers": [{
                "name": d["name"],
                "region": d["region"],
                "address": d["address"],
                "test_drive_available": True,
                "opening_hours": "Mo-Fr 08:00-18:30, Sa 09:00-16:00",
            } for d in dealers[:10]],
        }

    def _confirm_booking(self, args: Dict, session_id: str = None) -> Dict:
        model_name = args.get("model_name", "BMW")
        model_id = args.get("model_id", "")
        m = next((x for x in self.models if x["id"] == model_id), None)
        series = m.get("series", "") if m else ""

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
                vin=model_id,
                vehicle_name=model_name,
                series=series,
                body_type=m.get("body_type", "") if m else "",
                fuel_type=m.get("powertrain", "") if m else "",
                salutation=args.get("salutation", ""),
                first_name=args.get("first_name", ""),
                last_name=args.get("last_name", ""),
                email=args.get("email", ""),
                phone=args.get("phone", ""),
                preferred_date=args.get("preferred_date", ""),
                time_preference=args.get("time_preference", ""),
                dealer_name=args.get("dealer_name", ""),
                comments=args.get("comments", ""),
                status="confirmed",
            )
            self.db.add(booking)

            self.db.add(ActivityLog(
                event_type="test_drive_booked",
                title=f"Probefahrt: {model_name}",
                description=f"{args.get('first_name', '')} {args.get('last_name', '')} — {args.get('dealer_name', '')} — {args.get('preferred_date', '')}",
                session_id=session_id or "",
            ))
            self.db.commit()
        except Exception as e:
            logger.error(f"Failed to persist booking: {e}")
            self.db.rollback()

        return {
            "status": "confirmed",
            "booking_reference": booking_ref,
            "vehicle": model_name,
            "dealer": args.get("dealer_name", ""),
            "date": args.get("preferred_date", ""),
            "time": time_labels.get(args.get("time_preference", ""), args.get("time_preference", "")),
            "customer": f"{args.get('salutation', '')} {args.get('first_name', '')} {args.get('last_name', '')}".strip(),
            "email": args.get("email", ""),
            "phone": args.get("phone", ""),
            "note": "Ihr BMW Partner wird sich innerhalb von 24 Stunden bei Ihnen melden, um den genauen Termin zu bestätigen.",
        }

    def is_available(self) -> bool:
        return self.client is not None
