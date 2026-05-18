FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy dependency manifests and install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source and any other needed files
COPY src/ ./src/

# Expose application port
EXPOSE 5000

CMD ["node", "src/server.js"]
