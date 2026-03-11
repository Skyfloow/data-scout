FROM node:22-bookworm-slim AS pruner
WORKDIR /app
COPY . .
RUN npx -y turbo prune server --docker

FROM node:22-bookworm-slim AS builder
# Install wget/gnupg which might be needed for chromium apt keys
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

# Install exact dependencies
RUN npm ci

# Copy application source
COPY --from=pruner /app/out/full/ .

# Install Playwright browser
RUN cd server && npx playwright install --with-deps chromium

# Build TypeScript to dist/
RUN npm run build --workspace=server

WORKDIR /app/server

# Expose port (default 3000)
EXPOSE 3000

# Start server
CMD ["npm", "run", "start"]
