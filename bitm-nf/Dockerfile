FROM node:22-bookworm-slim

# Install Playwright's Chromium + system deps (no XVFB needed — headless mode)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Install Playwright Chromium browser and its system deps
RUN npx playwright install chromium --with-deps

# Build TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Copy runtime assets
COPY public/ ./public/
COPY tools/ ./tools/
COPY config.json ./
COPY targets.json ./
COPY payload.txt  ./
COPY favicons/    ./favicons/
COPY Caddyfile    ./Caddyfile

# Ensure user_data dir exists and is writable
RUN mkdir -p user_data && chmod 777 user_data

# No DISPLAY env var — Playwright runs headless natively
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "dist/server.js"]
