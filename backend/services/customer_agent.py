"""Tool-use agent for customer-facing BMW sales chat — OpenAI version."""

import base64
import json
import logging
import re
from datetime import datetime, timedelta
from typing import List, Dict, Any, Generator

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..config import OPENAI_API_KEY, SPARKPOST_API_KEY, SPARKPOST_FROM
from ..models.vehicle import Vehicle
from ..models.backoffice import Appointment, ActivityLog

logger = logging.getLogger(__name__)

CUSTOMER_MODEL = "gpt-5.2"

SYSTEM_PROMPT = """You are Max, a BMW Sales & Service Advisor for the Swiss market.

## Language & Tone
- ALWAYS reply in the customer's language. German → German. English → English. Never switch.
- Match the customer's register. Casual question → casual answer. Formal → formal.
- Sound like a real person, not a brochure. No marketing speak, no filler.

## Response Format — THE #1 RULE

YOUR REPLY = **Answer + One Forward Move**. That's it. Nothing else.

The customer sees VEHICLE CARDS with images, names, prices, and specs below your text.
Your text adds context the cards can't — it NEVER duplicates them.

HARD LIMITS:
- **2 sentences max.** One to answer, one to move forward.
- **Under 25 words total.** Shorter wins. Always.
- ZERO vehicle names, prices, or specs in your text — cards handle that.
- ZERO bullet points or lists.
- ZERO filler ("Certainly!", "Great choice!", "I'd be happy to help!")

Examples:
- GOOD: "Drei Elektro-SUV im Bestand. Eher sportlich oder komfortabel?" (10 words)
- GOOD: "Here are a few under 60k. Cash or leasing?" (9 words)
- BAD: "Certainly! We have an excellent selection of Sport Activity Vehicles. Let me show you some options that might interest you. Here are three great choices:" (26 words, filler, lists)

When you have nothing meaningful to add beyond the cards, just ask the forward question:
- "Welcher spricht Sie an?" / "Eher Benzin oder Elektro?" / "Want to book a test drive?"

## Tools — MANDATORY
You MUST call a tool before answering any vehicle-related question. NEVER answer from memory.
- search_inventory: Call this EVERY TIME vehicles are discussed — searches, recommendations, "what do you have", budget questions, comparisons. NO EXCEPTIONS. If the customer asks about cars, you search first.
- get_vehicle_details: For specific vehicle deep-dives.
- compare_vehicles: When customer asks to compare or asks WHY prices differ. ALWAYS call this — don't compare from memory.
- get_inventory_overview: For general "what do you have?" questions.
- book_appointment: For test drives, service, and trade-in. Details below.

CRITICAL: If your response mentions vehicle counts, availability, prices, or specific models, you MUST have called search_inventory or get_inventory_overview first. A response like "We have many SUVs" without a tool call is FORBIDDEN.

## Appointment Booking

Use book_appointment for test drives, service appointments, and trade-in valuations.

### CRITICAL: Don't book prematurely
- The confirmation email is sent IMMEDIATELY when you call book_appointment — you CANNOT add info after.
- Collect ALL info FIRST, then call book_appointment ONCE. Never call it and then ask follow-up questions.
- NEVER invent or assume a date/time. If the customer hasn't mentioned one, ASK first.

### What you need BEFORE calling book_appointment (ALL types)
- first_name, last_name, email (REQUIRED)
- preferred_date AND time_preference (REQUIRED — collect before booking. The email includes the date/time.)

### Collecting info — batch it
DON'T ask one field per turn. Ask for everything you still need in ONE message:
- "Gerne! Name, E-Mail und Wunschtermin — dann bestätige ich sofort."
- "Sure! Need your name, email, and preferred date to confirm."

If they give partial info, ask for the rest in ONE follow-up. Max 2 turns to collect.

### Type-specific extras
- **test_drive**: vin (look up from inventory).
- **service**: service_type, vehicle_description, description.
- **trade_in**: vehicle_description (their car), trade_in_mileage, vin (target vehicle if applicable).

NEVER call book_appointment without email. Ask once if missing.

After booking: "Erledigt — Bestätigung per E-Mail!" / "Done — confirmation on its way." One sentence.

## Smart Behavior

### Budget mismatch
Nothing in budget for their series? Say so in one sentence, then auto-search cheapest across ALL series. Always show alternatives.

### Don't repeat yourself
- Never re-ask something the customer already answered.
- Never re-recommend a VIN already shown. Say "the X3 we looked at" instead.
- If you asked "Benzin oder Elektro?" and they answered — remember it forever.

### Disambiguation
Ambiguous request? Offer a choice, don't guess wrong:
- "Meinten Sie die 3er Limousine oder den 3er Touring?" / "The sedan or the touring?"
Never dump 8 vehicles when 2 targeted ones would be better.

### Lead capture
After buying intent (financing, test drive, discount questions), ask for name + email ONCE. Naturally. "Soll ich die Details an Ihre E-Mail schicken?"

### Limits — be honest, be brief
- Can't negotiate prices → "Das kann der Händler direkt — soll ich den Kontakt herstellen?"
- Can't calculate financing → show the monthly rate from data, offer dealer quote.
- Missing data → say so in 5 words, move on.

## Vehicle Selection (hidden from customer)

End every response with:
[RECOMMEND: vin1, vin2, vin3]

Rules:
- Max 3 VINs per turn. Less is more — 1-2 targeted beats 5 generic.
- Never re-recommend previously shown VINs.
- No new vehicles to show → [RECOMMEND: none]"""

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
            "name": "book_appointment",
            "description": "Book an appointment or register a request — test drive, service, or trade-in valuation. Sends a confirmation email. Collect first_name, last_name, email BEFORE calling. preferred_date is optional — only include if the customer specified one.",
            "parameters": {
                "type": "object",
                "properties": {
                    "appointment_type": {
                        "type": "string",
                        "enum": ["test_drive", "service", "trade_in"],
                        "description": "Type of appointment",
                    },
                    "first_name": {"type": "string", "description": "Customer's first name"},
                    "last_name": {"type": "string", "description": "Customer's last name"},
                    "email": {"type": "string", "description": "Customer's email — REQUIRED for confirmation"},
                    "phone": {"type": "string", "description": "Customer's phone number (optional)"},
                    "preferred_date": {"type": "string", "description": "Preferred date, e.g. '15.03.2026' or 'next Monday'"},
                    "time_preference": {
                        "type": "string",
                        "enum": ["morning", "midday", "afternoon", "evening"],
                        "description": "Preferred time of day",
                    },
                    "vin": {"type": "string", "description": "VIN of vehicle for test drive or trade-in target"},
                    "service_type": {
                        "type": "string",
                        "enum": ["maintenance", "repair", "tire_change", "oil_change", "inspection", "recall", "other"],
                        "description": "Service type (only for service appointments)",
                    },
                    "vehicle_description": {"type": "string", "description": "Customer's own vehicle (for service/trade-in)"},
                    "trade_in_mileage": {"type": "string", "description": "Mileage of trade-in vehicle"},
                    "description": {"type": "string", "description": "Additional notes or issue description"},
                },
                "required": ["appointment_type", "first_name", "last_name", "email"],
            },
        },
    },
]


# ── Localized email content ─────────────────────────────────────────────

EMAIL_STRINGS: Dict[str, Dict[str, str]] = {
    # ── Test Drive ──
    "td_subject":     {"de": "Probefahrt bestätigt — {vehicle} | {ref}", "fr": "Essai routier confirmé — {vehicle} | {ref}", "it": "Test drive confermato — {vehicle} | {ref}", "en": "Test Drive Confirmed — {vehicle} | {ref}"},
    "td_headline":    {"de": "Ihre Probefahrt ist bestätigt", "fr": "Votre essai routier est confirmé", "it": "Il vostro test drive è confermato", "en": "Your Test Drive is Confirmed"},
    "td_greeting":    {"de": "Guten Tag {name},\n\nvielen Dank für Ihr Interesse. Wir freuen uns, Sie zu Ihrer Probefahrt begrüssen zu dürfen.", "fr": "Bonjour {name},\n\nMerci pour votre intérêt. Nous nous réjouissons de vous accueillir pour votre essai routier.", "it": "Buongiorno {name},\n\nGrazie per il vostro interesse. Siamo lieti di accogliervi per il vostro test drive.", "en": "Hello {name},\n\nThank you for your interest. We look forward to welcoming you for your test drive."},
    "td_next":        {"de": "Ihr BMW Partner wird sich innerhalb von 24 Stunden bei Ihnen melden, um den genauen Termin zu bestätigen. Bitte bringen Sie Ihren gültigen Führerschein zur Probefahrt mit.", "fr": "Votre partenaire BMW vous contactera dans les 24 heures pour confirmer l'horaire exact. Veuillez apporter votre permis de conduire valide.", "it": "Il vostro partner BMW vi contatterà entro 24 ore per confermare l'orario esatto. Portate la vostra patente di guida valida.", "en": "Your BMW partner will contact you within 24 hours to confirm the exact time. Please bring your valid driver's license."},
    "td_cal_summary": {"de": "BMW Probefahrt — {vehicle}", "fr": "Essai routier BMW — {vehicle}", "it": "Test drive BMW — {vehicle}", "en": "BMW Test Drive — {vehicle}"},
    "td_from_name":   {"de": "BMW Probefahrt", "fr": "BMW Essai Routier", "it": "BMW Test Drive", "en": "BMW Test Drive"},

    # ── Service ──
    "sv_subject":     {"de": "Service-Termin bestätigt — {service} | {ref}", "fr": "Rendez-vous service confirmé — {service} | {ref}", "it": "Appuntamento assistenza confermato — {service} | {ref}", "en": "Service Appointment Confirmed — {service} | {ref}"},
    "sv_headline":    {"de": "Ihr Service-Termin ist bestätigt", "fr": "Votre rendez-vous service est confirmé", "it": "Il vostro appuntamento assistenza è confermato", "en": "Your Service Appointment is Confirmed"},
    "sv_greeting":    {"de": "Guten Tag {name},\n\nvielen Dank für Ihre Buchung. Wir kümmern uns gerne um Ihr Fahrzeug.", "fr": "Bonjour {name},\n\nMerci pour votre réservation. Nous prendrons soin de votre véhicule.", "it": "Buongiorno {name},\n\nGrazie per la vostra prenotazione. Ci prenderemo cura del vostro veicolo.", "en": "Hello {name},\n\nThank you for your booking. We'll take great care of your vehicle."},
    "sv_next":        {"de": "Ihr BMW Service-Berater wird sich bei Ihnen melden, um den Termin zu bestätigen und weitere Details zu besprechen.", "fr": "Votre conseiller service BMW vous contactera pour confirmer le rendez-vous et discuter des détails.", "it": "Il vostro consulente assistenza BMW vi contatterà per confermare l'appuntamento e discutere i dettagli.", "en": "Your BMW Service Advisor will contact you to confirm the appointment and discuss details."},
    "sv_cal_summary": {"de": "BMW Service — {service}", "fr": "Service BMW — {service}", "it": "Assistenza BMW — {service}", "en": "BMW Service — {service}"},
    "sv_from_name":   {"de": "BMW Service", "fr": "BMW Service", "it": "BMW Assistenza", "en": "BMW Service"},

    # ── Trade-In ──
    "ti_subject":     {"de": "Eintausch-Bewertung bestätigt — {vehicle} | {ref}", "fr": "Évaluation reprise confirmée — {vehicle} | {ref}", "it": "Valutazione permuta confermata — {vehicle} | {ref}", "en": "Trade-In Evaluation Confirmed — {vehicle} | {ref}"},
    "ti_headline":    {"de": "Ihr Eintausch-Termin ist bestätigt", "fr": "Votre rendez-vous de reprise est confirmé", "it": "Il vostro appuntamento permuta è confermato", "en": "Your Trade-In Appointment is Confirmed"},
    "ti_greeting":    {"de": "Guten Tag {name},\n\nvielen Dank für Ihre Anfrage. Wir freuen uns, Ihr Fahrzeug zu bewerten und Ihnen ein Angebot zu unterbreiten.", "fr": "Bonjour {name},\n\nMerci pour votre demande. Nous nous réjouissons d'évaluer votre véhicule et de vous faire une offre.", "it": "Buongiorno {name},\n\nGrazie per la vostra richiesta. Siamo lieti di valutare il vostro veicolo e farvi un'offerta.", "en": "Hello {name},\n\nThank you for your inquiry. We look forward to evaluating your vehicle and providing you with an offer."},
    "ti_next":        {"de": "Bitte bringen Sie Ihren Fahrzeugausweis und alle Serviceunterlagen zum Termin mit. Unser Experte wird eine umfassende Bewertung durchführen.", "fr": "Veuillez apporter votre carte grise et tous les documents d'entretien au rendez-vous. Notre expert effectuera une évaluation complète.", "it": "Portate la carta di circolazione e tutta la documentazione di manutenzione all'appuntamento. Il nostro esperto effettuerà una valutazione completa.", "en": "Please bring your vehicle registration and all service records to the appointment. Our expert will conduct a comprehensive evaluation."},
    "ti_cal_summary": {"de": "BMW Eintausch-Bewertung", "fr": "Évaluation reprise BMW", "it": "Valutazione permuta BMW", "en": "BMW Trade-In Evaluation"},
    "ti_from_name":   {"de": "BMW Eintausch", "fr": "BMW Reprise", "it": "BMW Permuta", "en": "BMW Trade-In"},

    # ── Common labels ──
    "lbl_vehicle":       {"de": "Fahrzeug", "fr": "Véhicule", "it": "Veicolo", "en": "Vehicle"},
    "lbl_dealer":        {"de": "BMW Partner", "fr": "Partenaire BMW", "it": "Partner BMW", "en": "BMW Partner"},
    "lbl_date":          {"de": "Termin", "fr": "Rendez-vous", "it": "Appuntamento", "en": "Appointment"},
    "lbl_service_type":  {"de": "Service-Art", "fr": "Type de service", "it": "Tipo di servizio", "en": "Service Type"},
    "lbl_your_vehicle":  {"de": "Ihr Fahrzeug", "fr": "Votre véhicule", "it": "Il vostro veicolo", "en": "Your Vehicle"},
    "lbl_trade_target":  {"de": "Gewünschtes Fahrzeug", "fr": "Véhicule souhaité", "it": "Veicolo desiderato", "en": "Desired Vehicle"},
    "lbl_mileage":       {"de": "Kilometerstand", "fr": "Kilométrage", "it": "Chilometraggio", "en": "Mileage"},
    "lbl_notes":         {"de": "Anmerkungen", "fr": "Remarques", "it": "Note", "en": "Notes"},
    "lbl_ref":           {"de": "Buchungsreferenz", "fr": "Référence de réservation", "it": "Riferimento prenotazione", "en": "Booking Reference"},
    "footer":            {"de": "BMW Schweiz — Diese E-Mail wurde automatisch generiert.", "fr": "BMW Suisse — Cet e-mail a été généré automatiquement.", "it": "BMW Svizzera — Questa e-mail è stata generata automaticamente.", "en": "BMW Switzerland — This email was generated automatically."},

    # ── Time labels ──
    "time_morning":   {"de": "Morgens (08:00–11:00)", "fr": "Matin (08h00–11h00)", "it": "Mattina (08:00–11:00)", "en": "Morning (08:00–11:00)"},
    "time_midday":    {"de": "Mittags (11:00–13:00)", "fr": "Midi (11h00–13h00)", "it": "Mezzogiorno (11:00–13:00)", "en": "Midday (11:00–13:00)"},
    "time_afternoon": {"de": "Nachmittags (13:00–17:00)", "fr": "Après-midi (13h00–17h00)", "it": "Pomeriggio (13:00–17:00)", "en": "Afternoon (13:00–17:00)"},
    "time_evening":   {"de": "Abends (17:00–19:00)", "fr": "Soir (17h00–19h00)", "it": "Sera (17:00–19:00)", "en": "Evening (17:00–19:00)"},

    # ── Service type labels ──
    "svc_maintenance": {"de": "Planmässiger Service", "fr": "Entretien planifié", "it": "Manutenzione programmata", "en": "Scheduled Maintenance"},
    "svc_repair":      {"de": "Reparatur", "fr": "Réparation", "it": "Riparazione", "en": "Repair"},
    "svc_tire_change": {"de": "Reifenwechsel", "fr": "Changement de pneus", "it": "Cambio pneumatici", "en": "Tire Change"},
    "svc_oil_change":  {"de": "Ölwechsel", "fr": "Vidange d'huile", "it": "Cambio olio", "en": "Oil Change"},
    "svc_inspection":  {"de": "Fahrzeugprüfung (MFK)", "fr": "Contrôle technique", "it": "Revisione veicolo", "en": "Vehicle Inspection"},
    "svc_recall":      {"de": "Rückruf-Service", "fr": "Service de rappel", "it": "Servizio richiamo", "en": "Recall Service"},
    "svc_other":       {"de": "Allgemeiner Service", "fr": "Service général", "it": "Servizio generale", "en": "General Service"},
}


def _e(key: str, lang: str) -> str:
    """Get localized email string."""
    entry = EMAIL_STRINGS.get(key, {})
    return entry.get(lang, entry.get("en", key))


def _service_label(service_type: str, lang: str) -> str:
    return _e(f"svc_{service_type}", lang)


def _time_label(time_pref: str, lang: str) -> str:
    return _e(f"time_{time_pref}", lang) if time_pref else ""


REF_PREFIXES = {"test_drive": "TD", "service": "SV", "trade_in": "TI"}


def send_appointment_email(appt: Dict[str, Any], lang: str = "de") -> bool:
    """Send localized confirmation email with ICS attachment via SparkPost."""
    if not SPARKPOST_API_KEY:
        logger.warning("SPARKPOST_API_KEY not configured — skipping email")
        return False

    email = appt.get("email", "")
    if not email:
        logger.warning("No email — skipping confirmation")
        return False

    atype = appt.get("appointment_type", "test_drive")
    prefix = {"test_drive": "td", "service": "sv", "trade_in": "ti"}.get(atype, "td")
    first = appt.get("first_name", "")
    last = appt.get("last_name", "")
    name = f"{first} {last}".strip()
    ref = appt.get("booking_ref", "")
    vehicle = appt.get("vehicle_name", "")
    dealer = appt.get("dealer_name", "")
    date = appt.get("preferred_date", "")
    time_pref = appt.get("time_preference", "")
    time_label = _time_label(time_pref, lang)
    service_type = appt.get("service_type", "")
    service_label = _service_label(service_type, lang) if service_type else ""
    trade_in_vehicle = appt.get("trade_in_vehicle", "")
    trade_in_mileage = appt.get("trade_in_mileage", "")
    description = appt.get("description", "")

    # Subject
    if atype == "test_drive":
        subject = _e(f"{prefix}_subject", lang).format(vehicle=vehicle or "BMW", ref=ref)
    elif atype == "service":
        subject = _e(f"{prefix}_subject", lang).format(service=service_label, ref=ref)
    else:
        subject = _e(f"{prefix}_subject", lang).format(vehicle=trade_in_vehicle or vehicle or "BMW", ref=ref)

    headline = _e(f"{prefix}_headline", lang)
    greeting = _e(f"{prefix}_greeting", lang).format(name=name)
    next_steps = _e(f"{prefix}_next", lang)
    from_name = _e(f"{prefix}_from_name", lang)

    # Build detail rows
    detail_rows = ""
    if atype == "test_drive":
        detail_rows += _detail_row(_e("lbl_vehicle", lang), vehicle)
        detail_rows += _detail_row(_e("lbl_dealer", lang), dealer)
        detail_rows += _detail_row(_e("lbl_date", lang), f"{date} — {time_label}" if time_label else date)
    elif atype == "service":
        detail_rows += _detail_row(_e("lbl_service_type", lang), service_label)
        if vehicle:
            detail_rows += _detail_row(_e("lbl_your_vehicle", lang), vehicle)
        detail_rows += _detail_row(_e("lbl_dealer", lang), dealer)
        detail_rows += _detail_row(_e("lbl_date", lang), f"{date} — {time_label}" if time_label else date)
        if description:
            detail_rows += _detail_row(_e("lbl_notes", lang), description)
    else:  # trade_in
        if vehicle:
            detail_rows += _detail_row(_e("lbl_trade_target", lang), vehicle)
        detail_rows += _detail_row(_e("lbl_your_vehicle", lang), trade_in_vehicle)
        if trade_in_mileage:
            detail_rows += _detail_row(_e("lbl_mileage", lang), trade_in_mileage)
        detail_rows += _detail_row(_e("lbl_dealer", lang), dealer)
        detail_rows += _detail_row(_e("lbl_date", lang), f"{date} — {time_label}" if time_label else date)

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#000;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#000;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#000;">

<!-- BMW Logo -->
<tr><td align="center" style="padding:30px 30px 20px;">
  <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/BMW.svg/120px-BMW.svg.png" alt="BMW" width="48" height="48" style="display:block;" />
</td></tr>

<!-- Headline -->
<tr><td align="center" style="padding:0 30px 30px;">
  <h1 style="color:#fff;font-size:26px;font-weight:300;margin:0 0 8px;">{headline}</h1>
  <p style="color:rgba(255,255,255,0.5);font-size:14px;margin:0;">{_e("lbl_ref", lang)}: <strong style="color:#1c69d4;">{ref}</strong></p>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:0 30px 24px;">
  <p style="color:rgba(255,255,255,0.9);font-size:15px;line-height:1.6;margin:0;">
    {greeting.replace(chr(10), '<br>')}
  </p>
</td></tr>

<!-- Details Card -->
<tr><td style="padding:0 30px 30px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;">
    <tr><td style="padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        {detail_rows}
      </table>
    </td></tr>
  </table>
</td></tr>

<!-- Next Steps -->
<tr><td style="padding:0 30px 30px;">
  <p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;margin:0;">{next_steps}</p>
</td></tr>

<!-- Footer -->
<tr><td align="center" style="padding:20px 30px 40px;border-top:1px solid rgba(255,255,255,0.06);">
  <p style="color:rgba(255,255,255,0.25);font-size:12px;margin:0;">{_e("footer", lang)}</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""

    # Plain text fallback
    text_lines = [f"{headline} — {ref}", "", greeting, ""]
    if vehicle:
        text_lines.append(f"{_e('lbl_vehicle', lang)}: {vehicle}")
    if service_label:
        text_lines.append(f"{_e('lbl_service_type', lang)}: {service_label}")
    if trade_in_vehicle:
        text_lines.append(f"{_e('lbl_your_vehicle', lang)}: {trade_in_vehicle}")
    if dealer:
        text_lines.append(f"{_e('lbl_dealer', lang)}: {dealer}")
    text_lines.append(f"{_e('lbl_date', lang)}: {date} — {time_label}" if time_label else f"{_e('lbl_date', lang)}: {date}")
    if description:
        text_lines.append(f"{_e('lbl_notes', lang)}: {description}")
    text_lines += ["", next_steps, "", _e("footer", lang)]
    text_body = "\n".join(text_lines)

    # ICS calendar attachment
    time_hours = {"morning": (8, 11), "midday": (11, 13), "afternoon": (13, 17), "evening": (17, 19)}
    start_h, end_h = time_hours.get(time_pref, (9, 11))

    ics_date = ""
    date_match = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", date)
    if date_match:
        d, m, y = date_match.group(1), date_match.group(2), date_match.group(3)
        ics_date = f"{y}{m.zfill(2)}{d.zfill(2)}"
    else:
        tmrw = datetime.utcnow() + timedelta(days=1)
        ics_date = tmrw.strftime("%Y%m%d")

    cal_summary = _e(f"{prefix}_cal_summary", lang)
    if atype == "test_drive":
        cal_summary = cal_summary.format(vehicle=vehicle or "BMW")
    elif atype == "service":
        cal_summary = cal_summary.format(service=service_label)

    ics_content = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//BMW Schweiz//Appointment//DE\r\n"
        "METHOD:PUBLISH\r\n"
        "BEGIN:VEVENT\r\n"
        f"DTSTART:{ics_date}T{start_h:02d}0000\r\n"
        f"DTEND:{ics_date}T{end_h:02d}0000\r\n"
        f"SUMMARY:{cal_summary}\r\n"
        f"DESCRIPTION:{ref}\\n{_e('lbl_dealer', lang)}: {dealer}\r\n"
        f"LOCATION:{dealer}\r\n"
        "STATUS:CONFIRMED\r\n"
        f"UID:{ref}@bmw-appointments.salesteq.com\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )
    ics_b64 = base64.b64encode(ics_content.encode("utf-8")).decode("ascii")

    ics_filename = {
        "test_drive": f"bmw-probefahrt-{ref}.ics",
        "service": f"bmw-service-{ref}.ics",
        "trade_in": f"bmw-eintausch-{ref}.ics",
    }.get(atype, f"bmw-termin-{ref}.ics")

    from_email = SPARKPOST_FROM.split("<")[-1].rstrip(">").strip() if "<" in SPARKPOST_FROM else SPARKPOST_FROM

    payload = {
        "recipients": [{"address": {"email": email, "name": name}}],
        "content": {
            "from": {"email": from_email, "name": from_name},
            "subject": subject,
            "html": html_body,
            "text": text_body,
            "attachments": [{"name": ics_filename, "type": "text/calendar", "data": ics_b64}],
        },
    }

    try:
        import urllib.request
        req = urllib.request.Request(
            "https://api.eu.sparkpost.com/api/v1/transmissions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": SPARKPOST_API_KEY, "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            logger.info(f"Appointment email sent to {email}: {result}")
            return True
    except Exception as e:
        logger.error(f"Appointment email failed for {email}: {e}")
        return False


def _detail_row(label: str, value: str) -> str:
    """Generate one HTML detail row for the email template."""
    if not value:
        return ""
    return f"""<tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <p style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 4px;">{label}</p>
            <p style="color:#fff;font-size:15px;margin:0;">{value}</p>
          </td>
        </tr>"""


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

    def _build_system_prompt(self, language: str = None, dealer_name: str = None) -> str:
        """Build system prompt with optional language and dealer context."""
        prompt = SYSTEM_PROMPT
        if language:
            lang_names = {"de": "German", "fr": "French", "it": "Italian", "en": "English"}
            lang_name = lang_names.get(language, "English")
            prompt += f"\n\n## Language Override\nThe customer has selected {lang_name}. You MUST respond exclusively in {lang_name}. All text, greetings, follow-up questions must be in {lang_name}."
        if dealer_name:
            prompt += f"\n\n## Dealer Context\nYou are the AI Sales Assistant for {dealer_name}. Personalize your greeting and responses to reflect this dealership. When greeting the customer, welcome them to {dealer_name}."
        return prompt

    def chat(self, message: str, conversation_history: List[Dict[str, str]] = None, language: str = None, dealer_name: str = None) -> Dict[str, Any]:
        if not self.client:
            return {"message": "AI service is currently unavailable.", "recommended_vins": [], "all_vehicle_vins": [], "tool_calls": []}

        messages = [{"role": "system", "content": self._build_system_prompt(language, dealer_name)}]
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
                    result = self._execute_tool(tc.function.name, args, language=language, dealer_name=dealer_name)
                    self._collect_vins(result, all_vehicle_vins)
                    result_str = json.dumps(result, default=str)
                    if len(result_str) > 8000:
                        result_str = result_str[:8000] + "... (truncated)"
                    tool_calls_log.append({"name": tc.function.name, "input": args})
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result_str})
            else:
                text = choice.message.content or ""
                recommend_match = re.search(r"\[RECOMMEND:\s*([^\]]*)\]", text)
                recommended_vins = []
                if recommend_match:
                    raw = recommend_match.group(1).strip()
                    if raw.lower() != "none":
                        recommended_vins = [v.strip() for v in raw.split(",") if v.strip()]
                clean_text = re.sub(r"\s*\[RECOMMEND:[^\]]*\]\s*", "", text).strip()
                return {"message": clean_text, "recommended_vins": recommended_vins, "all_vehicle_vins": list(dict.fromkeys(all_vehicle_vins)), "tool_calls": tool_calls_log}

        return {"message": "Could you rephrase your question?", "recommended_vins": [], "all_vehicle_vins": list(dict.fromkeys(all_vehicle_vins)), "tool_calls": tool_calls_log}

    def chat_stream(self, message: str, conversation_history: List[Dict[str, str]] = None, language: str = None, dealer_name: str = None) -> Generator[Dict[str, Any], None, None]:
        if not self.client:
            yield {"type": "text_delta", "content": "AI service is currently unavailable."}
            yield {"type": "done", "recommended_vins": [], "all_vins": []}
            return

        messages = [{"role": "system", "content": self._build_system_prompt(language, dealer_name)}]
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
                    result = self._execute_tool(tc.function.name, args, language=language, dealer_name=dealer_name)
                    self._collect_vins(result, all_vehicle_vins)
                    result_str = json.dumps(result, default=str)
                    if len(result_str) > 8000:
                        result_str = result_str[:8000] + "... (truncated)"
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result_str})
            else:
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

    def _execute_tool(self, name: str, input: Dict[str, Any], language: str = None, dealer_name: str = None) -> Any:
        try:
            if name == "search_inventory":
                return self._search_inventory(input)
            elif name == "get_vehicle_details":
                return self._get_vehicle_details(input)
            elif name == "compare_vehicles":
                return self._compare_vehicles(input)
            elif name == "get_inventory_overview":
                return self._get_inventory_overview()
            elif name == "book_appointment":
                return self._book_appointment(input, language=language, dealer_name=dealer_name)
            # Legacy tool names — redirect
            elif name == "schedule_test_drive":
                input["appointment_type"] = "test_drive"
                return self._book_appointment(input, language=language, dealer_name=dealer_name)
            elif name == "book_service_appointment":
                input["appointment_type"] = "service"
                return self._book_appointment(input, language=language, dealer_name=dealer_name)
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

    def _book_appointment(self, input: Dict, language: str = None, dealer_name: str = None) -> Dict:
        """Book a test drive, service appointment, or trade-in evaluation. Persists to DB + sends email."""
        atype = input.get("appointment_type", "test_drive")
        first_name = input.get("first_name", input.get("customer_name", ""))
        last_name = input.get("last_name", "")
        email = input.get("email", input.get("contact", ""))
        phone = input.get("phone", "")
        preferred_date = input.get("preferred_date", "")
        time_preference = input.get("time_preference", "morning")
        vin = input.get("vin", "")
        description = input.get("description", "")
        service_type = input.get("service_type", "")
        vehicle_description = input.get("vehicle_description", "")
        trade_in_mileage = input.get("trade_in_mileage", "")

        # Resolve vehicle name from VIN
        vehicle_name = ""
        resolved_dealer = dealer_name or ""
        if vin:
            v = self.db.query(Vehicle).filter(Vehicle.vin == vin).first()
            if v:
                vehicle_name = v.name
                if not resolved_dealer:
                    resolved_dealer = v.dealer_name or ""

        # For service/trade-in, use vehicle_description if no VIN
        if not vehicle_name and vehicle_description:
            vehicle_name = vehicle_description

        # Generate booking reference
        prefix = REF_PREFIXES.get(atype, "AP")
        year = datetime.utcnow().year
        count = self.db.query(Appointment).filter(Appointment.appointment_type == atype).count() + 1
        booking_ref = f"{prefix}-{year}-{count:04d}"

        lang = language or "de"

        # Persist
        try:
            appt = Appointment(
                appointment_type=atype,
                booking_ref=booking_ref,
                vin=vin,
                vehicle_name=vehicle_name,
                first_name=first_name,
                last_name=last_name,
                email=email,
                phone=phone,
                preferred_date=preferred_date,
                time_preference=time_preference,
                dealer_name=resolved_dealer,
                service_type=service_type,
                description=description,
                trade_in_vehicle=vehicle_description if atype == "trade_in" else "",
                trade_in_mileage=trade_in_mileage,
                language=lang,
                status="pending",
            )
            self.db.add(appt)

            # Activity log
            type_labels = {"test_drive": "Test Drive", "service": "Service", "trade_in": "Trade-In"}
            self.db.add(ActivityLog(
                event_type=f"{atype}_booked",
                title=f"{type_labels.get(atype, atype)}: {first_name} {last_name}",
                description=f"{vehicle_name or vehicle_description or service_type} — {resolved_dealer}",
                metadata_json=json.dumps({"booking_ref": booking_ref, "email": email, "type": atype}),
            ))
            self.db.commit()
        except Exception as e:
            logger.error(f"Failed to persist appointment: {e}")

        # Send confirmation email
        email_data = {
            "appointment_type": atype,
            "booking_ref": booking_ref,
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "phone": phone,
            "vehicle_name": vehicle_name,
            "dealer_name": resolved_dealer,
            "preferred_date": preferred_date,
            "time_preference": time_preference,
            "service_type": service_type,
            "description": description,
            "trade_in_vehicle": vehicle_description if atype == "trade_in" else "",
            "trade_in_mileage": trade_in_mileage,
        }
        email_sent = send_appointment_email(email_data, lang=lang)

        # Build response for the agent
        service_label = _service_label(service_type, lang) if service_type else ""
        time_label = _time_label(time_preference, lang)

        result = {
            "status": "confirmed",
            "booking_ref": booking_ref,
            "appointment_type": atype,
            "customer": f"{first_name} {last_name}",
            "email": email,
            "preferred_date": preferred_date,
            "time_slot": time_label,
            "dealer": resolved_dealer,
            "email_sent": email_sent,
        }
        if vehicle_name:
            result["vehicle"] = vehicle_name
        if service_label:
            result["service_type"] = service_label
        if vehicle_description and atype == "trade_in":
            result["trade_in_vehicle"] = vehicle_description
        if email_sent:
            result["note"] = "Confirmation email with calendar invite has been sent."
        else:
            result["note"] = "Appointment registered. Email could not be sent — dealer will contact directly."

        return result

    def is_available(self) -> bool:
        return self.client is not None
