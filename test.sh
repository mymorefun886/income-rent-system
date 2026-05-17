#!/bin/bash
BASE="https://api.income.ccwu.cc"

echo "=== Health ==="
curl -s "$BASE/api/health"
echo ""

echo "=== Login ==="
LOGIN=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"username":"morefun886","password":"Mf848886#"}')
echo "$LOGIN" | head -c 80
echo ""
TOKEN=$(echo "$LOGIN" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "=== Dashboard ==="
curl -s "$BASE/api/dashboard" -H "Authorization: Bearer $TOKEN" | head -c 80
echo ""

echo "=== Properties ==="
curl -s "$BASE/api/properties" -H "Authorization: Bearer $TOKEN" | head -c 60
echo ""

echo "=== Records ==="
curl -s "$BASE/api/records" -H "Authorization: Bearer $TOKEN" | head -c 60
echo ""

echo "=== DONE ==="
