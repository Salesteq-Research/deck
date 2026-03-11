#!/bin/bash
# Deploy BMW Chat to experiments server (89.167.77.26)
#
# Usage:
#   bash scripts/deploy.sh          # deploy frontend + backend + data
#   bash scripts/deploy.sh --full   # scrape fresh inventory first, then deploy
#
set -e

SSH="ssh -i /root/.ssh/id_bmw root@89.167.77.26"
SCP="scp -i /root/.ssh/id_bmw"
REMOTE="/root/bmw-chat"
cd /root/bmw-chat

echo "=== BMW Chat Deploy ==="

# Optional: scrape fresh inventory
if [[ "$1" == "--full" ]]; then
  echo ""
  echo "--- Scraping fresh inventory from bmw.ch (~15 min) ---"
  python3 scrape_stock.py
  echo ""
fi

# Build frontend
echo "--- Building frontend ---"
cd frontend && npm run build && cd ..

# Deploy frontend (atomic: clean old assets, copy new, fix permissions)
echo ""
echo "--- Deploying frontend ---"
$SSH "rm -rf $REMOTE/frontend/dist/assets && mkdir -p $REMOTE/frontend/dist/assets"
$SCP frontend/dist/index.html root@89.167.77.26:$REMOTE/frontend/dist/
$SCP frontend/dist/assets/* root@89.167.77.26:$REMOTE/frontend/dist/assets/
$SSH "chmod 755 $REMOTE/frontend/dist/assets"

# Deploy backend
echo ""
echo "--- Deploying backend ---"
$SCP -r backend/ root@89.167.77.26:$REMOTE/backend/

# Deploy data + scraper
echo ""
echo "--- Deploying data ---"
$SCP data/vehicles.json root@89.167.77.26:$REMOTE/data/vehicles.json
$SCP data/inventory_meta.json root@89.167.77.26:$REMOTE/data/inventory_meta.json
$SCP scrape_stock.py root@89.167.77.26:$REMOTE/scrape_stock.py

# Restart
echo ""
echo "--- Restarting backend ---"
$SSH "systemctl restart bmw-backend"
sleep 10

# Health check
if $SSH "curl -sf http://localhost:8080/health > /dev/null"; then
  echo "Backend healthy!"
else
  echo "WARNING: Health check failed"
  echo "  Check: ssh -i ~/.ssh/id_bmw root@89.167.77.26 journalctl -u bmw-backend -n 30"
  exit 1
fi

# Reload nginx
$SSH "nginx -s reload"

# Verify
echo ""
echo "--- Verification ---"
$SSH "cat $REMOTE/frontend/dist/index.html | grep -oP 'index-\w+\.(js|css)'"
$SSH "curl -sf http://localhost:8080/api/inventory/stats | python3 -c 'import json,sys; d=json.load(sys.stdin); print(f\"Vehicles: {d[\"total_vehicles\"]}, Last updated: {d[\"last_updated\"]}\")'"

echo ""
echo "=== Deploy complete ==="
echo "Site: https://bmw.salesteq.com"
