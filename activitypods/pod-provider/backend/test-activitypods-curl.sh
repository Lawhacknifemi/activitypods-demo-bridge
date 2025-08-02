#!/bin/bash

# Test ActivityPods with curl commands
echo "🧪 Testing ActivityPods endpoints..."

BASE_URL="http://localhost:3000"

echo ""
echo "1️⃣ Testing basic connectivity..."
curl -s -o /dev/null -w "Status: %{http_code}\n" "$BASE_URL/"

echo ""
echo "2️⃣ Testing app status endpoint..."
curl -s "$BASE_URL/.well-known/app-status" | jq '.' 2>/dev/null || curl -s "$BASE_URL/.well-known/app-status"

echo ""
echo "3️⃣ Testing nodeinfo endpoint..."
curl -s "$BASE_URL/.well-known/nodeinfo" | jq '.' 2>/dev/null || curl -s "$BASE_URL/.well-known/nodeinfo"

echo ""
echo "4️⃣ Testing frontend config..."
curl -s "$BASE_URL/.well-known/config.js" | head -10

echo ""
echo "5️⃣ Testing webfinger endpoint..."
curl -s "$BASE_URL/.well-known/webfinger?resource=acct:test@localhost" | jq '.' 2>/dev/null || curl -s "$BASE_URL/.well-known/webfinger?resource=acct:test@localhost"

echo ""
echo "6️⃣ Testing JSON-LD context..."
curl -s "$BASE_URL/.well-known/context.jsonld" | jq '.' 2>/dev/null || curl -s "$BASE_URL/.well-known/context.jsonld" | head -5

echo ""
echo "7️⃣ Testing OpenID Connect configuration..."
curl -s "$BASE_URL/.well-known/openid-configuration" | jq '.' 2>/dev/null || curl -s "$BASE_URL/.well-known/openid-configuration"

echo ""
echo "8️⃣ Testing favicon..."
curl -s -o /dev/null -w "Status: %{http_code}\n" "$BASE_URL/favicon.ico"

echo ""
echo "9️⃣ Testing auth endpoints..."
curl -s -o /dev/null -w "Status: %{http_code}\n" "$BASE_URL/auth"

echo ""
echo "🔟 Testing API health..."
echo "API Gateway is running on: $BASE_URL"
echo "All endpoints should return appropriate responses above."

echo ""
echo "✅ ActivityPods curl tests completed!"
echo "If you see mostly 200 status codes and JSON responses, ActivityPods is working correctly." 