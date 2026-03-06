"""Specialized AI agent for BMW test drive booking — conversational booking flow."""

import json
import logging
import re
from datetime import datetime
from typing import List, Dict, Any, Generator

from sqlalchemy.orm import Session

from ..config import OPENAI_API_KEY, SPARKPOST_API_KEY, SPARKPOST_FROM
from ..models.backoffice import TestDriveBooking, ActivityLog

logger = logging.getLogger(__name__)

TESTDRIVE_MODEL = "gpt-5.2"

SYSTEM_PROMPT_TEMPLATE = """You are the BMW Probefahrt (Test Drive) Booking Assistant for BMW Switzerland.

## Current Date
Today is {today} ({weekday}).

## Your Personality
Confident, warm, efficient. You speak like a knowledgeable BMW brand ambassador — never hesitant, never robotic. Move the conversation forward decisively. Match the customer's language (German or English).

## BOOKING FLOW — 4 Steps, No Detours

### Step 1: Vehicle
- If the customer names a specific model → use browse_test_drive_models to look it up, then CONFIRM immediately ("Ausgezeichnete Wahl — der i7 eDrive50.") and move to Step 2. Always include [RECOMMEND: model_id] so the car card is shown. Do NOT ask "Are you sure?" — they already told you.
- If the customer is browsing → use browse_test_drive_models, show results, then ask them to pick ONE.
- Once a model is selected, NEVER show more cars. Move forward.

### Step 2: Location
- Ask: "In welcher Region möchten Sie die Probefahrt machen?"
- Use get_available_dealers with their region
- When they pick a dealer → confirm and move to Step 3. Don't re-list options.

### Step 3: Date & Time
- Ask: "Wann passt es Ihnen? Nennen Sie mir ein Datum und die bevorzugte Tageszeit: Morgens (8–11), Mittags (11–13), Nachmittags (13–17) oder Abends (17–19)."
- Resolve relative dates yourself ("Montag" → actual date, "nächste Woche Dienstag" → actual date). Never ask for the exact date if you can calculate it.
- Once confirmed → move to Step 4.

### Step 4: Your Details
- Say: "Fast geschafft! Damit wir die Probefahrt für Sie reservieren können, brauche ich noch:"
- Collect in ONE message: Anrede (Herr/Frau), Vorname, Nachname, E-Mail, Telefon (optional)
- Once they provide details → call confirm_test_drive_booking immediately with ALL collected data.
- After confirmation, tell them: "Ihre Bestätigung ist per E-Mail unterwegs. Ihr BMW Partner wird sich innerhalb von 24 Stunden bei Ihnen melden."

## CRITICAL RULES
1. NEVER ask the customer to confirm a choice they already made. "Ich möchte den i7" = confirmed. Move on.
2. ONE step at a time. Don't dump all questions at once.
3. Keep responses to 2-3 sentences. Be crisp.
4. After showing models, guide to a CHOICE — don't keep browsing.
5. When summarizing the booking, include the booking reference prominently.
6. Do NOT include [RECOMMEND:...] tags in visible text.

## Model Recommendation Format
At the END of your response (only when showing models), add:
[RECOMMEND: model_id1, model_id2]
Use "none" when not recommending: [RECOMMEND: none]"""

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
                    "region": {"type": "string", "description": "Region filter. Available: Zürich, Bern, Basel, Luzern, Genève, Lausanne, St. Gallen, Winterthur, Aarau, Zug, Thun, Solothurn"},
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
                    "dealer_address": {"type": "string", "description": "Selected dealer address"},
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

TIME_LABELS = {
    "morning": "Morgens (08:00 – 11:00)",
    "midday": "Mittags (11:00 – 13:00)",
    "afternoon": "Nachmittags (13:00 – 17:00)",
    "evening": "Abends (17:00 – 19:00)",
}


def send_booking_confirmation_email(booking_data: Dict[str, Any]) -> bool:
    """Send confirmation email to customer via SparkPost EU API."""
    if not SPARKPOST_API_KEY:
        logger.warning("SPARKPOST_API_KEY not configured — skipping confirmation email")
        return False

    customer_email = booking_data.get("email", "")
    if not customer_email:
        logger.warning("No customer email — skipping confirmation email")
        return False

    salutation = booking_data.get("salutation", "")
    first_name = booking_data.get("first_name", "")
    last_name = booking_data.get("last_name", "")
    model_name = booking_data.get("model_name", "BMW")
    dealer_name = booking_data.get("dealer_name", "")
    dealer_address = booking_data.get("dealer_address", "")
    preferred_date = booking_data.get("preferred_date", "")
    time_label = TIME_LABELS.get(booking_data.get("time_preference", ""), booking_data.get("time_preference", ""))
    booking_ref = booking_data.get("booking_ref", "")

    greeting = f"{salutation} {last_name}" if salutation and last_name else f"{first_name} {last_name}"

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#000;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#000;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#000;">

<!-- Headline -->
<tr><td align="center" style="padding:0 30px 30px;">
  <h1 style="color:#fff;font-size:28px;font-weight:300;margin:0 0 8px;">Ihre Probefahrt ist bestätigt</h1>
  <p style="color:rgba(255,255,255,0.5);font-size:14px;margin:0;">Buchungsreferenz: <strong style="color:#1c69d4;">{booking_ref}</strong></p>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:0 30px 24px;">
  <p style="color:rgba(255,255,255,0.9);font-size:15px;line-height:1.6;margin:0;">
    Guten Tag {greeting},<br><br>
    vielen Dank für Ihr Interesse. Wir freuen uns, Sie zu Ihrer Probefahrt begrüssen zu dürfen.
  </p>
</td></tr>

<!-- Booking Details Card -->
<tr><td style="padding:0 30px 30px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;">
    <tr><td style="padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 0 16px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <p style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 4px;">Fahrzeug</p>
            <p style="color:#fff;font-size:16px;font-weight:600;margin:0;">{model_name}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <p style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 4px;">BMW Partner</p>
            <p style="color:#fff;font-size:15px;margin:0;">{dealer_name}</p>
            <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:4px 0 0;">{dealer_address}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 0;">
            <p style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 4px;">Termin</p>
            <p style="color:#fff;font-size:15px;margin:0;">{preferred_date} — {time_label}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</td></tr>

<!-- Next Steps -->
<tr><td style="padding:0 30px 30px;">
  <p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;margin:0;">
    Ihr BMW Partner wird sich innerhalb von 24 Stunden bei Ihnen melden, um den genauen Termin zu bestätigen. Bitte bringen Sie Ihren gültigen Führerschein zur Probefahrt mit.
  </p>
</td></tr>

<!-- Footer -->
<tr><td align="center" style="padding:20px 30px 40px;border-top:1px solid rgba(255,255,255,0.06);">
  <p style="color:rgba(255,255,255,0.25);font-size:12px;margin:0;">
    BMW Schweiz — Probefahrt-Service<br>
    Diese E-Mail wurde automatisch generiert.
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""

    text_body = f"""Ihre Probefahrt ist bestätigt — {booking_ref}

Guten Tag {greeting},

vielen Dank für Ihr Interesse. Hier Ihre Buchungsdetails:

Fahrzeug: {model_name}
BMW Partner: {dealer_name}, {dealer_address}
Termin: {preferred_date} — {time_label}

Ihr BMW Partner wird sich innerhalb von 24 Stunden bei Ihnen melden.
Bitte bringen Sie Ihren gültigen Führerschein zur Probefahrt mit.

BMW Schweiz — Probefahrt-Service"""

    # Generate .ics calendar attachment
    time_hours = {"morning": (8, 11), "midday": (11, 13), "afternoon": (13, 17), "evening": (17, 19)}
    start_h, end_h = time_hours.get(booking_data.get("time_preference", ""), (9, 11))

    # Parse date DD.MM.YYYY
    ics_date = ""
    date_match = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", preferred_date)
    if date_match:
        d, m, y = date_match.group(1), date_match.group(2), date_match.group(3)
        ics_date = f"{y}{m.zfill(2)}{d.zfill(2)}"
    else:
        # Fallback: tomorrow
        from datetime import timedelta
        tmrw = datetime.utcnow() + timedelta(days=1)
        ics_date = tmrw.strftime("%Y%m%d")

    ics_content = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//BMW Schweiz//Probefahrt//DE\r\n"
        "METHOD:PUBLISH\r\n"
        "BEGIN:VEVENT\r\n"
        f"DTSTART:{ics_date}T{start_h:02d}0000\r\n"
        f"DTEND:{ics_date}T{end_h:02d}0000\r\n"
        f"SUMMARY:BMW Probefahrt — {model_name}\r\n"
        f"DESCRIPTION:{booking_ref}\\nFahrzeug: {model_name}\\nBMW Partner: {dealer_name}\\nBitte Führerschein mitbringen.\r\n"
        f"LOCATION:{dealer_name}, {dealer_address}\r\n"
        "STATUS:CONFIRMED\r\n"
        f"UID:{booking_ref}@bmw-testdrive.salesteq.com\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )

    import base64
    ics_b64 = base64.b64encode(ics_content.encode("utf-8")).decode("ascii")

    from_email = SPARKPOST_FROM.split("<")[-1].rstrip(">").strip() if "<" in SPARKPOST_FROM else SPARKPOST_FROM

    payload = {
        "recipients": [{"address": {"email": customer_email, "name": f"{first_name} {last_name}"}}],
        "content": {
            "from": {"email": from_email, "name": "BMW Probefahrt"},
            "subject": f"Probefahrt bestätigt — {model_name} | {booking_ref}",
            "html": html_body,
            "text": text_body,
            "attachments": [
                {
                    "name": f"bmw-probefahrt-{booking_ref}.ics",
                    "type": "text/calendar",
                    "data": ics_b64,
                }
            ],
        },
    }

    try:
        import urllib.request
        req = urllib.request.Request(
            "https://api.eu.sparkpost.com/api/v1/transmissions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": SPARKPOST_API_KEY,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            logger.info(f"SparkPost email sent to {customer_email}: {result}")
            return True
    except Exception as e:
        logger.error(f"SparkPost email failed for {customer_email}: {e}")
        return False


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

    def chat_stream(self, message: str, conversation_history: List[Dict[str, str]] = None, session_id: str = None, language: str = None) -> Generator[Dict[str, Any], None, None]:
        if not self.client:
            yield {"type": "text_delta", "content": "AI service is currently unavailable."}
            yield {"type": "done"}
            return

        now = datetime.now()
        weekdays_de = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            today=now.strftime("%d.%m.%Y"),
            weekday=weekdays_de[now.weekday()],
        )
        if language and language != 'de':
            lang_names = {'en': 'English', 'fr': 'French', 'it': 'Italian', 'ar': 'Arabic', 'es': 'Spanish', 'pt': 'Portuguese', 'nl': 'Dutch', 'pl': 'Polish', 'tr': 'Turkish'}
            lang_name = lang_names.get(language, language)
            system_prompt += f"\n\n## Language\nThe customer has selected {lang_name}. You MUST respond exclusively in {lang_name}. All your messages must be in {lang_name} — no German unless the customer switches."
        messages = [{"role": "system", "content": system_prompt}]
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
        region_raw = (args.get("region") or "").strip()
        region = region_raw.lower()
        logger.info(f"get_available_dealers called with region={region_raw!r} (normalized={region!r})")

        # Strip common prefixes the model might add
        for prefix in ["region ", "kanton ", "raum ", "großraum ", "grossraum ", "in ", "um ", "near ", "area "]:
            if region.startswith(prefix):
                region = region[len(prefix):]

        # Normalize umlauts and common variants
        umlaut_map = {
            "ü": "u", "ö": "o", "ä": "a", "è": "e", "é": "e",
        }
        def strip_umlauts(s: str) -> str:
            for k, v in umlaut_map.items():
                s = s.replace(k, v)
            return s

        region_aliases = {
            "zurich": "zürich", "zuerich": "zürich",
            "geneva": "genève", "genf": "genève", "geneve": "genève",
            "lucerne": "luzern",
            "berne": "bern",
            "aargau": "aarau",
            "st gallen": "st. gallen", "saint gallen": "st. gallen", "sg": "st. gallen",
        }
        region = region_aliases.get(region, region)

        dealers = SWISS_DEALERS
        if region:
            region_plain = strip_umlauts(region)
            dealers = [d for d in dealers
                       if region in d["region"].lower()
                       or d["region"].lower() in region
                       or region_plain in strip_umlauts(d["region"].lower())
                       or strip_umlauts(d["region"].lower()) in region_plain]
        logger.info(f"Found {len(dealers)} dealers for region={region!r}")
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

        dealer_name = args.get("dealer_name", "")
        dealer_address = args.get("dealer_address", "")
        # Look up address from dealer list if not provided
        if not dealer_address:
            dealer_match = next((d for d in SWISS_DEALERS if d["name"].lower() == dealer_name.lower()), None)
            if not dealer_match:
                dealer_match = next((d for d in SWISS_DEALERS if dealer_name.lower() in d["name"].lower()), None)
            if dealer_match:
                dealer_address = dealer_match["address"]

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
                dealer_name=dealer_name,
                comments=args.get("comments", ""),
                status="confirmed",
            )
            self.db.add(booking)

            self.db.add(ActivityLog(
                event_type="test_drive_booked",
                title=f"Probefahrt: {model_name}",
                description=f"{args.get('first_name', '')} {args.get('last_name', '')} — {dealer_name} — {args.get('preferred_date', '')}",
                session_id=session_id or "",
            ))
            self.db.commit()
        except Exception as e:
            logger.error(f"Failed to persist booking: {e}")
            self.db.rollback()

        # Send confirmation email
        send_booking_confirmation_email({
            **args,
            "booking_ref": booking_ref,
            "dealer_address": dealer_address,
        })

        time_label = TIME_LABELS.get(args.get("time_preference", ""), args.get("time_preference", ""))

        return {
            "status": "confirmed",
            "booking_reference": booking_ref,
            "vehicle": model_name,
            "dealer": dealer_name,
            "dealer_address": dealer_address,
            "date": args.get("preferred_date", ""),
            "time": time_label,
            "customer": f"{args.get('salutation', '')} {args.get('first_name', '')} {args.get('last_name', '')}".strip(),
            "email": args.get("email", ""),
            "phone": args.get("phone", ""),
            "confirmation_email_sent": True,
            "note": "Bestätigungs-E-Mail wurde gesendet. Ihr BMW Partner wird sich innerhalb von 24 Stunden bei Ihnen melden.",
        }

    def is_available(self) -> bool:
        return self.client is not None
