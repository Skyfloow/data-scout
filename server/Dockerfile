FROM node:22-bookworm-slim

# Install wget/gnupg which might be needed for chromium apt keys
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root configurations and workspaces package files
COPY package.json package-lock.json turbo.json ./
COPY server/package.json ./server/
COPY scrapper-ui/package.json ./scrapper-ui/

# Install exact dependencies
RUN npm ci

# Install Playwright browser
RUN cd server && npx playwright install --with-deps chromium

# Copy application source
COPY . .

# Build TypeScript to dist/
RUN npm run build --workspace=server

WORKDIR /app/server

# Expose port (default 3000)
EXPOSE 3000

# Start server
CMD ["npm", "run", "start"]
