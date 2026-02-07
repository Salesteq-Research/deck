"""Export BMW vehicles from ingestion service API to vehicles.json."""

import json
import requests

API_BASE = "http://localhost:8001/api/entities"
TENANT = "bmw-ch-stock"
PAGE_SIZE = 500
OUTPUT = "data/vehicles.json"


def export():
    vehicles = []
    page = 1

    while True:
        resp = requests.get(
            API_BASE,
            headers={"X-Tenant-ID": TENANT},
            params={"page_size": PAGE_SIZE, "page": page},
        )
        resp.raise_for_status()
        data = resp.json()

        for item in data["items"]:
            entity_data = item["data"]
            # Parse images from JSON string if needed
            images = entity_data.get("images", "[]")
            if isinstance(images, str):
                try:
                    images = json.loads(images)
                except (json.JSONDecodeError, TypeError):
                    images = []

            vehicle = {
                "vin": entity_data.get("vin", ""),
                "name": entity_data.get("name", ""),
                "brand": entity_data.get("brand", "BMW"),
                "series": entity_data.get("series", ""),
                "model_range": entity_data.get("model_range", ""),
                "body_type": entity_data.get("body_type", ""),
                "fuel_type": entity_data.get("fuel_type", ""),
                "drive_type": entity_data.get("drive_type", ""),
                "transmission": entity_data.get("transmission", ""),
                "color": entity_data.get("color", ""),
                "upholstery_color": entity_data.get("upholstery_color", ""),
                "price": entity_data.get("price", ""),
                "price_offer": entity_data.get("price_offer"),
                "price_list": entity_data.get("price_list"),
                "currency": entity_data.get("currency", "CHF"),
                "image": entity_data.get("image", ""),
                "images": images,
                "dealer_name": entity_data.get("dealer_name", ""),
                "dealer_id": entity_data.get("dealer_id", ""),
                "dealer_latitude": entity_data.get("dealer_latitude"),
                "dealer_longitude": entity_data.get("dealer_longitude"),
                "power_kw": entity_data.get("power_kw"),
                "power_hp": entity_data.get("power_hp"),
                "door_count": entity_data.get("door_count"),
                "country": entity_data.get("country", "CH"),
                "sales_status": entity_data.get("sales_status", ""),
                "url": entity_data.get("url", ""),
            }
            vehicles.append(vehicle)

        print(f"Page {page}: fetched {len(data['items'])} entities (total so far: {len(vehicles)})")

        if len(data["items"]) < PAGE_SIZE:
            break
        page += 1

    with open(OUTPUT, "w") as f:
        json.dump(vehicles, f, indent=2)

    print(f"\nExported {len(vehicles)} vehicles to {OUTPUT}")


if __name__ == "__main__":
    export()
