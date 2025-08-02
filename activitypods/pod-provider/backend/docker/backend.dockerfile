FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies
RUN npm ci --only=production

# Copy the entire repository to handle local packages
COPY . .

# Create necessary directories
RUN mkdir -p uploads logs

# Copy the local atproto package to node_modules
RUN mkdir -p node_modules/@semapps && \
    cp -r semapps/src/middleware/packages/atproto node_modules/@semapps/atproto

# Install atproto package dependencies
RUN cd node_modules/@semapps/atproto && npm install --production

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/.well-known/app-status', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"] 