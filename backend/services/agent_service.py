"""Tool-use agent service for Hedin backoffice."""

import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from sqlalchemy import func, desc, or_
from sqlalchemy.orm import Session

from ..config import OPENAI_API_KEY, CHAT_MODEL
from ..models.vehicle import Vehicle
from ..models.backoffice import Lead, Conversation, ConversationMessage, ActivityLog

logger = logging.getLogger(__name__)

AGENT_SYSTEM_PROMPT = """You are the Hedin AI Agent — the internal operations assistant for Hedin Automotive dealership staff.

You have full access to the dealership systems via tools. Use them to answer questions with real data.

## What you can do
- Search and analyze the full vehicle inventory (stock, pricing, specs, availability)
- Look up specific vehicles by VIN
- Review leads, their scores, status, and conversation history
- Get dashboard KPIs and activity feeds
- Analyze trends across inventory and leads
- Draft follow-up emails referencing specific vehicles
- Compare vehicles for staff or customers

## How you work
- ALWAYS use tools to get real data before answering — never guess or make up numbers
- When asked about inventory, search first, then summarize findings
- Be concise and data-driven. Use numbers, not vague statements.
- Format responses for a terminal — use plain text, not markdown headers
- When listing vehicles, include: name, series, fuel type, price, dealer
- Keep responses actionable for sales staff

## Rules
- If you don't have enough data, say so and suggest what tool to try
- Never fabricate vehicle specs, prices, or availability
- Prices are in CHF (Swiss market)
"""

AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_inventory",
            "description": "Search the vehicle inventory. Returns matching vehicles with specs and pricing. Use this to answer any question about available stock.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Free-text search (name, VIN, color, dealer, model, etc.)"},
                    "series": {"type": "string", "description": "Filter by series: 1, 2, 3, 4, 5, 7, 8, X1-X7, Z4, i4, i5, i7, iX, iX1-iX3, M"},
                    "fuel_type": {"type": "string", "description": "GASOLINE, DIESEL, or ELECTRIC"},
                    "body_type": {"type": "string", "description": "LIMOUSINE, TOURING, COUPE, CABRIOLET, SPORT_ACTIVITY_VEHICLE, SC, GRAN_COUPE, GRAN_TURISMO"},
                    "min_price": {"type": "number", "description": "Minimum price in CHF"},
                    "max_price": {"type": "number", "description": "Maximum price in CHF"},
                    "limit": {"type": "integer", "description": "Max results (default 10, max 50)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_vehicle",
            "description": "Get full details of a specific vehicle by its VIN.",
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
            "name": "get_inventory_stats",
            "description": "Get inventory overview: total vehicles, breakdown by fuel type, series, body type, price range, and dealer count.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_leads",
            "description": "Get customer leads. Returns lead ID, status, score, contact info, and vehicles of interest.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "description": "Filter: new, contacted, qualified, converted, lost"},
                    "limit": {"type": "integer", "description": "Max results (default 20)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_lead_detail",
            "description": "Get full details of a lead including their conversation transcript.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_id": {"type": "integer", "description": "The lead ID"},
                },
                "required": ["lead_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_conversations",
            "description": "Get recent customer chat conversations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max results (default 20)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_conversation_transcript",
            "description": "Get the full message transcript of a specific conversation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "conversation_id": {"type": "integer", "description": "The conversation ID"},
                },
                "required": ["conversation_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_activity",
            "description": "Get recent activity feed: new leads, messages, emails sent, status changes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max events (default 30)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_dashboard_stats",
            "description": "Get dashboard KPIs: total leads, new today, active conversations, avg lead score, top vehicles by interest.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
]


class AgentService:
    """Tool-use agent with full DB access."""

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
            logger.error(f"Failed to init agent client: {e}")

    def chat(
        self,
        message: str,
        conversation_history: List[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Run agent with tool loop. Returns {message, tool_calls}."""
        if not self.client:
            return {"message": "AI service unavailable.", "tool_calls": []}

        messages = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}]
        if conversation_history:
            for msg in conversation_history[-10:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": message})

        tool_calls_log = []
        max_iterations = 10

        for _ in range(max_iterations):
            try:
                response = self.client.chat.completions.create(
                    model=CHAT_MODEL,
                    max_completion_tokens=2048,
                    messages=messages,
                    tools=AGENT_TOOLS,
                )
            except Exception as e:
                logger.error(f"Agent API error: {e}")
                return {"message": f"Error: {e}", "tool_calls": tool_calls_log}

            choice = response.choices[0]

            if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
                # Add assistant's message (contains tool_calls metadata)
                messages.append(choice.message)

                # Process each tool call
                for tc in choice.message.tool_calls:
                    tool_name = tc.function.name
                    tool_input = json.loads(tc.function.arguments)

                    # Execute the tool
                    result = self._execute_tool(tool_name, tool_input)
                    result_str = json.dumps(result, default=str)

                    # Truncate very large results
                    if len(result_str) > 8000:
                        result_str = result_str[:8000] + '... (truncated)'

                    tool_calls_log.append({
                        "name": tool_name,
                        "input": tool_input,
                        "result_summary": self._summarize_result(tool_name, result),
                    })

                    # Append tool result as individual message
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result_str,
                    })
            else:
                # Final text response
                text = choice.message.content or ""
                return {"message": text, "tool_calls": tool_calls_log}

        return {"message": "Agent reached max iterations.", "tool_calls": tool_calls_log}

    def _summarize_result(self, tool_name: str, result: Any) -> str:
        """Short summary for terminal display."""
        if isinstance(result, dict):
            if "count" in result:
                return f"{result['count']} results"
            if "total_vehicles" in result:
                return f"{result['total_vehicles']} vehicles"
            if "total_leads" in result:
                return f"{result['total_leads']} leads"
            if "vin" in result:
                return result.get("name", result["vin"])
        if isinstance(result, list):
            return f"{len(result)} items"
        return "ok"

    def _execute_tool(self, name: str, input: Dict[str, Any]) -> Any:
        """Execute a tool against the database."""
        try:
            if name == "search_inventory":
                return self._search_inventory(input)
            elif name == "get_vehicle":
                return self._get_vehicle(input)
            elif name == "get_inventory_stats":
                return self._get_inventory_stats()
            elif name == "get_leads":
                return self._get_leads(input)
            elif name == "get_lead_detail":
                return self._get_lead_detail(input)
            elif name == "get_conversations":
                return self._get_conversations(input)
            elif name == "get_conversation_transcript":
                return self._get_conversation_transcript(input)
            elif name == "get_activity":
                return self._get_activity(input)
            elif name == "get_dashboard_stats":
                return self._get_dashboard_stats()
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
        if input.get("min_price"):
            query = query.filter(Vehicle.price_offer >= input["min_price"])
        if input.get("max_price"):
            query = query.filter(Vehicle.price_offer <= input["max_price"])
        if input.get("query"):
            term = f"%{input['query']}%"
            query = query.filter(
                or_(
                    Vehicle.name.ilike(term),
                    Vehicle.series.ilike(term),
                    Vehicle.color.ilike(term),
                    Vehicle.dealer_name.ilike(term),
                    Vehicle.vin.ilike(term),
                    Vehicle.body_type.ilike(term),
                    Vehicle.fuel_type.ilike(term),
                    Vehicle.drive_type.ilike(term),
                )
            )

        total = query.count()
        limit = min(input.get("limit", 10), 50)
        vehicles = query.order_by(Vehicle.price_offer.asc().nullslast()).limit(limit).all()

        return {
            "count": total,
            "vehicles": [
                {
                    "vin": v.vin,
                    "name": v.name,
                    "series": v.series,
                    "body_type": v.body_type,
                    "fuel_type": v.fuel_type,
                    "drive_type": v.drive_type,
                    "color": v.color,
                    "price_chf": v.price_offer,
                    "price_formatted": v.price,
                    "monthly": v.monthly_installment,
                    "power_hp": v.power_hp,
                    "dealer": v.dealer_name,
                    "status": v.sales_status,
                }
                for v in vehicles
            ],
        }

    def _get_vehicle(self, input: Dict) -> Dict:
        v = self.db.query(Vehicle).filter(Vehicle.vin == input["vin"]).first()
        if not v:
            return {"error": f"Vehicle {input['vin']} not found"}
        return v.to_dict()

    def _get_inventory_stats(self) -> Dict:
        total = self.db.query(Vehicle).count()

        # Fuel breakdown
        fuel_rows = self.db.query(Vehicle.fuel_type, func.count(Vehicle.vin)).group_by(Vehicle.fuel_type).all()
        fuel = {f: c for f, c in fuel_rows if f}

        # Series breakdown
        series_rows = self.db.query(Vehicle.series, func.count(Vehicle.vin)).group_by(Vehicle.series).order_by(desc(func.count(Vehicle.vin))).all()
        series = {s: c for s, c in series_rows if s}

        # Body type breakdown
        body_rows = self.db.query(Vehicle.body_type, func.count(Vehicle.vin)).group_by(Vehicle.body_type).all()
        body = {b: c for b, c in body_rows if b}

        # Price range
        price_min = self.db.query(func.min(Vehicle.price_offer)).filter(Vehicle.price_offer > 0).scalar()
        price_max = self.db.query(func.max(Vehicle.price_offer)).scalar()
        price_avg = self.db.query(func.avg(Vehicle.price_offer)).filter(Vehicle.price_offer > 0).scalar()

        # Dealers
        dealer_count = self.db.query(func.count(func.distinct(Vehicle.dealer_name))).scalar()

        return {
            "total_vehicles": total,
            "fuel_type_breakdown": fuel,
            "series_breakdown": series,
            "body_type_breakdown": body,
            "price_range_chf": {
                "min": round(price_min, 0) if price_min else None,
                "max": round(price_max, 0) if price_max else None,
                "avg": round(price_avg, 0) if price_avg else None,
            },
            "dealer_count": dealer_count,
        }

    def _get_leads(self, input: Dict) -> List[Dict]:
        query = self.db.query(Lead).order_by(desc(Lead.updated_at))
        if input.get("status"):
            query = query.filter(Lead.status == input["status"])
        limit = min(input.get("limit", 20), 50)
        leads = query.limit(limit).all()

        return [
            {
                "id": l.id,
                "status": l.status,
                "score": l.score,
                "name": l.customer_name,
                "email": l.customer_email,
                "phone": l.customer_phone,
                "vehicles": l.interested_vehicles_list[:5],
                "summary": l.summary,
                "created": l.created_at.isoformat() if l.created_at else None,
                "updated": l.updated_at.isoformat() if l.updated_at else None,
            }
            for l in leads
        ]

    def _get_lead_detail(self, input: Dict) -> Dict:
        lead = self.db.query(Lead).filter(Lead.id == input["lead_id"]).first()
        if not lead:
            return {"error": f"Lead {input['lead_id']} not found"}

        conv = self.db.query(Conversation).filter(Conversation.lead_id == lead.id).first()
        messages = []
        if conv:
            for m in conv.messages:
                messages.append({
                    "role": m.role,
                    "content": m.content[:500],
                    "vehicles_shown": m.vehicles_shown_list,
                    "time": m.created_at.isoformat() if m.created_at else None,
                })

        return {
            "id": lead.id,
            "session_id": lead.session_id,
            "status": lead.status,
            "score": lead.score,
            "name": lead.customer_name,
            "email": lead.customer_email,
            "phone": lead.customer_phone,
            "vehicles": lead.interested_vehicles_list,
            "summary": lead.summary,
            "notes": lead.notes,
            "message_count": len(messages),
            "messages": messages,
        }

    def _get_conversations(self, input: Dict) -> List[Dict]:
        limit = min(input.get("limit", 20), 50)
        convs = self.db.query(Conversation).order_by(desc(Conversation.updated_at)).limit(limit).all()
        return [
            {
                "id": c.id,
                "session_id": c.session_id[:12],
                "lead_id": c.lead_id,
                "message_count": c.message_count,
                "status": c.status,
                "updated": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in convs
        ]

    def _get_conversation_transcript(self, input: Dict) -> Dict:
        conv = self.db.query(Conversation).filter(Conversation.id == input["conversation_id"]).first()
        if not conv:
            return {"error": f"Conversation {input['conversation_id']} not found"}

        return {
            "id": conv.id,
            "status": conv.status,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "vehicles_shown": m.vehicles_shown_list,
                    "time": m.created_at.isoformat() if m.created_at else None,
                }
                for m in conv.messages
            ],
        }

    def _get_activity(self, input: Dict) -> List[Dict]:
        limit = min(input.get("limit", 30), 100)
        items = self.db.query(ActivityLog).order_by(desc(ActivityLog.created_at)).limit(limit).all()
        return [
            {
                "event": a.event_type,
                "title": a.title,
                "description": a.description,
                "time": a.created_at.isoformat() if a.created_at else None,
            }
            for a in items
        ]

    def _get_dashboard_stats(self) -> Dict:
        total_leads = self.db.query(func.count(Lead.id)).scalar() or 0
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        new_today = self.db.query(func.count(Lead.id)).filter(Lead.created_at >= today).scalar() or 0
        active_convs = self.db.query(func.count(Conversation.id)).filter(Conversation.status == "active").scalar() or 0
        avg_score = self.db.query(func.avg(Lead.score)).scalar() or 0

        leads = self.db.query(Lead).all()
        vin_counts: Dict[str, int] = {}
        for lead in leads:
            for vin in lead.interested_vehicles_list:
                vin_counts[vin] = vin_counts.get(vin, 0) + 1
        top_vehicles = sorted(vin_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        return {
            "total_leads": total_leads,
            "new_today": new_today,
            "active_conversations": active_convs,
            "avg_score": round(avg_score, 1),
            "top_vehicles": [{"vin": v, "count": c} for v, c in top_vehicles],
        }
