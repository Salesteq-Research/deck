"""Chat API endpoints."""

import re
from typing import Tuple, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.claude_service import ClaudeService
from ..services.rag_service import RAGService
from ..models.schemas import ChatRequest, ChatResponse, VehicleCardResponse
from ..config import MAX_CONTEXT_VEHICLES

router = APIRouter(prefix="/api/chat", tags=["chat"])

claude_service = ClaudeService()


def _parse_price_constraint(message: str) -> Tuple[Optional[float], Optional[float]]:
    """Extract min/max price from a user message. Returns (min_price, max_price)."""
    text = message.lower().replace("'", "").replace("\u2019", "")
    # Normalise common Swiss thousand separators: "60'000" "60,000" "60.000" → "60000"
    # But keep decimal amounts like "59999.99" by only collapsing when followed by 3 digits
    text = re.sub(r"(\d)[',.](\d{3})(?!\d)", r"\1\2", text)

    min_price = None
    max_price = None

    # "under / below / less than / bis / unter / max / up to  60000"
    m = re.search(
        r"(?:under|below|less\s+than|up\s+to|bis|unter|max(?:imal)?|cheaper\s+than|within|budget(?:\s+of)?|höchstens|maximal)\s*"
        r"(?:chf\s*)?(\d[\d]*)",
        text,
    )
    if m:
        max_price = float(m.group(1))

    # "over / above / more than / ab / über / min / from  60000"
    m = re.search(
        r"(?:over|above|more\s+than|from|starting|ab|über|mind(?:estens)?|min(?:imal)?|at\s+least)\s*"
        r"(?:chf\s*)?(\d[\d]*)",
        text,
    )
    if m:
        min_price = float(m.group(1))

    # "between 50000 and 80000"  /  "50000-80000"  /  "zwischen 50000 und 80000"
    m = re.search(
        r"(?:between|zwischen|from|von)\s*(?:chf\s*)?(\d[\d]*)\s*(?:and|und|to|bis|-)\s*(?:chf\s*)?(\d[\d]*)",
        text,
    )
    if m:
        min_price = float(m.group(1))
        max_price = float(m.group(2))

    # "<CHF 60000"  or  "< 60000"
    m = re.search(r"<\s*(?:chf\s*)?(\d[\d]*)", text)
    if m and max_price is None:
        max_price = float(m.group(1))

    # ">CHF 60000"  or  "> 60000"
    m = re.search(r">\s*(?:chf\s*)?(\d[\d]*)", text)
    if m and min_price is None:
        min_price = float(m.group(1))

    return min_price, max_price


@router.post("", response_model=ChatResponse)
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """Process a chat message and return AI response with relevant vehicles."""

    rag_service = RAGService(db)

    conversation_history = [
        {"role": msg.role, "content": msg.content}
        for msg in request.conversation_history
    ]

    # --- Parse price constraints -------------------------------------------------
    min_price, max_price = _parse_price_constraint(request.message)
    has_price_filter = min_price is not None or max_price is not None

    # --- Price-filtered results (if applicable) ----------------------------------
    price_results = []
    if has_price_filter:
        price_results = rag_service.price_filtered_search(
            min_price=min_price,
            max_price=max_price,
            n_results=MAX_CONTEXT_VEHICLES,
        )

    # --- Semantic / keyword search -----------------------------------------------
    search_queries = claude_service.expand_search_queries(
        message=request.message,
        conversation_history=conversation_history,
    )
    all_queries = [request.message] + search_queries

    semantic_results = rag_service.multi_query_search(
        queries=all_queries,
        n_results=MAX_CONTEXT_VEHICLES,
    )

    # --- Merge: price-filtered results first, then semantic (dedup by VIN) -------
    if has_price_filter:
        seen_vins = {r["vehicle"]["vin"] for r in price_results}
        # Add semantic results that also satisfy the price constraint
        for r in semantic_results:
            vin = r["vehicle"]["vin"]
            offer = r["vehicle"].get("price_offer")
            if vin in seen_vins:
                continue
            if offer is not None:
                if max_price is not None and offer > max_price:
                    continue
                if min_price is not None and offer < min_price:
                    continue
            price_results.append(r)
            seen_vins.add(vin)
        search_results = price_results[:MAX_CONTEXT_VEHICLES]
    else:
        search_results = semantic_results

    # Build context for Claude from the search results
    context = rag_service.build_context(search_results)

    response_text = claude_service.chat(
        message=request.message,
        context=context,
        conversation_history=conversation_history,
    )

    # Parse recommended VINs from Claude's response
    recommend_match = re.search(r"\[RECOMMEND:\s*([^\]]*)\]", response_text)
    recommended_vins = set()
    if recommend_match:
        raw = recommend_match.group(1).strip()
        if raw.lower() != "none":
            recommended_vins = {v.strip() for v in raw.split(",") if v.strip()}

    # Strip the [RECOMMEND: ...] tag from the visible message
    clean_text = re.sub(r"\s*\[RECOMMEND:[^\]]*\]\s*", "", response_text).strip()

    # Build vehicle cards
    vehicle_map = {}
    for result in search_results:
        v = result["vehicle"]
        vehicle_map[v["vin"]] = VehicleCardResponse(
            vin=v["vin"],
            name=v["name"],
            series=v.get("series"),
            body_type=v.get("body_type"),
            fuel_type=v.get("fuel_type"),
            color=v.get("color"),
            price=v.get("price"),
            price_offer=v.get("price_offer"),
            currency=v.get("currency", "CHF"),
            image=v.get("image"),
            images=v.get("images", []),
            dealer_name=v.get("dealer_name"),
            url=v.get("url"),
        )

    # Return cards in the order Claude recommended; fall back to all if parsing failed
    if recommended_vins:
        vehicle_cards = [vehicle_map[vin] for vin in recommended_vins if vin in vehicle_map]
    else:
        vehicle_cards = list(vehicle_map.values())

    # Generate suggested follow-up questions
    suggested_questions = claude_service.generate_suggested_questions(
        context=context,
        last_response=clean_text,
    )

    return ChatResponse(
        message=clean_text,
        vehicles=vehicle_cards,
        suggested_questions=suggested_questions,
    )


@router.get("/status")
def get_chat_status(db: Session = Depends(get_db)):
    """Get chat service status."""
    rag_service = RAGService(db)
    return {
        "claude_available": claude_service.is_available(),
        "rag_stats": rag_service.get_stats(),
    }
