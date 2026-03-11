"""Scrape BMW CH stock locator API and export to vehicles.json.

Source: BMW stolo-data-service (same API the stock locator frontend uses)
Target: data/vehicles.json (same format as export_vehicles.py output)
"""

import json
import requests
import sys
import time

API_URL = "https://stolo-data-service.prod.stolo.eu-central-1.aws.bmw.cloud/vehiclesearch/search/de-ch/stocklocator"
PAGE_SIZE = 12  # API caps at 12
OUTPUT = "data/vehicles.json"


BATCH_SIZE = 15  # requests before cooldown
COOLDOWN = 65    # seconds to wait after a batch


def fetch_page(start_index, retries=3):
    """Fetch a single page with retry on rate limit."""
    for attempt in range(retries):
        resp = requests.post(
            f"{API_URL}?maxResults={PAGE_SIZE}&startIndex={start_index}",
            json={},
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            },
            timeout=30,
        )
        if resp.status_code == 403:
            wait = COOLDOWN
            print(f"    Rate limited at startIndex={start_index}, cooling down {wait}s...")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    raise Exception(f"Failed after {retries} retries at startIndex={start_index}")


def fetch_all_vehicles():
    """Fetch all vehicles with batched pagination to respect rate limits."""
    vehicles = []
    start_index = 0
    request_count = 0
    seen_vins = set()

    while True:
        data = fetch_page(start_index)
        request_count += 1

        total = data.get("metadata", {}).get("totalCount", 0)
        hits = data.get("hits", [])

        new_in_page = 0
        for hit in hits:
            v = hit.get("vehicle", {})
            vehicle = transform_vehicle(v)
            if vehicle and vehicle["vin"] not in seen_vins:
                seen_vins.add(vehicle["vin"])
                vehicles.append(vehicle)
                new_in_page += 1

        print(f"  [{request_count}] startIndex={start_index} +{new_in_page} new = {len(vehicles)}/{total}")

        start_index += len(hits)
        if start_index >= total or len(hits) == 0:
            break

        # Batch cooldown to avoid rate limiting
        if request_count % BATCH_SIZE == 0:
            remaining = total - start_index
            batches_left = (remaining // (PAGE_SIZE * BATCH_SIZE)) + 1
            print(f"  --- Cooldown {COOLDOWN}s ({remaining} vehicles remaining, ~{batches_left} batches left) ---")
            time.sleep(COOLDOWN)
        else:
            time.sleep(0.3)

    return vehicles


def transform_vehicle(v):
    """Transform BMW stolo API vehicle to our schema."""
    ordering = v.get("ordering", {})
    prod = ordering.get("productionData", {})
    dist = ordering.get("distributionData", {})
    order = ordering.get("orderData", {})
    media = v.get("media", {})
    cosy = media.get("cosyImages", {})
    offering = v.get("offering", {})
    price_data = v.get("price", {})
    spec = v.get("vehicleSpecification", {}).get("modelAndOption", {})
    model = spec.get("model", {})

    # VIN
    vin = prod.get("vin17", "")
    if not vin:
        return None

    # Name from model
    brand = spec.get("brand", "BMW")
    model_name = model.get("modelName", "")
    model_range_info = spec.get("modelRange", {})
    model_range_desc = model_range_info.get("description", {}).get("de_CH", "")
    name = f"{brand} {model_name}".strip() if model_name else (model_range_desc or brand)

    # Series / model range
    series_info = spec.get("series", {})
    series = series_info.get("name", spec.get("configuratorSeries", ""))
    model_range = spec.get("marketingModelRange", model_range_info.get("name", ""))

    # Specs
    fuel_type = spec.get("baseFuelType", "")
    drive_type = spec.get("driveType", "")
    marketing_drive = spec.get("marketingDriveType", "")
    transmission = spec.get("transmission", "")
    body_type = spec.get("bodyType", "")

    # Colors
    color_info = spec.get("color", {})
    color = color_info.get("clusterFine", color_info.get("clusterRough", ""))
    uph_info = spec.get("upholsteryColor", {})
    upholstery_color = uph_info.get("upholsteryColorCluster", "")

    # Price from price object
    gross_price = price_data.get("grossSalesPrice") or price_data.get("grossListPrice")
    list_price = price_data.get("grossListPrice")
    currency = price_data.get("listPriceCurrency", "CHF")
    price_str = f"{currency} {gross_price:,.2f}" if gross_price else ""

    # Offer price from offering
    offer_price = gross_price
    offer_prices = offering.get("offerPrices", {})
    for _did, op in offer_prices.items():
        op_val = op.get("offerGrossPrice") or op.get("offerGrossVehiclePrice")
        if op_val:
            offer_price = op_val
            price_str = f"{currency} {op_val:,.2f}"
            break

    # Monthly installment from sfOffers
    monthly = None
    sf_offers = offering.get("sfOffers", [])
    for offer in sf_offers:
        for calc in offer.get("calculations", []):
            params = calc.get("financialProductParameters", {})
            installment = params.get("totalInstallment", {})
            if installment.get("amount"):
                monthly = installment["amount"]
                break
        if monthly:
            break

    # Dealer info
    dealer_name = dist.get("destinationLocationDomesticDealerName", dist.get("shippingDealerName", ""))
    dealer_id = dist.get("destinationLocationDomesticDealerBuno", dist.get("shippingDealerBuno", ""))
    dealer_loc = dist.get("dealerLocation", {})
    dealer_lat = dealer_loc.get("latitude")
    dealer_lon = dealer_loc.get("longitude")

    # Images - pick key angles (limit to ~20 to avoid bloat)
    image_keys_priority = [
        "exteriorImage-null",
        "exterior360ViewImage-30",
        "exterior360ViewImage-0",
        "exterior360ViewImage-330",
        "exterior360ViewImage-10",
        "exterior360ViewImage-50",
        "exterior360ViewImage-80",
        "exterior360ViewImage-130",
        "exterior360ViewImage-170",
        "exterior360ViewImage-210",
        "exterior360ViewImage-250",
        "exterior360ViewImage-290",
        "exterior360ViewImage-310",
        "interiorImage-null",
    ]
    main_image = ""
    images = []
    for key in image_keys_priority:
        url = cosy.get(key, "")
        if url:
            if not main_image:
                main_image = url
            images.append(url)

    if not images:
        for key, url in cosy.items():
            if url:
                if not main_image:
                    main_image = url
                images.append(url)
                if len(images) >= 20:
                    break

    # Sales status
    sales_status = order.get("usageState", order.get("usageStateOnline", ""))
    stock_type = order.get("stockType", "")

    # URL
    vss_id = v.get("vssId", "")
    url = f"https://www.bmw.ch/de-CH/sl/stocklocator/details/{vss_id}" if vss_id else ""

    return {
        "vin": vin,
        "name": name,
        "brand": brand,
        "series": series,
        "model_range": model_range,
        "body_type": body_type,
        "fuel_type": fuel_type,
        "drive_type": drive_type if drive_type != "FRONT" else marketing_drive or drive_type,
        "transmission": transmission,
        "color": color,
        "upholstery_color": upholstery_color,
        "price": price_str,
        "price_offer": offer_price,
        "price_list": list_price,
        "currency": currency,
        "image": main_image,
        "images": images,
        "dealer_name": dealer_name,
        "dealer_id": dealer_id,
        "dealer_latitude": dealer_lat,
        "dealer_longitude": dealer_lon,
        "power_kw": None,  # not available in stolo search API
        "power_hp": None,
        "door_count": None,
        "country": v.get("country", "CH"),
        "sales_status": sales_status,
        "monthly_installment": monthly,
        "url": url,
    }


def main():
    print("Fetching BMW CH stock from stolo API...")
    vehicles = fetch_all_vehicles()

    print(f"\nTransformed {len(vehicles)} vehicles")

    # Stats
    series_count = {}
    with_price = 0
    with_images = 0
    for v in vehicles:
        s = v.get("series", "unknown") or "unknown"
        series_count[s] = series_count.get(s, 0) + 1
        if v.get("price_offer"):
            with_price += 1
        if v.get("images"):
            with_images += 1

    print(f"  With price: {with_price}")
    print(f"  With images: {with_images}")
    print(f"  By series: {dict(sorted(series_count.items(), key=lambda x: -x[1]))}")

    with open(OUTPUT, "w") as f:
        json.dump(vehicles, f, indent=2)

    # Write metadata
    from datetime import datetime, timezone
    meta = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "total_vehicles": len(vehicles),
        "source": "bmw.ch/stocklocator",
    }
    with open("data/inventory_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nExported to {OUTPUT}")


if __name__ == "__main__":
    main()
