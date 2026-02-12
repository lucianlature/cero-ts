#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# run-demo.sh — Start the Microservices Saga stack, run a full workflow, and
#               open the dashboard so you can inspect the result.
#
# Usage:
#   cd examples/microservices-saga
#   ./run-demo.sh              # default: 1 happy-path order
#   ./run-demo.sh --orders 5   # create 5 diverse orders
#   ./run-demo.sh --mix        # 5 orders: 3 happy + 1 declined card + 1 out-of-stock
#   ./run-demo.sh --clean      # tear down everything first
# ---------------------------------------------------------------------------
set -euo pipefail

# ── Colours & helpers ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

info()    { printf "${CYAN}▸${RESET} %s\n" "$*"; }
success() { printf "${GREEN}✔${RESET} %s\n" "$*"; }
warn()    { printf "${YELLOW}⚠${RESET} %s\n" "$*"; }
fail()    { printf "${RED}✖${RESET} %s\n" "$*"; exit 1; }
header()  { printf "\n${BOLD}═══ %s ═══${RESET}\n\n" "$*"; }

GATEWAY_URL="http://localhost:3000"
ORDER_COUNT=1
CLEAN=false
MIX=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mix)    MIX=true; shift ;;
    --orders) ORDER_COUNT="$2"; shift 2 ;;
    --clean)  CLEAN=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--orders N] [--clean] [-h|--help]"
      echo "  --orders N   Number of demo orders to create (default: 1)"
      echo "  --clean      Tear down containers and volumes before starting"
      exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

# ── Pre-flight checks ─────────────────────────────────────────────────────
command -v docker  >/dev/null 2>&1 || fail "docker is not installed"
command -v curl    >/dev/null 2>&1 || fail "curl is not installed"
command -v jq      >/dev/null 2>&1 || { JQ=false; warn "jq not found — JSON output will be raw"; } || true
JQ=${JQ:-true}

pretty() {
  if $JQ; then jq . 2>/dev/null || cat; else cat; fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Step 1: Clean (optional) ──────────────────────────────────────────────
if $CLEAN; then
  header "Cleaning up"
  info "Tearing down containers, volumes, and .data/ ..."
  docker compose down -v --remove-orphans 2>/dev/null || true
  rm -rf .data
  success "Clean slate"
fi

# ── Step 2: Build & start ─────────────────────────────────────────────────
header "Starting Docker stack"
info "Building images and starting containers ..."
docker compose up --build -d 2>&1 | while IFS= read -r line; do
  printf "  ${DIM}%s${RESET}\n" "$line"
done
success "Docker Compose started"

# ── Step 3: Wait for RabbitMQ ──────────────────────────────────────────────
header "Waiting for RabbitMQ"
RABBIT_MAX=60
RABBIT_ELAPSED=0
while ! docker compose exec -T rabbitmq rabbitmq-diagnostics -q ping >/dev/null 2>&1; do
  if (( RABBIT_ELAPSED >= RABBIT_MAX )); then
    fail "RabbitMQ did not become healthy within ${RABBIT_MAX}s"
  fi
  printf "  ${DIM}waiting… (%ds)${RESET}\r" "$RABBIT_ELAPSED"
  sleep 2
  RABBIT_ELAPSED=$((RABBIT_ELAPSED + 2))
done
success "RabbitMQ healthy (${RABBIT_ELAPSED}s)"

# ── Step 4: Wait for Gateway health endpoint ──────────────────────────────
header "Waiting for Gateway"
GW_MAX=90
GW_ELAPSED=0
while true; do
  HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "${GATEWAY_URL}/health" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" == "200" ]]; then
    break
  fi
  if (( GW_ELAPSED >= GW_MAX )); then
    fail "Gateway did not respond within ${GW_MAX}s (last HTTP: ${HTTP_CODE})"
  fi
  printf "  ${DIM}waiting… (%ds, HTTP %s)${RESET}\r" "$GW_ELAPSED" "$HTTP_CODE"
  sleep 2
  GW_ELAPSED=$((GW_ELAPSED + 2))
done
success "Gateway healthy (${GW_ELAPSED}s)"

# Verify all services are connected
info "Checking services …"
HEALTH=$(curl -s "${GATEWAY_URL}/health")
printf "  %s\n" "$(echo "$HEALTH" | pretty)"

# ── Step 5: Create demo orders ────────────────────────────────────────────

# When --mix is set, force 5 orders with a blend of success & failure scenarios
if [[ "$MIX" == "true" && "$ORDER_COUNT" -lt 5 ]]; then
  ORDER_COUNT=5
  info "Mix mode: creating ${ORDER_COUNT} orders (3 happy + 1 declined card + 1 out-of-stock)"
fi

header "Creating ${ORDER_COUNT} demo order(s)"

# Diverse order templates
CUSTOMERS=("cust-alice" "cust-bob" "cust-carol" "cust-dave" "cust-eve")
STREETS=("123 Main St" "456 Oak Ave" "789 Elm Blvd" "321 Pine Dr" "654 Cedar Ln")
CITIES=("Springfield" "Portland" "Austin" "Denver" "Seattle")
STATES=("IL" "OR" "TX" "CO" "WA")
ZIPS=("62704" "97201" "73301" "80202" "98101")

# Product IDs must match the inventory seed data (see inventory/src/db.ts)
PRODUCTS=(
  '{"productId":"PROD-001","quantity":2,"unitPrice":79.99}'
  '{"productId":"PROD-002","quantity":1,"unitPrice":49.99}'
  '{"productId":"PROD-003","quantity":3,"unitPrice":149.99}'
  '{"productId":"PROD-004","quantity":1,"unitPrice":399.99}'
  '{"productId":"PROD-005","quantity":5,"unitPrice":34.99}'
)

# ── Failure-injection templates (used in --mix mode) ────────────────────
# Declined card: payment service recognises pm_declined → saga compensates inventory
FAIL_PAYMENT_ITEM='{"productId":"PROD-002","quantity":1,"unitPrice":49.99}'
FAIL_PAYMENT_TOTAL="49.99"
# Out-of-stock: quantity far exceeds seed stock (PROD-004 has 15 units)
FAIL_STOCK_ITEM='{"productId":"PROD-004","quantity":9999,"unitPrice":399.99}'
FAIL_STOCK_TOTAL="3999590.01"

declare -a ORDER_IDS=()

for i in $(seq 1 "$ORDER_COUNT"); do
  idx=$(( (i - 1) % 5 ))
  ITEMS="${PRODUCTS[$idx]}"
  PAYMENT_METHOD="pm_card_${CUSTOMERS[$idx]##*-}"
  ORDER_TAG=""

  # ── Mix-mode failure injection ──────────────────────────────────────
  if [[ "$MIX" == "true" ]]; then
    case "$i" in
      4)
        # Order 4: force payment decline (inventory will be reserved then compensated)
        ITEMS="$FAIL_PAYMENT_ITEM"
        PAYMENT_METHOD="pm_declined"
        ORDER_TAG=" ${YELLOW}[declined card]${RESET}"
        ;;
      5)
        # Order 5: force out-of-stock (fails at inventory check, no compensation)
        ITEMS="$FAIL_STOCK_ITEM"
        ORDER_TAG=" ${YELLOW}[out-of-stock]${RESET}"
        ;;
    esac
  fi

  # Parse unit price and quantity to compute total
  QTY=$(echo "$ITEMS" | python3 -c "import sys,json; print(json.load(sys.stdin)['quantity'])")
  PRICE=$(echo "$ITEMS" | python3 -c "import sys,json; print(json.load(sys.stdin)['unitPrice'])")
  TOTAL=$(python3 -c "print(round(${QTY} * ${PRICE}, 2))")

  EXPEDITED="false"
  if (( i % 3 == 0 )); then EXPEDITED="true"; fi

  PAYLOAD=$(cat <<EOF
{
  "customerId": "${CUSTOMERS[$idx]}",
  "items": [${ITEMS}],
  "totalAmount": ${TOTAL},
  "paymentMethod": "${PAYMENT_METHOD}",
  "shippingAddress": {
    "street": "${STREETS[$idx]}",
    "city": "${CITIES[$idx]}",
    "state": "${STATES[$idx]}",
    "postalCode": "${ZIPS[$idx]}",
    "country": "US"
  },
  "expedited": ${EXPEDITED},
  "notes": "Demo order #${i} created by run-demo.sh"
}
EOF
)

  printf "${CYAN}▸${RESET} Order ${i}/${ORDER_COUNT} — ${CUSTOMERS[$idx]} (${CITIES[$idx]}, ${STATES[$idx]})%b\n" "$ORDER_TAG"
  RESPONSE=$(curl -s -X POST "${GATEWAY_URL}/api/orders" \
    -H 'Content-Type: application/json' \
    -d "$PAYLOAD")

  ORDER_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('orderId',''))" 2>/dev/null || echo "")

  if [[ -n "$ORDER_ID" ]]; then
    ORDER_IDS+=("$ORDER_ID")
    success "Created ${ORDER_ID}"
  else
    warn "Order ${i} may have failed:"
    printf "  %s\n" "$(echo "$RESPONSE" | pretty)"
  fi

  # Small delay between orders to let the saga breathe
  if (( i < ORDER_COUNT )); then sleep 1; fi
done

# ── Step 6: Wait for sagas to complete ────────────────────────────────────
if [[ ${#ORDER_IDS[@]} -gt 0 ]]; then
  header "Waiting for sagas to complete"

  SAGA_TIMEOUT=60
  for OID in "${ORDER_IDS[@]}"; do
    ELAPSED=0
    PREV_STATUS=""
    printf "  ${BOLD}%s${RESET}\n" "$OID"
    while true; do
      STATUS_JSON=$(curl -s "${GATEWAY_URL}/api/orders/${OID}/status")
      COMPLETED=$(echo "$STATUS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('completed', False))" 2>/dev/null || echo "False")
      STATUS=$(echo "$STATUS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")

      # Print each status transition
      if [[ "$STATUS" != "$PREV_STATUS" && -n "$STATUS" ]]; then
        case "$STATUS" in
          validating)           printf "    ${DIM}├─${RESET} validating order …\n" ;;
          reserving_inventory)  printf "    ${DIM}├─${RESET} reserving inventory → ${CYAN}inventory service${RESET}\n" ;;
          inventory_reserved)   printf "    ${DIM}├─${RESET} ${GREEN}✓ inventory reserved${RESET}\n" ;;
          capturing_payment)    printf "    ${DIM}├─${RESET} capturing payment → ${CYAN}payment service${RESET}\n" ;;
          payment_captured)     printf "    ${DIM}├─${RESET} ${GREEN}✓ payment captured${RESET}\n" ;;
          creating_shipment)    printf "    ${DIM}├─${RESET} creating shipment → ${CYAN}shipping service${RESET}\n" ;;
          compensating)         printf "    ${DIM}├─${RESET} ${YELLOW}compensating …${RESET}\n" ;;
          completed)            printf "    ${DIM}└─${RESET} ${GREEN}✔ saga completed${RESET}\n" ;;
          failed)               printf "    ${DIM}└─${RESET} ${RED}✖ saga failed${RESET}\n" ;;
          *)                    printf "    ${DIM}├─${RESET} %s\n" "$STATUS" ;;
        esac
        PREV_STATUS="$STATUS"
      fi

      if [[ "$COMPLETED" == "True" ]]; then
        break
      fi

      if (( ELAPSED >= SAGA_TIMEOUT )); then
        printf "    ${DIM}└─${RESET} ${RED}✖ timed out after ${SAGA_TIMEOUT}s${RESET}\n"
        break
      fi

      sleep 1
      ELAPSED=$((ELAPSED + 1))
    done
    echo ""
  done
fi

# ── Step 7: Summary ──────────────────────────────────────────────────────
header "Summary"

if [[ ${#ORDER_IDS[@]} -gt 0 ]]; then
  info "Orders created: ${#ORDER_IDS[@]}"
  echo ""
  for OID in "${ORDER_IDS[@]}"; do
    STATUS_JSON=$(curl -s "${GATEWAY_URL}/api/orders/${OID}/status")
    STATUS=$(echo "$STATUS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")

    # Fetch durable step history and format step details
    STEPS_DETAIL=$(curl -s "${GATEWAY_URL}/api/orders/${OID}/steps" | python3 -c "
import sys, json
d = json.load(sys.stdin)
steps = d.get('steps', [])
names = []
for s in steps:
    name = s.get('step_name', '?')
    status = s.get('status', '')
    if name.startswith('compensate_'):
        names.append(f'\033[1;33m⟲ {name[11:]}\033[0m')
    elif status == 'completed':
        names.append(f'\033[0;32m✓ {name}\033[0m')
    elif status == 'compensated':
        names.append(f'\033[1;33m↩ {name}\033[0m')
    elif status == 'failed':
        names.append(f'\033[0;31m✖ {name}\033[0m')
    elif status == 'started':
        names.append(f'\033[0;36m◉ {name}\033[0m')
    else:
        names.append(name)
print('  '.join(names) if names else '(none)')
" 2>/dev/null || echo "?")

    if [[ "$STATUS" == "completed" ]]; then
      STATUS_FMT="${GREEN}${STATUS}${RESET}"
    elif [[ "$STATUS" == "failed" ]]; then
      STATUS_FMT="${RED}${STATUS}${RESET}"
    else
      STATUS_FMT="${YELLOW}${STATUS}${RESET}"
    fi

    printf "  ${BOLD}%s${RESET}\n" "$OID"
    printf "    status: %b    steps: %b\n\n" "$STATUS_FMT" "$STEPS_DETAIL"
  done
fi

echo ""
printf "  ${BOLD}Dashboard${RESET}    →  ${CYAN}${GATEWAY_URL}/dashboard${RESET}\n"
printf "  ${BOLD}API${RESET}          →  ${CYAN}${GATEWAY_URL}/api/orders${RESET}\n"
printf "  ${BOLD}RabbitMQ UI${RESET}  →  ${CYAN}http://localhost:15672${RESET}  (guest/guest)\n"
printf "  ${BOLD}SQLite DBs${RESET}   →  ${CYAN}.data/{gateway,payment,inventory,shipping}/*.db${RESET}\n"
echo ""

# ── Step 8: Open dashboard ────────────────────────────────────────────────
if command -v open >/dev/null 2>&1; then
  info "Opening dashboard in browser …"
  open "${GATEWAY_URL}/dashboard"
elif command -v xdg-open >/dev/null 2>&1; then
  info "Opening dashboard in browser …"
  xdg-open "${GATEWAY_URL}/dashboard"
else
  info "Open ${GATEWAY_URL}/dashboard in your browser"
fi

success "Done! 🎉"
