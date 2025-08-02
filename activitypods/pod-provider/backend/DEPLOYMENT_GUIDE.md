# 🚀 ActivityPods + Atproto Bridge Deployment Guide

This guide covers deploying your ActivityPods + atproto bridge system with a real domain and testing it.

## 📋 Prerequisites

- **Domain Name**: A registered domain (e.g., `activitypods.example.com`)
- **Server**: VPS or cloud server with Docker support
- **DNS Access**: Ability to configure DNS records
- **Email**: Valid email for SSL certificates

## 🎯 Deployment Options

### Option 1: Docker Compose (Recommended)

#### Quick Start
```bash
# Clone and setup
git clone <your-repo>
cd activitypods/pod-provider/backend

# Deploy with your domain
./deploy.sh your-domain.com your-email@example.com
```

#### Manual Setup
1. **Configure DNS**:
   ```
   A     your-domain.com     → YOUR_SERVER_IP
   A     *.your-domain.com   → YOUR_SERVER_IP
   ```

2. **Update Configuration**:
   ```bash
   # Edit docker-compose-production.yml
   sed -i 's/your-domain.com/YOUR_ACTUAL_DOMAIN/g' docker-compose-production.yml
   sed -i 's/your-email@example.com/YOUR_EMAIL/g' docker-compose-production.yml
   ```

3. **Deploy**:
   ```bash
   docker-compose -f docker-compose-production.yml up -d --build
   ```

### Option 2: Cloud Platforms

#### DigitalOcean App Platform
```yaml
# app.yaml
services:
- name: activitypods-backend
  source_dir: /activitypods/pod-provider/backend
  dockerfile_path: docker/backend.dockerfile
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  envs:
  - key: NODE_ENV
    value: production
  - key: BASE_URL
    value: https://your-domain.com
```

#### AWS ECS
```bash
# Build and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com
docker build -t activitypods-bridge .
docker tag activitypods-bridge:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/activitypods-bridge:latest
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/activitypods-bridge:latest
```

#### Google Cloud Run
```bash
# Deploy to Cloud Run
gcloud run deploy activitypods-bridge \
  --image gcr.io/YOUR_PROJECT/activitypods-bridge \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,BASE_URL=https://your-domain.com
```

### Option 3: Kubernetes

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: activitypods-bridge
spec:
  replicas: 3
  selector:
    matchLabels:
      app: activitypods-bridge
  template:
    metadata:
      labels:
        app: activitypods-bridge
    spec:
      containers:
      - name: activitypods-backend
        image: activitypods-bridge:latest
        ports:
        - containerPort: 3000
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        - name: BASE_URL
          value: "https://your-domain.com"
---
apiVersion: v1
kind: Service
metadata:
  name: activitypods-bridge-service
spec:
  selector:
    app: activitypods-bridge
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

## 🔧 Configuration

### Environment Variables
```bash
# Required
BASE_URL=https://your-domain.com
JWT_SECRET=your-super-secure-jwt-secret
NODE_ENV=production

# Optional
FIREHOSE_PORT=3001
APPVIEW_SERVER=bsky.social
ENABLE_FEDERATION=true
ENABLE_FIREHOSE=true
ENABLE_APPVIEW=true
```

### SSL/TLS Setup
```bash
# Automatic (Let's Encrypt)
docker-compose -f docker-compose-production.yml run --rm certbot

# Manual (Custom certificates)
# Place certificates in docker/ssl/
# Update nginx.conf with certificate paths
```

## 🧪 Testing Your Deployment

### 1. Basic Health Checks
```bash
# Test ActivityPods
curl https://your-domain.com/.well-known/app-status

# Test atproto
curl https://your-domain.com/atproto/did:plc:testuser123/app.bsky.feed.post

# Test bridge
curl -X POST https://your-domain.com/bridge/registerMapping \
  -H "Content-Type: application/json" \
  -d '{"actorUri":"https://your-domain.com/users/testuser","did":"did:plc:testuser123"}'
```

### 2. Federation Testing
```bash
# Test atproto federation
curl https://your-domain.com/xrpc/com.atproto.sync.getRepoStatus?did=did:plc:testuser123

# Test firehose WebSocket
wscat -c wss://your-domain.com/firehose
```

### 3. Cross-Protocol Testing
```bash
# Create atproto post
curl -X POST https://your-domain.com/atproto/did:plc:testuser123/app.bsky.feed.post/test-post \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from atproto!","createdAt":"2025-08-01T12:00:00.000Z"}'

# Verify bridge conversion
curl -X POST https://your-domain.com/bridge/convertAtprotoToActivityPub \
  -H "Content-Type: application/json" \
  -d '{"record":{"text":"Test post"},"did":"did:plc:testuser123","collection":"app.bsky.feed.post"}'
```

## 📊 Monitoring

### Logs
```bash
# View all logs
docker-compose -f docker-compose-production.yml logs -f

# View specific service logs
docker-compose -f docker-compose-production.yml logs -f activitypods-backend
docker-compose -f docker-compose-production.yml logs -f nginx
```

### Metrics
```bash
# Health check endpoint
curl https://your-domain.com/.well-known/app-status

# Service status
docker-compose -f docker-compose-production.yml ps
```

## 🔒 Security

### Firewall Configuration
```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### Rate Limiting
- API endpoints: 10 requests/second
- Atproto endpoints: 20 requests/second
- Configured in nginx.conf

### SSL/TLS
- Automatic Let's Encrypt certificates
- HSTS headers enabled
- Modern cipher suites

## 🚨 Troubleshooting

### Common Issues

1. **SSL Certificate Issues**
   ```bash
   # Renew certificates
   docker-compose -f docker-compose-production.yml run --rm certbot renew
   
   # Check certificate status
   openssl s_client -connect your-domain.com:443 -servername your-domain.com
   ```

2. **Service Not Starting**
   ```bash
   # Check logs
   docker-compose -f docker-compose-production.yml logs activitypods-backend
   
   # Check configuration
   docker-compose -f docker-compose-production.yml config
   ```

3. **DNS Issues**
   ```bash
   # Test DNS resolution
   nslookup your-domain.com
   dig your-domain.com
   
   # Check propagation
   https://www.whatsmydns.net/
   ```

4. **Port Conflicts**
   ```bash
   # Check what's using ports
   sudo netstat -tulpn | grep :3000
   sudo netstat -tulpn | grep :443
   ```

### Performance Optimization

1. **Database Optimization**
   ```bash
   # Fuseki configuration
   # Add to docker/fuseki-config.ttl
   :dataset a ja:RDFDataset ;
     ja:defaultGraph :g ;
     :g a tdb:GraphTDB ;
       tdb:location "databases/activitypods" ;
       tdb:unionDefaultGraph true .
   ```

2. **Caching**
   ```bash
   # Redis configuration
   # Already configured in docker-compose-production.yml
   ```

3. **Load Balancing**
   ```bash
   # For high traffic, use multiple instances
   # Configure with nginx upstream
   ```

## 📈 Scaling

### Horizontal Scaling
```bash
# Scale backend services
docker-compose -f docker-compose-production.yml up -d --scale activitypods-backend=3

# Use external load balancer
# Configure nginx upstream with multiple backend instances
```

### Database Scaling
```bash
# Use external Fuseki cluster
# Configure with external triplestore URL
```

## 🔄 Updates

### Application Updates
```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose-production.yml up -d --build

# Zero-downtime deployment
docker-compose -f docker-compose-production.yml up -d --no-deps --build activitypods-backend
```

### SSL Certificate Renewal
```bash
# Automatic renewal (cron job)
0 12 * * * docker-compose -f /path/to/docker-compose-production.yml run --rm certbot renew --quiet && docker-compose -f /path/to/docker-compose-production.yml restart nginx
```

## 📞 Support

- **Documentation**: https://your-domain.com/docs
- **API Reference**: https://your-domain.com/.well-known/app-status
- **Atproto Federation**: https://your-domain.com/xrpc/com.atproto.server.describeServer
- **Health Check**: https://your-domain.com/.well-known/app-status

## 🎯 Next Steps

1. **Test all endpoints** with the provided test scripts
2. **Configure monitoring** and alerting
3. **Set up backups** for Fuseki data
4. **Join the federation** by registering with other atproto servers
5. **Monitor logs** for any issues
6. **Scale as needed** based on usage patterns 