"""RAG (Retrieval Augmented Generation) service for vehicle search."""

import logging
from typing import List, Dict, Any, Optional

from sqlalchemy.orm import Session

from ..config import CHROMA_DIR, EMBEDDING_MODEL
from ..models.vehicle import Vehicle

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_PREMIUM_SERIES = {"7", "8", "X7", "M", "i7", "iX"}


def _is_premium(vehicle: Dict[str, Any]) -> bool:
    series = (vehicle.get("series") or "").upper()
    return series in _PREMIUM_SERIES


def _premium_boost(vehicle: Dict[str, Any], query_words: set) -> int:
    """Sort key: premium models whose series/name share query words get priority 0."""
    if not _is_premium(vehicle):
        return 1
    text = f"{vehicle.get('name', '')} {vehicle.get('series', '')}".lower()
    text_words = set(text.split())
    if query_words & text_words - {"the", "a", "an", "for", "and", "or", "in", "to", "of", "bmw"}:
        return 0
    return 1


class RAGService:
    """Service for RAG-based vehicle retrieval."""

    def __init__(self, db: Session):
        self.db = db
        self._collection = None
        self._embedding_function = None
        self._chroma_client = None

    def _init_chroma(self):
        if self._collection is not None:
            return

        try:
            import chromadb
            from chromadb.config import Settings

            CHROMA_DIR.mkdir(parents=True, exist_ok=True)

            self._chroma_client = chromadb.PersistentClient(
                path=str(CHROMA_DIR),
                settings=Settings(anonymized_telemetry=False),
            )

            try:
                from chromadb.utils import embedding_functions
                self._embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
                    model_name=EMBEDDING_MODEL
                )
            except Exception as e:
                logger.warning(f"Could not load sentence transformer: {e}")
                self._embedding_function = None

            self._collection = self._chroma_client.get_or_create_collection(
                name="vehicles",
                embedding_function=self._embedding_function,
                metadata={"hnsw:space": "cosine"},
            )

            logger.info(f"ChromaDB initialized with {self._collection.count()} documents")

        except ImportError as e:
            logger.error(f"ChromaDB not available: {e}")
            raise

    def index_vehicles(self, vehicles: List[Vehicle] = None) -> int:
        """Index vehicles into ChromaDB for vector search."""
        self._init_chroma()

        if vehicles is None:
            vehicles = self.db.query(Vehicle).all()

        if not vehicles:
            logger.warning("No vehicles to index")
            return 0

        documents = []
        metadatas = []
        ids = []

        for vehicle in vehicles:
            doc_text = vehicle.to_search_text()
            if not doc_text.strip():
                continue

            documents.append(doc_text)
            metadatas.append({
                "vin": vehicle.vin,
                "name": vehicle.name or "",
                "series": vehicle.series or "",
                "fuel_type": vehicle.fuel_type or "",
                "body_type": vehicle.body_type or "",
            })
            ids.append(vehicle.vin)

        if not documents:
            return 0

        try:
            self._chroma_client.delete_collection("vehicles")
            self._collection = self._chroma_client.create_collection(
                name="vehicles",
                embedding_function=self._embedding_function,
                metadata={"hnsw:space": "cosine"},
            )
        except Exception as e:
            logger.warning(f"Could not clear existing collection: {e}")

        batch_size = 100
        for i in range(0, len(documents), batch_size):
            batch_docs = documents[i:i + batch_size]
            batch_meta = metadatas[i:i + batch_size]
            batch_ids = ids[i:i + batch_size]

            self._collection.add(
                documents=batch_docs,
                metadatas=batch_meta,
                ids=batch_ids,
            )

        logger.info(f"Indexed {len(documents)} vehicles")
        return len(documents)

    def price_filtered_search(
        self, min_price: Optional[float] = None, max_price: Optional[float] = None, n_results: int = 10
    ) -> List[Dict[str, Any]]:
        """Return vehicles within a price range, sorted by price ascending."""
        query = self.db.query(Vehicle).filter(Vehicle.price_offer.isnot(None))
        if min_price is not None:
            query = query.filter(Vehicle.price_offer >= min_price)
        if max_price is not None:
            query = query.filter(Vehicle.price_offer <= max_price)
        vehicles = query.order_by(Vehicle.price_offer.asc()).limit(n_results).all()
        return [{"vehicle": v.to_dict(), "score": 0} for v in vehicles]

    _STOP_WORDS = {
        "show", "me", "find", "get", "the", "a", "an", "for", "and", "or",
        "in", "to", "of", "with", "my", "i", "want", "need", "looking",
        "search", "can", "you", "do", "have", "any", "some", "all", "please",
        "what", "which", "are", "is", "there", "give", "tell", "about",
        "vehicles", "vehicle", "cars", "car", "options", "models", "model",
        "available", "current", "inventory", "stock", "swiss", "switzerland",
        "zeig", "mir", "suche", "finde", "gibt", "es", "welche", "ich",
        "möchte", "brauche", "ein", "eine", "der", "die", "das", "und",
        "oder", "mit", "für", "alle", "bitte", "fahrzeuge", "fahrzeug",
        "autos", "auto", "wagen", "modelle", "modell", "verfügbar",
    }

    def _keyword_matches(self, query: str) -> List[Dict[str, Any]]:
        """Find vehicles whose name, VIN, series, body_type, fuel_type, color, or dealer contain keywords."""
        from sqlalchemy import or_

        words = query.split()
        seen_vins: set = set()
        results: list = []

        phrases = []
        for length in range(len(words), 0, -1):
            for start in range(len(words) - length + 1):
                phrase = " ".join(words[start:start + length])
                if len(phrase) >= 2:
                    # Skip single stop words, but allow multi-word phrases containing them
                    if length == 1 and phrase.lower() in self._STOP_WORDS:
                        continue
                    phrases.append(phrase)

        for phrase in phrases:
            if len(results) >= 5:
                break
            term = f"%{phrase}%"
            db_query = self.db.query(Vehicle).filter(
                or_(
                    Vehicle.name.ilike(term),
                    Vehicle.vin.ilike(term),
                    Vehicle.series.ilike(term),
                    Vehicle.body_type.ilike(term),
                    Vehicle.fuel_type.ilike(term),
                    Vehicle.color.ilike(term),
                    Vehicle.dealer_name.ilike(term),
                )
            )
            for v in db_query.limit(5).all():
                if v.vin not in seen_vins:
                    results.append({"vehicle": v.to_dict(), "score": 0})
                    seen_vins.add(v.vin)

        return results[:5]

    def search(self, query: str, n_results: int = 5) -> List[Dict[str, Any]]:
        """Search for vehicles using keyword match + semantic similarity."""
        self._init_chroma()

        keyword_results = self._keyword_matches(query)
        seen_vins = {r["vehicle"]["vin"] for r in keyword_results}

        if self._collection.count() == 0:
            logger.warning("No indexed vehicles, falling back to DB search")
            fallback = self._db_fallback_search(query, n_results)
            for r in fallback:
                if r["vehicle"]["vin"] not in seen_vins:
                    keyword_results.append(r)
                    seen_vins.add(r["vehicle"]["vin"])
            return keyword_results[:n_results]

        try:
            results = self._collection.query(
                query_texts=[query],
                n_results=n_results,
            )

            vins = results["ids"][0] if results["ids"] else []

            for i, vin in enumerate(vins):
                if vin in seen_vins:
                    continue
                vehicle = self.db.query(Vehicle).filter(Vehicle.vin == vin).first()
                if vehicle:
                    keyword_results.append({
                        "vehicle": vehicle.to_dict(),
                        "score": results["distances"][0][i] if results.get("distances") else 0,
                    })
                    seen_vins.add(vin)

            query_words = set(query.lower().split())
            keyword_results.sort(key=lambda r: _premium_boost(r["vehicle"], query_words))
            return keyword_results[:n_results]

        except Exception as e:
            logger.error(f"ChromaDB search failed: {e}")
            fallback = self._db_fallback_search(query, n_results)
            for r in fallback:
                if r["vehicle"]["vin"] not in seen_vins:
                    keyword_results.append(r)
                    seen_vins.add(r["vehicle"]["vin"])
            return keyword_results[:n_results]

    def _db_fallback_search(self, query: str, n_results: int) -> List[Dict[str, Any]]:
        from sqlalchemy import or_

        search_term = f"%{query}%"
        db_query = self.db.query(Vehicle).filter(
            or_(
                Vehicle.name.ilike(search_term),
                Vehicle.series.ilike(search_term),
                Vehicle.body_type.ilike(search_term),
                Vehicle.fuel_type.ilike(search_term),
                Vehicle.color.ilike(search_term),
            )
        )

        vehicles = db_query.limit(n_results).all()
        return [{"vehicle": v.to_dict(), "score": 0} for v in vehicles]

    def multi_query_search(self, queries: List[str], n_results: int = 5) -> List[Dict[str, Any]]:
        """Search with multiple queries and merge results via round-robin dedup."""
        per_query = [self.search(query, n_results=n_results) for query in queries]

        seen_vins: set = set()
        merged: list = []
        max_len = max((len(r) for r in per_query), default=0)

        for i in range(max_len):
            for results in per_query:
                if i < len(results):
                    vin = results[i]["vehicle"]["vin"]
                    if vin not in seen_vins:
                        merged.append(results[i])
                        seen_vins.add(vin)
                        if len(merged) >= n_results:
                            return merged

        return merged[:n_results]

    def build_context(self, results: List[Dict[str, Any]]) -> str:
        """Format search results into a context string for the LLM."""
        if not results:
            return "No relevant vehicles found in inventory."

        context_parts = []
        for i, result in enumerate(results, 1):
            v = result["vehicle"]
            parts = [
                f"Vehicle {i} [VIN={v['vin']}]: {v['name']}",
                f"  Series: {v.get('series', 'N/A')}",
                f"  Body type: {v.get('body_type', 'N/A')}",
                f"  Fuel type: {v.get('fuel_type', 'N/A')}",
                f"  Drive: {v.get('drive_type', 'N/A')}",
                f"  Color: {v.get('color', 'N/A')}",
            ]

            if v.get("price"):
                parts.append(f"  Price: {v['price']}")

            if v.get("dealer_name"):
                parts.append(f"  Dealer: {v['dealer_name']}")

            if v.get("power_kw"):
                parts.append(f"  Power: {v['power_kw']} kW / {v.get('power_hp', 'N/A')} HP")

            if v.get("url"):
                parts.append(f"  Details: {v['url']}")

            context_parts.append("\n".join(parts))

        return "\n\n".join(context_parts)

    def get_stats(self) -> Dict[str, Any]:
        self._init_chroma()
        return {
            "indexed_vehicles": self._collection.count(),
            "embedding_model": EMBEDDING_MODEL,
        }
