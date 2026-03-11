# Stage 1: Prune with Turbo
FROM node:22-alpine AS pruner
WORKDIR /app
COPY . .
RUN npx -y turbo prune scrapper-ui --docker

# Stage 2: Build the React application
FROM node:22-alpine AS builder
WORKDIR /app

# Accept build arguments
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

RUN npm ci

COPY --from=pruner /app/out/full/ .
RUN npm run build --workspace=scrapper-ui

# Stage 3: Serve the application using Nginx
FROM nginx:alpine

# Copy the build output to Nginx's HTML folder
COPY --from=builder /app/scrapper-ui/dist /usr/share/nginx/html

# Replace default Nginx configuration
COPY scrapper-ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
