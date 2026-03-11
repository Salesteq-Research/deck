#!/usr/bin/env python3
"""Programmatic evaluation of the dealer agent across critical scenarios.

Runs multi-turn conversations against the live API and checks for:
- Response length (should be <25 words)
- No filler phrases
- Tool call correctness (no premature booking, no invented dates)
- Language consistency
- Vehicle card behavior ([RECOMMEND] tags stripped)
"""

import json
import re
import sys
import urllib.request
from typing import List, Dict, Any

API = "http://localhost:8080"
PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
WARN = "\033[93mWARN\033[0m"

results = {"pass": 0, "fail": 0, "warn": 0}


def chat(message: str, history: List[Dict] = None, language: str = "de", dealer: str = "Hedin Automotive Schweiz AG") -> Dict[str, Any]:
    """Send a message to the chat API and return the response."""
    payload = {
        "message": message,
        "conversation_history": history or [],
        "session_id": "eval-" + str(hash(message))[-8:],
        "language": language,
        "dealer_name": dealer,
    }
    req = urllib.request.Request(
        f"{API}/api/chat",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def word_count(text: str) -> int:
    return len(text.split())


def check(name: str, condition: bool, detail: str = ""):
    global results
    if condition:
        results["pass"] += 1
        print(f"  {PASS} {name}" + (f" — {detail}" if detail else ""))
    else:
        results["fail"] += 1
        print(f"  {FAIL} {name}" + (f" — {detail}" if detail else ""))


def warn(name: str, detail: str = ""):
    global results
    results["warn"] += 1
    print(f"  {WARN} {name}" + (f" — {detail}" if detail else ""))


FILLER = [
    "certainly", "great choice", "i'd be happy to", "absolutely", "of course",
    "excellent", "wonderful", "fantastic", "i understand", "no problem",
    "selbstverständlich", "natürlich", "sehr gerne", "ausgezeichnet",
]


def check_response_quality(resp: Dict, scenario: str, max_words: int = 35):
    """Common quality checks on a response."""
    msg = resp.get("message", "")
    wc = word_count(msg)

    print(f"\n{'='*60}")
    print(f"Scenario: {scenario}")
    print(f"Response ({wc}w): {msg[:200]}{'...' if len(msg) > 200 else ''}")
    print(f"Tool calls: {[t['name'] for t in resp.get('tool_calls', [])]}")
    print(f"Vehicles: {len(resp.get('recommended_vins', []))} recommended")

    check("Response length", wc <= max_words, f"{wc} words (limit {max_words})")

    lower = msg.lower()
    found_filler = [f for f in FILLER if f in lower]
    check("No filler phrases", len(found_filler) == 0,
          f"found: {found_filler}" if found_filler else "clean")

    check("No [RECOMMEND] tag leaked", "[RECOMMEND" not in msg, msg[:100] if "[RECOMMEND" in msg else "")

    return msg


# ═══════════════════════════════════════════════════════
# SCENARIOS
# ═══════════════════════════════════════════════════════

print("\n" + "="*60)
print("BMW DEALER AGENT — PROGRAMMATIC EVAL")
print("="*60)

# ── 1. Basic vehicle search (German) ──
resp = chat("Was habt ihr an SUVs?")
msg = check_response_quality(resp, "1. Basic SUV search (DE)")
tools = [t["name"] for t in resp.get("tool_calls", [])]
check("Used search_inventory", "search_inventory" in tools)
check("Has vehicle recommendations", len(resp.get("recommended_vins", [])) > 0 or len(resp.get("all_vehicle_vins", [])) > 0)

# ── 2. Budget search ──
resp = chat("Zeig mir was unter 50000 CHF")
msg = check_response_quality(resp, "2. Budget search under 50k")
tools = [t["name"] for t in resp.get("tool_calls", [])]
check("Used search_inventory", "search_inventory" in tools)

# ── 3. French language consistency ──
resp = chat("Qu'avez-vous comme voitures électriques?", language="fr")
msg = check_response_quality(resp, "3. French electric cars")
has_french = any(w in msg.lower() for w in ["nous", "vous", "les", "des", "voiture", "électr", "stock", "véhicule"])
check("Responds in French", has_french, msg[:80])

# ── 4. Italian language ──
resp = chat("Quali SUV avete disponibili?", language="it")
msg = check_response_quality(resp, "4. Italian SUV search")
has_italian = any(w in msg.lower() for w in ["abbiamo", "veicol", "suv", "disponibil", "preferit", "elettric"])
check("Responds in Italian", has_italian, msg[:80])

# ── 5. Trade-in WITHOUT date — should NOT auto-book ──
history = []
resp1 = chat("Ich möchte meinen BMW 5er in Zahlung geben", language="de")
msg1 = check_response_quality(resp1, "5a. Trade-in inquiry (no date)")
tools1 = [t["name"] for t in resp1.get("tool_calls", [])]
check("Does NOT call book_appointment yet", "book_appointment" not in tools1,
      f"tools called: {tools1}")

history.append({"role": "user", "content": "Ich möchte meinen BMW 5er in Zahlung geben"})
history.append({"role": "assistant", "content": msg1})

resp2 = chat("BMW 530d, 2022, 80000km, Viktor Müller, viktor@test.com", history=history, language="de")
msg2 = check_response_quality(resp2, "5b. Trade-in with details but NO date")
tools2 = [t["name"] for t in resp2.get("tool_calls", [])]
if "book_appointment" in tools2:
    # Check if a date was invented
    for tc in resp2.get("tool_calls", []):
        if tc["name"] == "book_appointment":
            has_date = bool(tc["input"].get("preferred_date"))
            check("No invented date in booking", not has_date,
                  f"preferred_date={tc['input'].get('preferred_date', 'none')}")
            break

# ── 6. Test drive — should ask for date ──
resp = chat("I want to test drive an X5", language="en")
msg = check_response_quality(resp, "6. Test drive request (EN)")
tools = [t["name"] for t in resp.get("tool_calls", [])]
check("Does NOT book without info", "book_appointment" not in tools)

# ── 7. Service appointment ──
resp = chat("Ich brauche einen Ölwechsel für meinen 320d", language="de")
msg = check_response_quality(resp, "7. Service request (oil change)")
tools = [t["name"] for t in resp.get("tool_calls", [])]
check("Does NOT book without contact info", "book_appointment" not in tools)

# ── 8. Comparison request ──
resp = chat("Was ist der Unterschied zwischen dem X3 und X5?", language="de")
msg = check_response_quality(resp, "8. Comparison request")
tools = [t["name"] for t in resp.get("tool_calls", [])]
has_search_or_compare = "search_inventory" in tools or "compare_vehicles" in tools
check("Uses search or compare tool", has_search_or_compare)

# ── 9. English casual register ──
resp = chat("yo got any fast cars under 80k?", language="en")
msg = check_response_quality(resp, "9. Casual English register")
tools = [t["name"] for t in resp.get("tool_calls", [])]
check("Used search_inventory", "search_inventory" in tools)

# ── 10. Disambiguation ──
resp = chat("Zeig mir den 3er", language="de")
msg = check_response_quality(resp, "10. Ambiguous '3er' request")

# ═══════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════
print("\n" + "="*60)
print(f"RESULTS: {results['pass']} passed, {results['fail']} failed, {results['warn']} warnings")
print("="*60)

if results["fail"] > 0:
    sys.exit(1)
