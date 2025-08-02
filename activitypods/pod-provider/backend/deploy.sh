#!/bin/bash

# ActivityPods + Atproto Bridge Deployment Script
# Usage: ./deploy.sh your-domain.com your-email@example.com

set -e

DOMAIN=${1:-"your-domain.com"}
EMAIL=${2:-"your-email@example.com"}

if [ "$DOMAIN" = "your-domain.com" ] || [ "$EMAIL" = "your-email@example.com" ]; then
    echo "Usage: ./deploy.sh your-domain.com your-email@example.com"
    echo "Example: ./deploy.sh activitypods.example.com admin@example.com"
    exit 1
fi

echo "🚀 Deploying ActivityPods + Atproto Bridge to $DOMAIN"
echo "📧 Email: $EMAIL"
echo ""

# Check if Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p docker/ssl logs uploads

# Generate secure secrets
echo "🔐 Generating secure secrets..."
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_PASSWORD=$(openssl rand -hex 16)

# Update configuration files
echo "⚙️  Updating configuration files..."

# Update docker-compose-production.yml
sed -i.bak "s/your-domain.com/$DOMAIN/g" docker-compose-production.yml
sed -i.bak "s/your-email@example.com/$EMAIL/g" docker-compose-production.yml
sed -i.bak "s/your-super-secure-jwt-secret/$JWT_SECRET/g" docker-compose-production.yml
sed -i.bak "s/your-secure-admin-password/$ADMIN_PASSWORD/g" docker-compose-production.yml

# Update nginx.conf
sed -i.bak "s/your-domain.com/$DOMAIN/g" docker/nginx.conf

# Create environment file
cat > .env << EOF
DOMAIN=$DOMAIN
EMAIL=$EMAIL
JWT_SECRET=$JWT_SECRET
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF

echo "✅ Configuration updated"

# Build and start services
echo "🐳 Building and starting services..."
docker-compose -f docker-compose-production.yml up -d --build

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Check if services are running
echo "🔍 Checking service status..."
docker-compose -f docker-compose-production.yml ps

# Get SSL certificate
echo "🔒 Getting SSL certificate..."
docker-compose -f docker-compose-production.yml run --rm certbot

# Restart nginx with SSL
echo "🔄 Restarting nginx with SSL..."
docker-compose -f docker-compose-production.yml restart nginx

# Test the deployment
echo "🧪 Testing deployment..."
sleep 10

# Test basic endpoints
echo "📊 Testing endpoints..."

# Test ActivityPods status
if curl -s -f "https://$DOMAIN/.well-known/app-status" > /dev/null; then
    echo "✅ ActivityPods API is working"
else
    echo "❌ ActivityPods API is not responding"
fi

# Test atproto endpoint
if curl -s -f "https://$DOMAIN/atproto" > /dev/null; then
    echo "✅ Atproto API is working"
else
    echo "❌ Atproto API is not responding"
fi

# Test bridge endpoint
if curl -s -f "https://$DOMAIN/bridge" > /dev/null; then
    echo "✅ Bridge API is working"
else
    echo "❌ Bridge API is not responding"
fi

echo ""
echo "🎉 Deployment completed!"
echo ""
echo "📋 Deployment Summary:"
echo "   Domain: https://$DOMAIN"
echo "   ActivityPods API: https://$DOMAIN"
echo "   Atproto API: https://$DOMAIN/atproto"
echo "   Bridge API: https://$DOMAIN/bridge"
echo "   Federation: https://$DOMAIN/xrpc"
echo "   Firehose: wss://$DOMAIN/firehose"
echo ""
echo "🔧 Management Commands:"
echo "   View logs: docker-compose -f docker-compose-production.yml logs -f"
echo "   Stop services: docker-compose -f docker-compose-production.yml down"
echo "   Restart services: docker-compose -f docker-compose-production.yml restart"
echo "   Update SSL: docker-compose -f docker-compose-production.yml run --rm certbot renew"
echo ""
echo "🧪 Test Commands:"
echo "   Test atproto: curl https://$DOMAIN/atproto/did:plc:testuser123/app.bsky.feed.post"
echo "   Test bridge: curl -X POST https://$DOMAIN/bridge/registerMapping -H 'Content-Type: application/json' -d '{\"actorUri\":\"https://$DOMAIN/users/testuser\",\"did\":\"did:plc:testuser123\"}'"
echo ""
echo "📚 Documentation:"
echo "   - ActivityPods: https://$DOMAIN/docs"
echo "   - Atproto Federation: https://$DOMAIN/xrpc/com.atproto.server.describeServer" 