"""Claude API service for AI-powered chat."""

import logging
from typing import List, Dict, Any, Optional

from ..config import ANTHROPIC_API_KEY, CLAUDE_MODEL, MAX_CONTEXT_VEHICLES

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Max, a knowledgeable and professional BMW Sales Advisor for the Swiss market.

## Who You Are
You're a premium automotive consultant who helps customers find the perfect BMW from current Swiss dealer stock. You speak German and English fluently, keeping things clear and helpful. You know the BMW lineup inside and out — series, body types, fuel options, drivetrains, and pricing.

## What You Do
- Help customers find the right BMW vehicle from available stock
- Compare models, series, and configurations
- Advise on fuel types (BEV, PHEV, petrol, diesel), drivetrains (xDrive, rear-wheel)
- Guide customers on pricing, body types, colors, and dealer availability

## How You Sound
- Professional yet warm — like a trusted BMW advisor
- Knowledgeable about automotive features and BMW brand values
- Keep responses short, clear, and helpful
- Highlight key differentiators between vehicles

## Rules You Must Follow
1. **Only recommend vehicles from the provided context** — never invent vehicles or specs
2. **Always use CHF for prices** — Swiss market only
3. **Stay professional in both languages** — German or English
4. **Base answers on provided vehicle context** — use the vehicle data given to you
5. **If unsure, be honest** — suggest visiting the nearest BMW dealer

## Response Format (STRICT)
Your responses MUST be scannable in under 5 seconds. Follow this structure:

1. **One-line lead** — a direct answer or summary (1 sentence, max 15 words).
2. **Bullet points** — if recommending multiple vehicles, use `- **Vehicle Name** — ` followed by ONE short reason why it fits (max 12 words each).
3. **Optional closer** — one short follow-up question (max 1 sentence).

Example of a GOOD response:
```
Here are two great electric SUV options in your budget:

- **BMW iX xDrive40** — 326 HP, ideal for families, spacious and efficient
- **BMW iX3** — compact electric SUV, great city-to-highway range

Would you prefer more range or a sportier drive?
```

Rules:
- NEVER write paragraphs. Always use bullet points for multiple items.
- The user sees vehicle cards with images, prices, specs — do NOT repeat those details.
- Focus on *why it fits the customer's needs*, not listing specs.
- Skip greetings after the first message.
- Max 80 words total.

You have access to the BMW vehicle inventory through the context provided. Each vehicle in the context has a VIN in the format [VIN=...].

## CRITICAL: Vehicle Selection
At the very end of your response, you MUST include a line listing the VINs of vehicles you are specifically recommending, in this exact format:
[RECOMMEND: vin1, vin2, vin3]

Only include vehicles you actually discuss or recommend. If you don't recommend any specific vehicles, output:
[RECOMMEND: none]

This line will be hidden from the customer — it's used to display the correct vehicle cards. Vehicle cards with images, prices, and links will be displayed alongside your response automatically."""


class ClaudeService:
    """Service for Claude API interactions."""

    def __init__(self):
        self.client = None
        self._init_client()

    def _init_client(self):
        if not ANTHROPIC_API_KEY:
            logger.warning("ANTHROPIC_API_KEY not set")
            return

        try:
            import anthropic
            self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
            logger.info("Claude client initialized")
        except ImportError:
            logger.error("anthropic package not installed")
        except Exception as e:
            logger.error(f"Failed to initialize Claude client: {e}")

    def chat(
        self,
        message: str,
        context: str,
        conversation_history: List[Dict[str, str]] = None,
    ) -> str:
        if not self.client:
            return "I'm sorry, but the AI service is currently unavailable. Please try again later."

        messages = []

        if conversation_history:
            for msg in conversation_history[-10:]:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"],
                })

        user_message = message
        if context:
            user_message = f"""Based on the following vehicle inventory:

{context}

Customer question: {message}"""

        messages.append({"role": "user", "content": user_message})

        try:
            response = self.client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=messages,
            )
            return response.content[0].text

        except Exception as e:
            logger.error(f"Claude API error: {e}")
            return "I apologize, but I encountered an error processing your request. Please try again."

    def generate_suggested_questions(
        self,
        context: str,
        last_response: str,
    ) -> List[str]:
        if not self.client:
            return []

        prompt = f"""Based on this BMW vehicle inventory:
{context[:1000]}

And this conversation response:
{last_response[:500]}

Generate 3 short, relevant follow-up questions a car buyer might ask about BMW vehicles. Focus on comparisons, features, pricing, or availability. Return only the questions, one per line, without numbering."""

        try:
            response = self.client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )

            questions = response.content[0].text.strip().split("\n")
            return [q.strip() for q in questions if q.strip()][:3]

        except Exception as e:
            logger.error(f"Failed to generate suggestions: {e}")
            return []

    def expand_search_queries(self, message: str, conversation_history: List[Dict[str, str]] = None) -> List[str]:
        """Generate search queries for BMW vehicle inventory from a user message."""
        if not self.client:
            return [message]

        history_context = ""
        if conversation_history:
            last_msgs = conversation_history[-4:]
            history_context = "\n".join(f"{m['role']}: {m['content']}" for m in last_msgs)
            history_context = f"\nRecent conversation:\n{history_context}\n"

        prompt = f"""You are a search query generator for a BMW vehicle inventory in Switzerland.
{history_context}
Customer message: "{message}"

The inventory contains BMW vehicles with these attributes:
SERIES: 1, 2, 3, 4, 5, 7, 8, X1, X2, X3, X4, X5, X6, X7, Z4, i4, i5, i7, iX, iX1, iX2, iX3, M
BODY TYPES: SEDAN, TOURING, COUPE, CONVERTIBLE, SPORT_ACTIVITY_VEHICLE, SPORT_ACTIVITY_COUPE, GRAN_COUPE, GRAN_TURISMO, SC
FUEL TYPES: GASOLINE, DIESEL, ELECTRIC
DRIVE TYPES: XDRIVE (AWD), rear-wheel drive
COLORS: WHITE, BLACK, GRAY, GRAY_DARK, BLUE, RED, GREEN, BROWN, SILVER, ORANGE

Key mappings:
- "electric" / "Elektro" → fuel_type ELECTRIC, series i4/i5/i7/iX/iX1/iX2/iX3
- "hybrid" / "Plug-in" → look for names containing "e" suffix (e.g. xDrive25e, xDrive30e)
- "SUV" / "Geländewagen" → body_type SPORT_ACTIVITY_VEHICLE or SPORT_ACTIVITY_COUPE
- "Kombi" / "estate" / "wagon" → body_type TOURING
- "Allrad" / "AWD" → drive_type XDRIVE
- "sporty" / "M" → series M or M Sport variants
- "cheap" / "günstig" / "budget" → sort by price ascending

Generate 3 search queries that would find matching vehicles. Use English terms that match the inventory fields.

Return exactly 3 queries, one per line, no numbering or explanation."""

        try:
            response = self.client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=100,
                messages=[{"role": "user", "content": prompt}],
            )

            queries = [q.strip() for q in response.content[0].text.strip().split("\n") if q.strip()]
            return queries[:3] if queries else [message]

        except Exception as e:
            logger.error(f"Failed to expand search queries: {e}")
            return [message]

    def agent_chat(
        self,
        message: str,
        context: str,
        conversation_history: List[Dict[str, str]] = None,
    ) -> str:
        """Internal Salesteq Agent for dealer operations."""
        if not self.client:
            return "AI service unavailable."

        agent_prompt = """You are the Salesteq AI Agent — an internal assistant for BMW dealership staff.

You help dealers:
- Summarize lead activity and conversation trends
- Draft follow-up emails to prospects
- Identify hot leads and suggest next actions
- Analyze which vehicles generate the most interest
- Provide actionable insights from chat data

Keep responses concise, professional, and actionable. Use bullet points.
When drafting emails, be professional and reference specific vehicles the customer showed interest in."""

        messages = []
        if conversation_history:
            for msg in conversation_history[-10:]:
                messages.append({"role": msg["role"], "content": msg["content"]})

        user_message = f"""{context}

Dealer question: {message}"""

        messages.append({"role": "user", "content": user_message})

        try:
            response = self.client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=1024,
                system=agent_prompt,
                messages=messages,
            )
            return response.content[0].text
        except Exception as e:
            logger.error(f"Agent chat error: {e}")
            return "I encountered an error. Please try again."

    def is_available(self) -> bool:
        return self.client is not None
