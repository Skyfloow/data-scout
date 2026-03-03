FROM node:22-bookworm-slim

# Install wget/gnupg which might be needed for chromium apt keys
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install exact dependencies first
COPY package*.json ./
RUN npm ci

# Install Playwright browser and its system dependencies using the locked version
RUN npx playwright install --with-deps chromium

# Copy application source
COPY . .

# Build TypeScript to dist/
RUN npm run build

# Expose port (default 3000)
EXPOSE 3000

# Start server
CMD ["npm", "run", "start"]
