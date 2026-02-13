"""Seed realistic demo leads and conversations for the BMW CH Network Dashboard."""

import json
import random
import sys
from datetime import datetime, timedelta

sys.path.insert(0, ".")

from backend.database import SessionLocal, init_db
from backend.models.vehicle import Vehicle
from backend.models.backoffice import Lead, Conversation, ConversationMessage, ActivityLog, ServiceRequest

DEMO_LEADS = [
    {
        "name": "Thomas Müller",
        "email": "t.mueller@bluewin.ch",
        "phone": "+41 79 345 67 89",
        "status": "qualified",
        "score": 82,
        "series_pref": ["X5", "X7", "iX"],
        "messages": [
            ("user", "I'm looking for a large SUV for my family. Preferably electric or at least hybrid."),
            ("assistant", "Great choice for a family SUV! Here are top options from our Swiss dealer stock:\n\n- **BMW iX xDrive40** — all-electric, spacious, 425km range\n- **BMW X5 xDrive45e** — plug-in hybrid, powerful and versatile\n- **BMW X7 xDrive40d** — ultimate space, 7-seater luxury\n\nWould you prefer fully electric or is hybrid an option too?"),
            ("user", "I like the iX. What colors are available? And what about the X5 hybrid?"),
            ("assistant", "The iX comes in multiple colors across Swiss dealers. Let me search for both:\n\n- **BMW iX xDrive40** — available in Black, White, and Blue across 4 dealers\n- **BMW X5 xDrive45e** — wider color range including Green and Gray\n\nWant to schedule a test drive for either?"),
            ("user", "Yes, I'd like to test drive the iX. My name is Thomas Müller, email t.mueller@bluewin.ch"),
        ],
    },
    {
        "name": "Sarah Keller",
        "email": "sarah.keller@gmail.com",
        "status": "contacted",
        "score": 65,
        "series_pref": ["3", "4", "i4"],
        "messages": [
            ("user", "What sporty sedans do you have under 70,000 CHF?"),
            ("assistant", "Here are sporty options under CHF 70k:\n\n- **BMW 330i Sedan** — classic sport sedan, great handling\n- **BMW i4 eDrive35** — electric Gran Coupé, stunning performance\n- **BMW 430i Gran Coupé** — sleek design, 4-door practicality\n\nAre you drawn more to electric or petrol?"),
            ("user", "The i4 is interesting. How does it compare to the 3 Series?"),
        ],
    },
    {
        "name": None,
        "email": None,
        "status": "new",
        "score": 35,
        "series_pref": ["1", "2", "iX1"],
        "messages": [
            ("user", "What's your cheapest electric car?"),
            ("assistant", "The most affordable electric BMW in Swiss stock:\n\n- **BMW iX1 xDrive30** — compact electric SUV, great city-to-highway range\n\nStarting from around CHF 52,000. Want to see what's available at dealers near you?"),
        ],
    },
    {
        "name": "Marco Bernasconi",
        "email": "m.bernasconi@ticino.ch",
        "phone": "+41 76 890 12 34",
        "status": "qualified",
        "score": 91,
        "series_pref": ["M", "M3", "M4"],
        "messages": [
            ("user", "Ich suche einen BMW M Wagen. Budget bis 150'000 CHF."),
            ("assistant", "Hervorragende Wahl! Hier sind M-Modelle in Schweizer Händlerbestand:\n\n- **BMW M3 Competition** — 510 PS, pure Fahrfreude\n- **BMW M4 Competition** — Coupé-Eleganz mit M-Power\n- **BMW M340i xDrive** — M-Performance mit Allrad-Komfort\n\nMöchten Sie eine Probefahrt vereinbaren?"),
            ("user", "Ja, gerne eine Probefahrt für den M3. Marco Bernasconi, +41 76 890 12 34"),
            ("assistant", "Probefahrt ist registriert! Ihr nächster BMW-Händler wird sich innerhalb 24 Stunden melden.\n\n- **BMW M3 Competition** — Probefahrt angefragt\n\nKann ich Ihnen noch bei etwas helfen?"),
            ("user", "Welche Farben gibt es beim M3?"),
        ],
    },
    {
        "name": "Andrea Rossi",
        "email": "andrea.rossi@outlook.com",
        "status": "new",
        "score": 48,
        "series_pref": ["X1", "X3"],
        "messages": [
            ("user", "I need a compact SUV for daily commuting. Not too expensive."),
            ("assistant", "Perfect for commuting! Here are compact SUVs in stock:\n\n- **BMW X1 sDrive18i** — efficient, affordable, great for the city\n- **BMW X3 xDrive20d** — diesel efficiency with more space\n- **BMW iX1 xDrive30** — go fully electric for zero emissions\n\nWhat's your budget range?"),
        ],
    },
    {
        "name": "Claudia Weber",
        "email": "c.weber@sunrise.ch",
        "status": "converted",
        "score": 95,
        "series_pref": ["5", "i5"],
        "messages": [
            ("user", "Looking at the new 5 Series. What electric options are there?"),
            ("assistant", "The new 5 Series is stunning! Electric options in stock:\n\n- **BMW i5 eDrive40** — pure electric, 582km range, executive luxury\n- **BMW i5 M60 xDrive** — electric M performance, 601 HP\n\nBoth available at multiple Swiss dealers. Want details on a specific one?"),
            ("user", "The i5 eDrive40 please. Preferably in blue. My name is Claudia Weber, c.weber@sunrise.ch"),
            ("assistant", "Found a beautiful blue i5 eDrive40! Test drive has been scheduled.\n\nYour dealer will contact you shortly to confirm the appointment.\n\nAnything else I can help with?"),
            ("user", "That's perfect, thank you Max!"),
        ],
    },
    {
        "name": "Hans-Peter Schmid",
        "phone": "+41 78 234 56 78",
        "status": "contacted",
        "score": 72,
        "series_pref": ["7", "i7"],
        "messages": [
            ("user", "I'm considering the 7 Series or the electric i7. What's the price difference?"),
            ("assistant", "Here's a comparison of flagship sedans in stock:\n\n- **BMW i7 xDrive60** — full electric, ~CHF 155,000+\n- **BMW 740d xDrive** — diesel luxury, ~CHF 120,000+\n\nThe i7 offers a completely silent, tech-forward experience. The 740d gives proven long-distance comfort.\n\nWhich matters more: cutting-edge technology or proven reliability?"),
            ("user", "I want to see the i7 in person. Hans-Peter, +41 78 234 56 78"),
        ],
    },
    {
        "name": None,
        "email": None,
        "status": "new",
        "score": 25,
        "series_pref": ["Z4"],
        "messages": [
            ("user", "Do you have any convertibles?"),
            ("assistant", "Yes! The BMW Z4 is our roadster:\n\n- **BMW Z4 sDrive20i** — open-top driving pleasure, turbocharged\n- **BMW Z4 M40i** — performance roadster, 340 HP\n\nPerfect for Swiss summer roads! Want to see available colors?"),
        ],
    },
    {
        "name": "Natalie Favre",
        "email": "n.favre@protonmail.ch",
        "status": "new",
        "score": 55,
        "series_pref": ["X3", "X4", "iX3"],
        "messages": [
            ("user", "J'ai besoin d'un service pour mon X3. Le voyant moteur est allumé."),
            ("assistant", "Je suis désolé d'entendre ça. Je peux vous aider à prendre rendez-vous:\n\nJ'ai enregistré une demande de rendez-vous service pour un diagnostic moteur sur votre BMW X3. Votre conseiller service BMW vous contactera pour confirmer.\n\nEn attendant, si le voyant est orange (pas rouge), vous pouvez continuer à rouler prudemment. Puis-je vous aider avec autre chose?"),
            ("user", "Merci. En fait, je regarde aussi les nouveaux X3 électriques."),
        ],
    },
    {
        "name": "Luca Brunetti",
        "email": "luca.b@gmx.ch",
        "status": "qualified",
        "score": 78,
        "series_pref": ["X5", "X6"],
        "messages": [
            ("user", "Leasing options for an X5? What's the monthly payment?"),
            ("assistant", "Here are X5 options with monthly installments:\n\n- **BMW X5 xDrive30d** — from CHF 890/mo\n- **BMW X5 xDrive40i** — from CHF 1,050/mo\n- **BMW X5 xDrive45e** — hybrid, from CHF 1,120/mo\n\nAll with BMW Financial Services. Want a detailed quote for a specific one?"),
            ("user", "The X5 xDrive45e hybrid sounds good. Can I get a quote? Luca Brunetti, luca.b@gmx.ch"),
        ],
    },
]


def seed():
    init_db()
    db = SessionLocal()
    try:
        # Get available vehicles for each series preference
        all_vehicles = db.query(Vehicle).all()
        vehicles_by_series = {}
        for v in all_vehicles:
            s = v.series or "Other"
            vehicles_by_series.setdefault(s, []).append(v)

        base_time = datetime.utcnow() - timedelta(hours=48)

        for i, lead_data in enumerate(DEMO_LEADS):
            # Pick VINs from preferred series
            interested_vins = []
            for series in lead_data["series_pref"]:
                candidates = vehicles_by_series.get(series, [])
                if candidates:
                    picks = random.sample(candidates, min(2, len(candidates)))
                    interested_vins.extend([v.vin for v in picks])

            session_id = f"demo-{i:04d}-{random.randint(1000, 9999)}"
            created = base_time + timedelta(minutes=i * random.randint(30, 180))

            lead = Lead(
                session_id=session_id,
                customer_name=lead_data.get("name"),
                customer_email=lead_data.get("email"),
                customer_phone=lead_data.get("phone"),
                status=lead_data["status"],
                score=lead_data["score"],
                interested_vehicles=json.dumps(interested_vins),
                summary=f"Interested in {', '.join(lead_data['series_pref'])} series. {len(interested_vins)} vehicles explored.",
                created_at=created,
                updated_at=created + timedelta(minutes=len(lead_data["messages"]) * 2),
            )
            db.add(lead)
            db.flush()

            conv = Conversation(
                session_id=session_id,
                lead_id=lead.id,
                message_count=len(lead_data["messages"]),
                status="active" if lead_data["status"] in ("new", "contacted") else "ended",
                operator="ai",
                created_at=created,
                updated_at=created + timedelta(minutes=len(lead_data["messages"]) * 2),
            )
            db.add(conv)
            db.flush()

            for j, (role, content) in enumerate(lead_data["messages"]):
                msg = ConversationMessage(
                    conversation_id=conv.id,
                    role=role,
                    content=content,
                    vehicles_shown=json.dumps(interested_vins[:3] if role == "assistant" and interested_vins else []),
                    sender="customer" if role == "user" else "ai",
                    created_at=created + timedelta(minutes=j * 2),
                )
                db.add(msg)

            # Activity log entries
            db.add(ActivityLog(
                event_type="new_lead",
                title="New lead created",
                description=f"{lead_data.get('name') or session_id[:12]} started chatting",
                session_id=session_id,
                lead_id=lead.id,
                created_at=created,
            ))

            if interested_vins:
                db.add(ActivityLog(
                    event_type="vehicle_shown",
                    title=f"{len(interested_vins)} vehicle(s) recommended",
                    description=f"Showed: {', '.join(interested_vins[:3])}",
                    session_id=session_id,
                    lead_id=lead.id,
                    created_at=created + timedelta(minutes=3),
                ))

            if lead_data.get("email"):
                db.add(ActivityLog(
                    event_type="status_change",
                    title=f"Lead status: {lead_data['status']}",
                    description=f"{lead_data.get('name', 'Lead')} — {lead_data['status']}",
                    session_id=session_id,
                    lead_id=lead.id,
                    created_at=created + timedelta(minutes=5),
                ))

        # Seed service requests
        DEMO_SERVICES = [
            {"service_type": "tire_change", "vehicle_description": "BMW X5 xDrive45e 2024", "customer_name": "Thomas Müller", "contact": "t.mueller@bluewin.ch", "description": "Winter to summer tire swap", "status": "pending", "dealer_name": "BMW Zürich-Dielsdorf"},
            {"service_type": "maintenance", "vehicle_description": "BMW 330i Sedan 2023", "customer_name": "Sarah Keller", "contact": "sarah.keller@gmail.com", "description": "Annual service — 30,000km check", "status": "confirmed", "dealer_name": "BMW Niederlassung Zürich"},
            {"service_type": "tire_change", "vehicle_description": "BMW M3 Competition 2024", "customer_name": "Marco Bernasconi", "contact": "+41 76 890 12 34", "description": "Reifenwechsel Sommer — Michelin Pilot Sport", "status": "pending", "dealer_name": "BMW Lugano"},
            {"service_type": "repair", "vehicle_description": "BMW X3 xDrive20d 2022", "customer_name": "Natalie Favre", "contact": "n.favre@protonmail.ch", "description": "Voyant moteur allumé — diagnostic requis", "status": "pending", "dealer_name": "BMW Lausanne"},
            {"service_type": "maintenance", "vehicle_description": "BMW i5 eDrive40 2024", "customer_name": "Claudia Weber", "contact": "c.weber@sunrise.ch", "description": "First service at 15,000km", "status": "completed", "dealer_name": "BMW Bern"},
            {"service_type": "inspection", "vehicle_description": "BMW 740d xDrive 2021", "customer_name": "Hans-Peter Schmid", "contact": "+41 78 234 56 78", "description": "MFK preparation and pre-check", "status": "pending", "dealer_name": "BMW Basel"},
            {"service_type": "tire_change", "vehicle_description": "BMW iX xDrive40 2024", "customer_name": "Peter Gerber", "contact": "p.gerber@swisscom.ch", "description": "Winter tires — all-season conversion", "status": "confirmed", "dealer_name": "BMW Winterthur"},
            {"service_type": "maintenance", "vehicle_description": "BMW X1 sDrive18i 2023", "customer_name": "Andrea Rossi", "contact": "andrea.rossi@outlook.com", "description": "Oil change and brake check", "status": "pending", "dealer_name": "BMW Zürich-Dielsdorf"},
            {"service_type": "repair", "vehicle_description": "BMW Z4 M40i 2023", "customer_name": "Stefan Huber", "contact": "s.huber@gmx.ch", "description": "Windshield chip repair", "status": "confirmed", "dealer_name": "BMW Niederlassung Zürich"},
            {"service_type": "tire_change", "vehicle_description": "BMW X5 xDrive30d 2022", "customer_name": "Luca Brunetti", "contact": "luca.b@gmx.ch", "description": "Summer tire fitting — Pirelli P Zero", "status": "pending", "dealer_name": "BMW Ticino"},
            {"service_type": "recall", "vehicle_description": "BMW i4 eDrive35 2023", "customer_name": "Laura Meier", "contact": "l.meier@bluewin.ch", "description": "Software update recall — charging module", "status": "pending", "dealer_name": "BMW Bern"},
            {"service_type": "maintenance", "vehicle_description": "BMW 520d Touring 2022", "customer_name": "René Dubois", "contact": "r.dubois@sunrise.ch", "description": "60,000km full service", "status": "confirmed", "dealer_name": "BMW Genève"},
        ]

        for j, svc in enumerate(DEMO_SERVICES):
            sr = ServiceRequest(
                service_type=svc["service_type"],
                vehicle_description=svc["vehicle_description"],
                customer_name=svc["customer_name"],
                contact=svc["contact"],
                description=svc["description"],
                status=svc["status"],
                dealer_name=svc.get("dealer_name"),
                created_at=base_time + timedelta(minutes=j * random.randint(20, 120)),
            )
            db.add(sr)
            db.add(ActivityLog(
                event_type="service_request",
                title=f"Service: {svc['service_type'].replace('_', ' ').title()}",
                description=f"{svc['customer_name']} — {svc['vehicle_description']}",
                created_at=base_time + timedelta(minutes=j * random.randint(20, 120)),
            ))

        db.commit()
        print(f"Seeded {len(DEMO_LEADS)} demo leads with conversations and activity.")
        print(f"Seeded {len(DEMO_SERVICES)} demo service requests.")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
