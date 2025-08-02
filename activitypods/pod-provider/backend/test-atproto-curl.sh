#!/bin/bash

# Test atproto endpoints with curl commands
echo "🧪 Testing atproto endpoints..."

BASE_URL="http://localhost:3000"
DID="did:plc:testuser123"
COLLECTION="app.bsky.feed.post"
RKEY="test-post-123"

echo ""
echo "1️⃣ Testing atproto service availability..."
curl -s -o /dev/null -w "Status: %{http_code}\n" "$BASE_URL/atproto"

echo ""
echo "2️⃣ Testing list records endpoint..."
curl -s "$BASE_URL/atproto/$DID/$COLLECTION" | jq '.' 2>/dev/null || curl -s "$BASE_URL/atproto/$DID/$COLLECTION"

echo ""
echo "3️⃣ Testing create record endpoint..."
POST_DATA='{
  "text": "Hello from ActivityPods atproto integration!",
  "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
}'

echo "Creating post with data: $POST_DATA"
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$POST_DATA" \
  "$BASE_URL/atproto/$DID/$COLLECTION/$RKEY" | jq '.' 2>/dev/null || curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$POST_DATA" \
  "$BASE_URL/atproto/$DID/$COLLECTION/$RKEY"

echo ""
echo "4️⃣ Testing get record endpoint..."
curl -s "$BASE_URL/atproto/$DID/$COLLECTION/$RKEY" | jq '.' 2>/dev/null || curl -s "$BASE_URL/atproto/$DID/$COLLECTION/$RKEY"

echo ""
echo "5️⃣ Testing update record endpoint..."
UPDATE_DATA='{
  "text": "Updated post from ActivityPods atproto integration!",
  "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
}'

echo "Updating post with data: $UPDATE_DATA"
curl -s -X PUT \
  -H "Content-Type: application/json" \
  -d "$UPDATE_DATA" \
  "$BASE_URL/atproto/$DID/$COLLECTION/$RKEY" | jq '.' 2>/dev/null || curl -s -X PUT \
  -H "Content-Type: application/json" \
  -d "$UPDATE_DATA" \
  "$BASE_URL/atproto/$DID/$COLLECTION/$RKEY"

echo ""
echo "6️⃣ Testing get record after update..."
curl -s "$BASE_URL/atproto/$DID/$COLLECTION/$RKEY" | jq '.' 2>/dev/null || curl -s "$BASE_URL/atproto/$DID/$COLLECTION/$RKEY"

echo ""
echo "7️⃣ Testing list records after creation..."
curl -s "$BASE_URL/atproto/$DID/$COLLECTION" | jq '.' 2>/dev/null || curl -s "$BASE_URL/atproto/$DID/$COLLECTION"

echo ""
echo "8️⃣ Testing delete record endpoint..."
curl -s -X DELETE "$BASE_URL/atproto/$DID/$COLLECTION/$RKEY" | jq '.' 2>/dev/null || curl -s -X DELETE "$BASE_URL/atproto/$DID/$COLLECTION/$RKEY"

echo ""
echo "9️⃣ Testing get record after deletion..."
curl -s "$BASE_URL/atproto/$DID/$COLLECTION/$RKEY" | jq '.' 2>/dev/null || curl -s "$BASE_URL/atproto/$DID/$COLLECTION/$RKEY"

echo ""
echo "🔟 Testing list records after deletion..."
curl -s "$BASE_URL/atproto/$DID/$COLLECTION" | jq '.' 2>/dev/null || curl -s "$BASE_URL/atproto/$DID/$COLLECTION"

echo ""
echo "✅ Atproto curl tests completed!"
echo "If you see JSON responses with CIDs and proper atproto data structures, the integration is working!" 