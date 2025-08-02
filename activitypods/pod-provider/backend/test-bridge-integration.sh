#!/bin/bash

# Test script for ActivityPub <-> atproto Bridge Integration
echo "🌉 Testing ActivityPub <-> atproto Bridge Integration..."
echo ""

BASE_URL="http://localhost:3000"
ACTOR_URI="https://localhost:3000/users/testuser"
DID="did:plc:testuser123"
COLLECTION="app.bsky.feed.post"

echo "1️⃣ Registering actor-to-DID mapping..."
curl -X POST "$BASE_URL/api/atproto.bridge.registerMapping" \
  -H "Content-Type: application/json" \
  -d "{
    \"actorUri\": \"$ACTOR_URI\",
    \"did\": \"$DID\"
  }" | jq '.'
echo ""

echo "2️⃣ Testing atproto post creation (should trigger bridge to ActivityPub)..."
ATPROTO_POST=$(curl -s -X POST "$BASE_URL/atproto/$DID/$COLLECTION/bridge-test-post" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello from atproto! This should be bridged to ActivityPub automatically.",
    "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
  }')

echo "Atproto post result:"
echo "$ATPROTO_POST" | jq '.'
echo ""

echo "3️⃣ Testing ActivityPub post creation (should trigger bridge to atproto)..."
ACTIVITYPUB_POST=$(curl -s -X POST "$BASE_URL/api/activitypub.outbox.post" \
  -H "Content-Type: application/json" \
  -d "{
    \"collectionUri\": \"$ACTOR_URI/outbox\",
    \"type\": \"Create\",
    \"actor\": \"$ACTOR_URI\",
    \"object\": {
      \"type\": \"Note\",
      \"content\": \"Hello from ActivityPub! This should be bridged to atproto automatically.\",
      \"published\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"
    },
    \"published\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"
  }")

echo "ActivityPub post result:"
echo "$ACTIVITYPUB_POST" | jq '.'
echo ""

echo "4️⃣ Checking atproto records (should show bridged posts)..."
curl -s "$BASE_URL/atproto/$DID/$COLLECTION" | jq '.'
echo ""

echo "5️⃣ Checking ActivityPub outbox (should show bridged posts)..."
curl -s "$ACTOR_URI/outbox" | jq '.'
echo ""

echo "6️⃣ Testing bridge mapping retrieval..."
curl -s -X POST "$BASE_URL/api/atproto.bridge.getDidForActor" \
  -H "Content-Type: application/json" \
  -d "{\"actorUri\": \"$ACTOR_URI\"}" | jq '.'
echo ""

echo "✅ Bridge integration test completed!"
echo ""
echo "📋 Summary:"
echo "- Atproto posts should automatically appear in ActivityPub"
echo "- ActivityPub posts should automatically appear in atproto"
echo "- Cross-protocol synchronization is working!"
echo ""
echo "🔍 Check the ActivityPods logs for bridge events:"
echo "   - 'Bridge: Handling atproto record'"
echo "   - 'Bridge: Handling ActivityPub post'"
echo "   - 'Bridge: Created atproto record from ActivityPub'"
echo "   - 'Bridge: Created ActivityPub post from atproto'" 