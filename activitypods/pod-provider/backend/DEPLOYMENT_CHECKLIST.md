# 🚀 Deployment Checklist

## Pre-Deployment

### ✅ Domain Setup
- [ ] Domain registered and active
- [ ] DNS records configured:
  - [ ] A record: `your-domain.com` → `YOUR_SERVER_IP`
  - [ ] A record: `*.your-domain.com` → `YOUR_SERVER_IP`
- [ ] DNS propagation verified (use `dig your-domain.com`)

### ✅ Server Setup
- [ ] VPS/cloud server provisioned
- [ ] Docker installed: `docker --version`
- [ ] Docker Compose installed: `docker-compose --version`
- [ ] Firewall configured:
  - [ ] Port 22 (SSH) open
  - [ ] Port 80 (HTTP) open
  - [ ] Port 443 (HTTPS) open
- [ ] Server has sufficient resources (2GB RAM, 1 CPU minimum)

### ✅ Code Preparation
- [ ] Repository cloned to server
- [ ] All dependencies installed
- [ ] Configuration files updated with your domain
- [ ] Environment variables set

## Deployment Steps

### ✅ Quick Deployment
```bash
# 1. Navigate to backend directory
cd activitypods/pod-provider/backend

# 2. Run deployment script
./deploy.sh your-domain.com your-email@example.com

# 3. Wait for deployment to complete
# 4. Check service status
docker-compose -f docker-compose-production.yml ps
```

### ✅ Manual Deployment
```bash
# 1. Update configuration files
sed -i 's/your-domain.com/YOUR_ACTUAL_DOMAIN/g' docker-compose-production.yml
sed -i 's/your-email@example.com/YOUR_EMAIL/g' docker-compose-production.yml

# 2. Create necessary directories
mkdir -p docker/ssl logs uploads

# 3. Generate secrets
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_PASSWORD=$(openssl rand -hex 16)

# 4. Start services
docker-compose -f docker-compose-production.yml up -d --build

# 5. Get SSL certificate
docker-compose -f docker-compose-production.yml run --rm certbot

# 6. Restart nginx
docker-compose -f docker-compose-production.yml restart nginx
```

## Post-Deployment Verification

### ✅ Basic Health Checks
```bash
# Test DNS resolution
nslookup your-domain.com

# Test SSL certificate
openssl s_client -connect your-domain.com:443 -servername your-domain.com

# Test ActivityPods
curl https://your-domain.com/.well-known/app-status

# Test atproto
curl https://your-domain.com/atproto/did:plc:testuser123/app.bsky.feed.post

# Test bridge
curl -X POST https://your-domain.com/bridge/registerMapping \
  -H "Content-Type: application/json" \
  -d '{"actorUri":"https://your-domain.com/users/testuser","did":"did:plc:testuser123"}'
```

### ✅ Comprehensive Testing
```bash
# Run remote deployment test
node test-remote-deployment.js your-domain.com
```

### ✅ Service Status
```bash
# Check all services are running
docker-compose -f docker-compose-production.yml ps

# Check logs for errors
docker-compose -f docker-compose-production.yml logs --tail=50

# Check resource usage
docker stats
```

## Security Verification

### ✅ SSL/TLS
- [ ] HTTPS redirect working
- [ ] SSL certificate valid and trusted
- [ ] HSTS headers present
- [ ] Modern cipher suites enabled

### ✅ Firewall
- [ ] Only necessary ports open (22, 80, 443)
- [ ] Rate limiting configured
- [ ] Security headers present

### ✅ Secrets
- [ ] JWT_SECRET is secure and unique
- [ ] Admin passwords are strong
- [ ] No secrets in logs or config files

## Performance Verification

### ✅ Response Times
- [ ] ActivityPods API responds < 2 seconds
- [ ] Atproto API responds < 1 second
- [ ] Bridge API responds < 1 second

### ✅ Resource Usage
- [ ] Memory usage < 80%
- [ ] CPU usage < 70%
- [ ] Disk space sufficient

## Federation Testing

### ✅ Atproto Federation
```bash
# Test repository status
curl https://your-domain.com/xrpc/com.atproto.sync.getRepoStatus?did=did:plc:testuser123

# Test CAR file export
curl https://your-domain.com/xrpc/com.atproto.sync.getRepo?did=did:plc:testuser123

# Test firehose WebSocket
wscat -c wss://your-domain.com/firehose
```

### ✅ Cross-Protocol Bridge
```bash
# Test ActivityPub to atproto conversion
curl -X POST https://your-domain.com/bridge/convertActivityPubToAtproto \
  -H "Content-Type: application/json" \
  -d '{"activity":{"type":"Create","actor":"https://your-domain.com/users/testuser","object":{"type":"Note","content":"Test post","published":"2025-08-01T12:00:00.000Z"}}}'

# Test atproto to ActivityPub conversion
curl -X POST https://your-domain.com/bridge/convertAtprotoToActivityPub \
  -H "Content-Type: application/json" \
  -d '{"record":{"text":"Test post","createdAt":"2025-08-01T12:00:00.000Z"},"did":"did:plc:testuser123","collection":"app.bsky.feed.post"}'
```

## Monitoring Setup

### ✅ Log Monitoring
- [ ] Log rotation configured
- [ ] Error monitoring enabled
- [ ] Performance metrics collected

### ✅ Health Checks
- [ ] Health check endpoint responding
- [ ] Service monitoring configured
- [ ] Alerting set up

### ✅ Backup Strategy
- [ ] Database backups configured
- [ ] Configuration backups set up
- [ ] Recovery procedures documented

## Documentation

### ✅ API Documentation
- [ ] ActivityPods API documented
- [ ] Atproto API documented
- [ ] Bridge API documented
- [ ] Federation endpoints documented

### ✅ User Documentation
- [ ] Setup guide created
- [ ] Troubleshooting guide available
- [ ] FAQ section populated

## Final Verification

### ✅ Complete System Test
```bash
# Run the complete system test
node test-complete-system.js
```

### ✅ External Testing
- [ ] Test from different networks
- [ ] Test with different clients
- [ ] Test federation with other servers

### ✅ Performance Testing
- [ ] Load testing completed
- [ ] Stress testing performed
- [ ] Performance baseline established

## Go Live Checklist

### ✅ Pre-Launch
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Monitoring active
- [ ] Backup strategy implemented
- [ ] Support procedures in place

### ✅ Launch
- [ ] DNS propagated
- [ ] SSL certificates valid
- [ ] All services running
- [ ] Performance acceptable
- [ ] Security verified

### ✅ Post-Launch
- [ ] Monitor logs for 24 hours
- [ ] Check performance metrics
- [ ] Verify federation working
- [ ] Test user workflows
- [ ] Document any issues

## Troubleshooting Quick Reference

### Common Issues
1. **DNS not resolving**: Check DNS records and propagation
2. **SSL certificate issues**: Verify domain ownership and DNS
3. **Service not starting**: Check logs and configuration
4. **Port conflicts**: Verify no other services using required ports
5. **Memory issues**: Increase server resources or optimize configuration

### Emergency Contacts
- [ ] Server provider support
- [ ] Domain registrar support
- [ ] SSL certificate provider support

### Rollback Plan
- [ ] Backup of working configuration
- [ ] Rollback procedures documented
- [ ] Data backup strategy in place 