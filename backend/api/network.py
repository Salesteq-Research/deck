"""BMW CH Network Command Center API — group-level analytics across the Swiss dealer network."""

import json
import logging
from collections import defaultdict
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.vehicle import Vehicle
from ..models.backoffice import Lead, Conversation, ConversationMessage, ActivityLog, ServiceRequest
from ..services.agent_service import AgentService

router = APIRouter(prefix="/api/network", tags=["network"])
logger = logging.getLogger(__name__)


@router.get("/stats")
def get_network_stats(db: Session = Depends(get_db)):
    """Network-wide KPIs for BMW CH executive command center."""
    total_vehicles = db.query(func.count(Vehicle.vin)).scalar() or 0
    dealer_count = db.query(func.count(func.distinct(Vehicle.dealer_name))).scalar() or 0

    total_leads = db.query(func.count(Lead.id)).scalar() or 0
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    new_leads_today = db.query(func.count(Lead.id)).filter(Lead.created_at >= today).scalar() or 0
    total_conversations = db.query(func.count(Conversation.id)).scalar() or 0
    active_conversations = db.query(func.count(Conversation.id)).filter(Conversation.status == "active").scalar() or 0
    total_messages = db.query(func.count(ConversationMessage.id)).scalar() or 0
    avg_score = db.query(func.avg(Lead.score)).scalar() or 0

    # EV demand from customer interest
    leads = db.query(Lead).all()
    ev_interest = 0
    total_interest = 0
    for lead in leads:
        for vin in lead.interested_vehicles_list:
            total_interest += 1
            v = db.query(Vehicle).filter(Vehicle.vin == vin).first()
            if v and v.fuel_type == "ELECTRIC":
                ev_interest += 1

    ev_demand_pct = round((ev_interest / total_interest * 100) if total_interest > 0 else 0, 1)

    # Lead funnel
    funnel = {}
    for status, count in db.query(Lead.status, func.count(Lead.id)).group_by(Lead.status).all():
        funnel[status] = count

    # Service requests
    total_service = db.query(func.count(ServiceRequest.id)).scalar() or 0
    pending_service = db.query(func.count(ServiceRequest.id)).filter(ServiceRequest.status == "pending").scalar() or 0

    # Service type breakdown
    service_breakdown = {}
    for stype, cnt in db.query(ServiceRequest.service_type, func.count(ServiceRequest.id)).group_by(ServiceRequest.service_type).all():
        service_breakdown[stype] = cnt

    # Inventory fuel mix
    fuel_rows = db.query(Vehicle.fuel_type, func.count(Vehicle.vin)).filter(Vehicle.fuel_type.isnot(None)).group_by(Vehicle.fuel_type).all()
    ev_stock = sum(c for ft, c in fuel_rows if ft == "ELECTRIC")
    ev_stock_pct = round((ev_stock / total_vehicles * 100) if total_vehicles > 0 else 0, 1)

    return {
        "total_vehicles": total_vehicles,
        "dealer_count": dealer_count,
        "total_leads": total_leads,
        "new_leads_today": new_leads_today,
        "total_conversations": total_conversations,
        "active_conversations": active_conversations,
        "total_messages": total_messages,
        "avg_score": round(avg_score, 1),
        "ev_demand_pct": ev_demand_pct,
        "ev_stock_pct": ev_stock_pct,
        "lead_funnel": funnel,
        "total_service_requests": total_service,
        "pending_service_requests": pending_service,
        "service_breakdown": service_breakdown,
    }


@router.get("/demand")
def get_demand_intelligence(db: Session = Depends(get_db)):
    """Demand analysis: what customers are asking for vs what's in stock."""
    leads = db.query(Lead).all()

    series_demand: dict[str, int] = defaultdict(int)
    fuel_demand: dict[str, int] = defaultdict(int)
    body_demand: dict[str, int] = defaultdict(int)
    price_segments = {"under_50k": 0, "50k_100k": 0, "100k_150k": 0, "over_150k": 0}

    for lead in leads:
        for vin in lead.interested_vehicles_list:
            v = db.query(Vehicle).filter(Vehicle.vin == vin).first()
            if not v:
                continue
            series_demand[v.series or "Other"] += 1
            fuel_demand[v.fuel_type or "Other"] += 1
            body_demand[v.body_type or "Other"] += 1
            if v.price_offer:
                if v.price_offer < 50000:
                    price_segments["under_50k"] += 1
                elif v.price_offer < 100000:
                    price_segments["50k_100k"] += 1
                elif v.price_offer < 150000:
                    price_segments["100k_150k"] += 1
                else:
                    price_segments["over_150k"] += 1

    # Inventory supply breakdown for comparison
    series_supply: dict[str, int] = {}
    for s, c in db.query(Vehicle.series, func.count(Vehicle.vin)).filter(Vehicle.series.isnot(None)).group_by(Vehicle.series).all():
        series_supply[s] = c

    fuel_supply: dict[str, int] = {}
    for ft, c in db.query(Vehicle.fuel_type, func.count(Vehicle.vin)).filter(Vehicle.fuel_type.isnot(None)).group_by(Vehicle.fuel_type).all():
        fuel_supply[ft] = c

    body_supply: dict[str, int] = {}
    for bt, c in db.query(Vehicle.body_type, func.count(Vehicle.vin)).filter(Vehicle.body_type.isnot(None)).group_by(Vehicle.body_type).all():
        body_supply[bt] = c

    return {
        "series_demand": sorted([{"series": s, "demand": c, "supply": series_supply.get(s, 0)} for s, c in series_demand.items()], key=lambda x: x["demand"], reverse=True)[:15],
        "fuel_demand": sorted([{"fuel_type": ft, "demand": c, "supply": fuel_supply.get(ft, 0)} for ft, c in fuel_demand.items()], key=lambda x: x["demand"], reverse=True),
        "body_demand": sorted([{"body_type": bt, "demand": c, "supply": body_supply.get(bt, 0)} for bt, c in body_demand.items()], key=lambda x: x["demand"], reverse=True),
        "price_segments": price_segments,
        "series_supply": sorted([{"series": s, "count": c} for s, c in series_supply.items()], key=lambda x: x["count"], reverse=True),
        "fuel_supply": sorted([{"fuel_type": ft, "count": c} for ft, c in fuel_supply.items()], key=lambda x: x["count"], reverse=True),
    }


@router.get("/dealers")
def get_dealer_performance(db: Session = Depends(get_db)):
    """Dealer network performance comparison."""
    dealer_rows = (
        db.query(
            Vehicle.dealer_name,
            Vehicle.dealer_id,
            func.count(Vehicle.vin).label("stock"),
            func.avg(Vehicle.price_offer).label("avg_price"),
        )
        .filter(Vehicle.dealer_name.isnot(None))
        .group_by(Vehicle.dealer_name, Vehicle.dealer_id)
        .order_by(Vehicle.dealer_name)
        .all()
    )

    # Map dealer interest from leads
    leads = db.query(Lead).all()
    dealer_leads: dict[str, int] = defaultdict(int)
    dealer_scores: dict[str, list] = defaultdict(list)

    for lead in leads:
        touched = set()
        for vin in lead.interested_vehicles_list:
            v = db.query(Vehicle).filter(Vehicle.vin == vin).first()
            if v and v.dealer_name:
                touched.add(v.dealer_name)
        for d in touched:
            dealer_leads[d] += 1
            dealer_scores[d].append(lead.score or 0)

    dealers = []
    for row in dealer_rows:
        name = row.dealer_name
        scores = dealer_scores.get(name, [])
        dealers.append({
            "dealer_name": name,
            "dealer_id": row.dealer_id,
            "stock": row.stock,
            "avg_price": round(row.avg_price, 0) if row.avg_price else 0,
            "leads": dealer_leads.get(name, 0),
            "avg_lead_score": round(sum(scores) / len(scores), 1) if scores else 0,
        })

    dealers.sort(key=lambda x: x["leads"], reverse=True)
    return {"dealers": dealers}


@router.get("/activity")
def get_network_activity(limit: int = 40, db: Session = Depends(get_db)):
    """Real-time activity feed across the entire dealer network."""
    items = (
        db.query(ActivityLog)
        .order_by(desc(ActivityLog.created_at))
        .limit(limit)
        .all()
    )

    results = []
    for a in items:
        desc_text = a.description or ""
        if a.event_type == "vehicle_shown" and "Showed:" in desc_text:
            vins_part = desc_text.split("Showed: ", 1)[1] if "Showed: " in desc_text else ""
            vins = [v.strip() for v in vins_part.split(",") if v.strip()]
            names = []
            for vin in vins[:3]:
                v = db.query(Vehicle).filter(Vehicle.vin == vin).first()
                names.append(v.name if v else vin[:11])
            desc_text = ", ".join(names)
        results.append({
            "id": a.id,
            "event_type": a.event_type,
            "title": a.title,
            "description": desc_text,
            "session_id": a.session_id,
            "lead_id": a.lead_id,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })
    return results


@router.get("/ai-brief")
def get_ai_brief(db: Session = Depends(get_db)):
    """AI-generated executive brief for BMW CH leadership."""
    agent = AgentService(db)

    prompt = """You are briefing the BMW Switzerland Head of Sales — the executive responsible for the entire Swiss dealer network.

Generate a concise 4-5 sentence executive brief. Use get_dashboard_stats and get_inventory_stats to gather real data.

Focus on:
1. Current network inventory health and lead pipeline
2. Which models/segments drive the most customer interest
3. EV transition progress in customer demand vs stock
4. Immediate opportunities or recommended actions

Be specific with numbers. No fluff. Address them as a peer executive. Use plain text, no markdown headers."""

    result = agent.chat(message=prompt, conversation_history=[])
    return {
        "brief": result["message"],
        "tool_calls": [
            {"name": tc["name"], "result_summary": tc["result_summary"]}
            for tc in result.get("tool_calls", [])
        ],
    }
