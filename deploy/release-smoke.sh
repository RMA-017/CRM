#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://aaron.uz}"
API_DIR="${2:-/var/www/aaron-crm/api}"

echo "[release-smoke] api dir: ${API_DIR}"
echo "[release-smoke] base url: ${BASE_URL}"

echo "[1/6] production preflight"
(
  cd "${API_DIR}"
  pnpm run deploy:preflight
)

echo "[2/6] migration status"
(
  cd "${API_DIR}"
  pnpm run migrate:status:prod
)

echo "[3/6] pm2 status"
pm2 status crm-api

echo "[4/6] nginx syntax"
sudo nginx -t

echo "[5/6] health"
curl -fsS "${BASE_URL}/health"
echo

echo "[6/6] ready"
curl -fsS "${BASE_URL}/ready"
echo

echo "[release-smoke] ok"
