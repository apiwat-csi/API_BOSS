#!/bin/sh
set -e

echo "======================================="
echo "Starting Cloudflare WARP..."
echo "======================================="

# Start warp service
warp-svc > /tmp/warp.log 2>&1 &

sleep 5

# Register device
warp-cli --accept-tos registration new || true

# Set mode
warp-cli --accept-tos mode warp || true

# Connect
warp-cli --accept-tos connect || true

sleep 5

echo "======================================="
echo "WARP STATUS"
echo "======================================="

warp-cli --accept-tos status || true

echo ""
echo "======================================="
echo "PUBLIC IP"
echo "======================================="

curl -s https://ifconfig.me || true

echo ""
echo "======================================="
echo "START APP"
echo "======================================="

exec "$@"