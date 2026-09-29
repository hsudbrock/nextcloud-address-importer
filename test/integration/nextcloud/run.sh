#!/usr/bin/env bash
# Single-command Dockerized Nextcloud integration fixture (issues 06 + 10).
# Usage: npm run test:integration:nextcloud
#
# - Starts a real Nextcloud from a clean isolated Docker state.
# - Waits until install + CardDAV discovery are ready.
# - Runs the integration suite (listing, happy-path import, duplicate rerun).
# - Destroys volumes afterwards, even on failure (trap).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="$ROOT/test/integration/nextcloud/docker-compose.yml"
PROJECT="nextcloud-address-importer-test"
SERVER_URL="${NEXTCLOUD_TEST_SERVER_URL:-http://127.0.0.1:8087}"
USERNAME="${NEXTCLOUD_TEST_USERNAME:-nc-test-admin}"
APP_PASSWORD="${NEXTCLOUD_TEST_APP_PASSWORD:-nc-test-local-password}"

cleanup() {
  docker compose -f "$COMPOSE_FILE" -p "$PROJECT" down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[integration] starting clean Nextcloud fixture (project: $PROJECT)..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT" down -v >/dev/null 2>&1 || true
docker compose -f "$COMPOSE_FILE" -p "$PROJECT" up -d

echo "[integration] waiting for Nextcloud install at $SERVER_URL/status.php ..."
READY="" && for _ in $(seq 1 60); do
  BODY="$(curl -fsS --max-time 5 "$SERVER_URL/status.php" 2>/dev/null || true)"
  if printf '%s' "$BODY" | grep -q '"installed":true'; then READY="yes"; break; fi
  sleep 5
done
if [ "$READY" != "yes" ]; then
  echo "[integration] ERROR: Nextcloud did not finish installing within 300s." >&2
  docker compose -f "$COMPOSE_FILE" -p "$PROJECT" logs --tail=30 2>/dev/null || true
  exit 1
fi

echo "[integration] waiting for CardDAV discovery ..."
DAV_READY="" && for _ in $(seq 1 24); do
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -u "$USERNAME:$APP_PASSWORD" \
    -X PROPFIND -H 'Depth: 0' -H 'Content-Type: application/xml; charset=utf-8' \
    --data-binary '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal /></d:prop></d:propfind>' \
    "$SERVER_URL/remote.php/dav/" 2>/dev/null || true)"
  if [ "$CODE" = "207" ]; then DAV_READY="yes"; break; fi
  sleep 5
done
if [ "$DAV_READY" != "yes" ]; then
  echo "[integration] ERROR: CardDAV discovery did not return 207 within 120s." >&2
  exit 1
fi

echo "[integration] running integration suite ..."
cd "$ROOT"
npx vitest run --config vitest.integration.config.ts
