"""Tool-use agent for customer-facing BMW sales chat — OpenAI version."""

import json
import logging
from typing import List, Dict, Any, Generator

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..config import OPENAI_API_KEY
from ..models.vehicle import Vehicle
from ..models.backoffice import ServiceRequest, ActivityLog

logger = logging.getLogger(__name__)

CUSTOMER_MODEL = "gpt-5.2"

SYSTEM_PROMPT = """You are Max, a knowledgeable and professional BMW Sales & Service Advisor for the Swiss market.

## Who You Are
You're a premium automotive consultant who helps customers find the perfect BMW from current Swiss dealer stock AND handles service requests. You know the BMW lineup inside and out.

## Language
ALWAYS reply in the same language the customer is using. If they write English, reply English. If German, reply German. Never switch languages mid-conversation.

## How You Work
- ALWAYS use search_inventory to find real vehicles before answering — never guess or invent
- When a customer mentions a budget, fuel type, body style, or any preference, search with those filters
- You can call search_inventory multiple times with different filters to explore options
- Use get_vehicle_details to look up specific vehicles the customer asks about
- Use compare_vehicles when a customer wants to compare two or more vehicles — especially when the customer asks WHY vehicles differ in price or specs
- Use schedule_test_drive when a customer wants to test drive a vehicle — collect name and contact FIRST
- Use book_service_appointment when a customer needs vehicle service, maintenance, or repairs
- Use get_inventory_overview for general availability questions

## Smart Behavior

### Budget mismatch — NEVER dead-end
If no vehicles match the customer's budget in their desired series/model, IMMEDIATELY search for alternatives:
1. First, tell them honestly nothing matches at that exact budget in that series
2. Then AUTOMATICALLY search for the cheapest options across ALL series at their budget
3. Show what IS available — always give the customer something to look at

### Don't repeat yourself
- Track what you've already asked. NEVER ask the same follow-up question twice.
- If the customer answered "cash or leasing?" — remember it. Don't ask again.
- If a vehicle card was already shown in a previous turn, do NOT recommend the same VIN again. Reference it by name in text instead ("the sedan we looked at earlier").

### Lead capture — be natural, not pushy
After the customer shows buying intent (asks about financing, test drives, discounts, or specific availability), naturally ask for their name and best contact (email or phone) so you can "get the dealer to reach out" or "send the details." Do this ONCE, smoothly — not repeatedly.

### Be honest about your limits
- You CANNOT negotiate prices or give discounts. You CAN connect the customer with the dealer who can.
- You CANNOT calculate custom lease/financing terms. You CAN show the indicative monthly rate from stock data and offer to have the dealer's finance team prepare a personal quote.
- If data is missing (year, mileage, etc.), say so briefly and offer to request it from the dealer — don't over-explain.

## How You Sound
- Professional yet warm — like a trusted BMW advisor
- Short, clear, helpful — no fluff
- Proactive — anticipate the next question, don't wait for it

## Response Format (STRICT)

The customer sees VEHICLE CARDS below your message with images, names, prices, and specs.
Your text MUST NOT duplicate what the cards show.

Format:
1. One short sentence answering their question (max 20 words)
2. If relevant, one brief insight (NO vehicle names or prices — cards handle that)
3. One follow-up question OR a next-step action (max 1 sentence)

HARD LIMIT: 3 sentences, under 40 words total. Shorter is better.

FORBIDDEN in your text:
- DO NOT list individual vehicle names or models
- DO NOT mention specific prices or CHF amounts
- DO NOT write bullet points listing cars
- DO NOT repeat any information shown on the vehicle cards

GOOD: "We have 12 limousines in stock across several series. Would you prefer petrol, diesel, or electric?"
BAD: "Here are some limousines: - BMW 3er 330i at CHF 56,500 - BMW 5er 520d at CHF 66,900"

## CRITICAL: Vehicle Selection
At the very end of your response, you MUST include a line listing the VINs of vehicles you are specifically recommending, in this exact format:
[RECOMMEND: vin1, vin2, vin3]

Rules:
- Max 3-5 VINs. Only include vehicles you are specifically recommending for THIS turn.
- Do NOT re-recommend VINs that were already shown in previous turns — the customer already sees them.
- If you don't recommend any NEW vehicles, output: [RECOMMEND: none]
- If the customer is asking about a previously shown vehicle, output [RECOMMEND: none] — they can scroll up.

This line will be hidden from the customer — it's used to display the correct vehicle cards."""

CUSTOMER_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_inventory",
            "description": "Search the BMW vehicle inventory. Use this EVERY TIME the customer asks about vehicles, budget, preferences, or availability.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Free-text search (model name, color, dealer, etc.)"},
                    "series": {"type": "string", "description": "BMW series: 1, 2, 3, 4, 5, 7, 8, X1, X2, X3, X4, X5, X6, X7, Z4, i4, i5, i7, iX, iX1, iX2, iX3, M"},
                    "fuel_type": {"type": "string", "enum": ["GASOLINE", "DIESEL", "ELECTRIC"], "description": "Fuel type filter"},
                    "body_type": {"type": "string", "enum": ["LIMOUSINE", "TOURING", "COUPE", "CABRIOLET", "SPORT_ACTIVITY_VEHICLE", "SC", "GRAN_COUPE", "GRAN_TURISMO", "SPORTS_HATCH", "ROADSTER"], "description": "Body type filter (LIMOUSINE = sedan)"},
                    "drive_type": {"type": "string", "description": "Drive type filter, e.g. XDRIVE for AWD"},
                    "color": {"type": "string", "description": "Color filter: WHITE, BLACK, GRAY, BLUE, RED, etc."},
                    "min_price": {"type": "number", "description": "Minimum price in CHF"},
                    "max_price": {"type": "number", "description": "Maximum price in CHF"},
                    "limit": {"type": "integer", "description": "Max results (default 8, max 20)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_vehicle_details",
            "description": "Get full details of a specific vehicle by VIN.",
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
            "name": "compare_vehicles",
            "description": "Compare two or more vehicles side by side.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vins": {"type": "array", "items": {"type": "string"}, "description": "List of VINs to compare"},
                },
                "required": ["vins"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_inventory_overview",
            "description": "Get a summary of what's available: total count, price range, series breakdown, fuel types.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schedule_test_drive",
            "description": "Schedule a test drive for a specific vehicle.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vin": {"type": "string", "description": "VIN of the vehicle"},
                    "customer_name": {"type": "string", "description": "Customer's name"},
                    "contact": {"type": "string", "description": "Email or phone"},
                    "preferred_date": {"type": "string", "description": "Preferred date/time"},
                },
                "required": ["vin"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_service_appointment",
            "description": "Book a service appointment for maintenance, repairs, tire changes, or inspections.",
            "parameters": {
                "type": "object",
                "properties": {
                    "service_type": {"type": "string", "enum": ["maintenance", "repair", "tire_change", "inspection", "recall", "other"], "description": "Type of service"},
                    "vehicle_description": {"type": "string", "description": "Customer's vehicle (model, year, or VIN)"},
                    "customer_name": {"type": "string", "description": "Customer's name"},
                    "contact": {"type": "string", "description": "Email or phone"},
                    "preferred_date": {"type": "string", "description": "Preferred date/time"},
                    "description": {"type": "string", "description": "Issue description"},
                },
                "required": ["service_type"],
            },
        },
    },
]


class CustomerAgentService:
    """Tool-use agent for customer-facing BMW sales chat (OpenAI)."""

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

    def chat(self, message: str, conversation_history: List[Dict[str, str]] = None) -> Dict[str, Any]:
        if not self.client:
            return {"message": "AI service is currently unavailable.", "recommended_vins": [], "all_vehicle_vins": [], "tool_calls": []}

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        if conversation_history:
            for msg in conversation_history[-10:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": message})

        tool_calls_log = []
        all_vehicle_vins = []

        for _ in range(6):
            try:
                response = self.client.chat.completions.create(
                    model=CUSTOMER_MODEL,
                    max_completion_tokens=1024,
                    messages=messages,
                    tools=CUSTOMER_TOOLS,
                )
            except Exception as e:
                logger.error(f"OpenAI API error: {e}")
                return {"message": "I apologize, but I encountered an error.", "recommended_vins": [], "all_vehicle_vins": all_vehicle_vins, "tool_calls": tool_calls_log}

            choice = response.choices[0]

            if choice.finish_reason == "tool_calls":
                messages.append(choice.message)
                for tc in choice.message.tool_calls:
                    args = json.loads(tc.function.arguments)
                    result = self._execute_tool(tc.function.name, args)
                    self._collect_vins(result, all_vehicle_vins)
                    result_str = json.dumps(result, default=str)
                    if len(result_str) > 8000:
                        result_str = result_str[:8000] + "... (truncated)"
                    tool_calls_log.append({"name": tc.function.name, "input": args})
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result_str})
            else:
                text = choice.message.content or ""
                import re
                recommend_match = re.search(r"\[RECOMMEND:\s*([^\]]*)\]", text)
                recommended_vins = []
                if recommend_match:
                    raw = recommend_match.group(1).strip()
                    if raw.lower() != "none":
                        recommended_vins = [v.strip() for v in raw.split(",") if v.strip()]
                clean_text = re.sub(r"\s*\[RECOMMEND:[^\]]*\]\s*", "", text).strip()
                return {"message": clean_text, "recommended_vins": recommended_vins, "all_vehicle_vins": list(dict.fromkeys(all_vehicle_vins)), "tool_calls": tool_calls_log}

        return {"message": "Could you rephrase your question?", "recommended_vins": [], "all_vehicle_vins": list(dict.fromkeys(all_vehicle_vins)), "tool_calls": tool_calls_log}

    def chat_stream(self, message: str, conversation_history: List[Dict[str, str]] = None) -> Generator[Dict[str, Any], None, None]:
        if not self.client:
            yield {"type": "text_delta", "content": "AI service is currently unavailable."}
            yield {"type": "done", "recommended_vins": [], "all_vins": []}
            return

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        if conversation_history:
            for msg in conversation_history[-10:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": message})

        all_vehicle_vins = []

        for _ in range(6):
            try:
                response = self.client.chat.completions.create(
                    model=CUSTOMER_MODEL,
                    max_completion_tokens=1024,
                    messages=messages,
                    tools=CUSTOMER_TOOLS,
                )
            except Exception as e:
                logger.error(f"OpenAI stream error: {e}")
                yield {"type": "text_delta", "content": "I apologize, but I encountered an error."}
                yield {"type": "done", "recommended_vins": [], "all_vins": all_vehicle_vins}
                return

            choice = response.choices[0]

            if choice.finish_reason == "tool_calls":
                messages.append(choice.message)
                for tc in choice.message.tool_calls:
                    args = json.loads(tc.function.arguments)
                    yield {"type": "tool_call", "name": tc.function.name, "input": args}
                    result = self._execute_tool(tc.function.name, args)
                    self._collect_vins(result, all_vehicle_vins)
                    result_str = json.dumps(result, default=str)
                    if len(result_str) > 8000:
                        result_str = result_str[:8000] + "... (truncated)"
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result_str})
            else:
                text = choice.message.content or ""
                import re
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

    def _execute_tool(self, name: str, input: Dict[str, Any]) -> Any:
        try:
            if name == "search_inventory":
                return self._search_inventory(input)
            elif name == "get_vehicle_details":
                return self._get_vehicle_details(input)
            elif name == "compare_vehicles":
                return self._compare_vehicles(input)
            elif name == "get_inventory_overview":
                return self._get_inventory_overview()
            elif name == "schedule_test_drive":
                return self._schedule_test_drive(input)
            elif name == "book_service_appointment":
                return self._book_service_appointment(input)
            else:
                return {"error": f"Unknown tool: {name}"}
        except Exception as e:
            logger.error(f"Tool {name} error: {e}")
            return {"error": str(e)}

    def _search_inventory(self, input: Dict) -> Dict:
        query = self.db.query(Vehicle)
        if input.get("series"):
            query = query.filter(Vehicle.series == input["series"])
        if input.get("fuel_type"):
            query = query.filter(Vehicle.fuel_type == input["fuel_type"])
        if input.get("body_type"):
            query = query.filter(Vehicle.body_type == input["body_type"])
        if input.get("drive_type"):
            query = query.filter(Vehicle.drive_type.ilike(f"%{input['drive_type']}%"))
        if input.get("color"):
            query = query.filter(Vehicle.color.ilike(f"%{input['color']}%"))
        if input.get("min_price"):
            query = query.filter(Vehicle.price_offer >= input["min_price"])
        if input.get("max_price"):
            query = query.filter(Vehicle.price_offer <= input["max_price"])
        if input.get("query"):
            term = f"%{input['query']}%"
            query = query.filter(or_(Vehicle.name.ilike(term), Vehicle.series.ilike(term), Vehicle.color.ilike(term), Vehicle.dealer_name.ilike(term), Vehicle.body_type.ilike(term), Vehicle.fuel_type.ilike(term), Vehicle.drive_type.ilike(term)))
        total = query.count()
        limit = min(input.get("limit", 8), 20)
        vehicles = query.order_by(Vehicle.price_offer.asc().nullslast()).limit(limit).all()
        return {"total_matching": total, "showing": len(vehicles), "vehicles": [{"vin": v.vin, "name": v.name, "series": v.series, "body_type": v.body_type, "fuel_type": v.fuel_type, "drive_type": v.drive_type, "color": v.color, "price_chf": v.price_offer, "price_formatted": v.price, "monthly_installment": v.monthly_installment, "power_hp": v.power_hp, "dealer": v.dealer_name} for v in vehicles]}

    def _get_vehicle_details(self, input: Dict) -> Dict:
        v = self.db.query(Vehicle).filter(Vehicle.vin == input["vin"]).first()
        if not v:
            return {"error": f"Vehicle {input['vin']} not found"}
        return {"vin": v.vin, "name": v.name, "series": v.series, "body_type": v.body_type, "fuel_type": v.fuel_type, "drive_type": v.drive_type, "transmission": v.transmission, "color": v.color, "upholstery_color": v.upholstery_color, "price_chf": v.price_offer, "price_formatted": v.price, "monthly_installment": v.monthly_installment, "power_kw": v.power_kw, "power_hp": v.power_hp, "door_count": v.door_count, "dealer": v.dealer_name, "url": v.url}

    def _compare_vehicles(self, input: Dict) -> Dict:
        vins = input.get("vins", [])[:5]
        vehicles = []
        for vin in vins:
            v = self.db.query(Vehicle).filter(Vehicle.vin == vin).first()
            if v:
                vehicles.append({"vin": v.vin, "name": v.name, "series": v.series, "body_type": v.body_type, "fuel_type": v.fuel_type, "drive_type": v.drive_type, "color": v.color, "price_chf": v.price_offer, "power_hp": v.power_hp, "monthly_installment": v.monthly_installment, "dealer": v.dealer_name})
        return {"vehicles": vehicles}

    def _get_inventory_overview(self) -> Dict:
        total = self.db.query(Vehicle).count()
        fuel_rows = self.db.query(Vehicle.fuel_type, func.count(Vehicle.vin)).group_by(Vehicle.fuel_type).all()
        fuel = {f: c for f, c in fuel_rows if f}
        series_rows = self.db.query(Vehicle.series, func.count(Vehicle.vin)).group_by(Vehicle.series).order_by(func.count(Vehicle.vin).desc()).limit(10).all()
        top_series = {s: c for s, c in series_rows if s}
        price_min = self.db.query(func.min(Vehicle.price_offer)).filter(Vehicle.price_offer > 0).scalar()
        price_max = self.db.query(func.max(Vehicle.price_offer)).scalar()
        return {"total_vehicles": total, "fuel_types": fuel, "top_series": top_series, "price_range_chf": {"cheapest": round(price_min) if price_min else None, "most_expensive": round(price_max) if price_max else None}}

    def _schedule_test_drive(self, input: Dict) -> Dict:
        vin = input.get("vin", "")
        v = self.db.query(Vehicle).filter(Vehicle.vin == vin).first()
        vehicle_name = v.name if v else vin
        dealer = v.dealer_name if v else "your nearest BMW dealer"
        return {"status": "confirmed", "message": f"Test drive request registered for {vehicle_name}", "vehicle": vehicle_name, "dealer": dealer, "customer_name": input.get("customer_name", ""), "contact": input.get("contact", ""), "preferred_date": input.get("preferred_date", "to be confirmed"), "note": "The dealer will contact you within 24 hours to confirm the exact time."}

    def _book_service_appointment(self, input: Dict) -> Dict:
        service_labels = {"maintenance": "Scheduled Maintenance", "repair": "Repair Service", "tire_change": "Tire Change", "inspection": "Vehicle Inspection (MFK)", "recall": "Recall Service", "other": "General Service"}
        service_type = input.get("service_type", "other")
        try:
            sr = ServiceRequest(service_type=service_type, vehicle_description=input.get("vehicle_description", ""), customer_name=input.get("customer_name", ""), contact=input.get("contact", ""), preferred_date=input.get("preferred_date", ""), description=input.get("description", ""), status="pending")
            self.db.add(sr)
            self.db.add(ActivityLog(event_type="service_request", title=f"Service: {service_labels.get(service_type, service_type)}", description=f"{input.get('customer_name', 'Customer')} — {input.get('vehicle_description', '')}"))
            self.db.commit()
        except Exception as e:
            logger.error(f"Failed to persist service request: {e}")
        return {"status": "confirmed", "message": f"Service appointment registered: {service_labels.get(service_type, service_type)}", "service_type": service_labels.get(service_type, service_type), "vehicle": input.get("vehicle_description", ""), "customer_name": input.get("customer_name", ""), "contact": input.get("contact", ""), "preferred_date": input.get("preferred_date", "to be confirmed"), "description": input.get("description", ""), "note": "Your BMW Service Advisor will confirm the appointment."}

    def is_available(self) -> bool:
        return self.client is not None
