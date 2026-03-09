# Stage 1: Build the React application
FROM node:22-alpine AS builder

WORKDIR /app

# Accept build arguments
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Copy root configurations and workspaces package files
COPY package.json package-lock.json turbo.json ./
COPY server/package.json ./server/
COPY scrapper-ui/package.json ./scrapper-ui/

RUN npm ci

COPY . .
RUN npm run build --workspace=scrapper-ui

# Stage 2: Serve the application using Nginx
FROM nginx:alpine

# Copy the build output to Nginx's HTML folder
COPY --from=builder /app/scrapper-ui/dist /usr/share/nginx/html

# Replace default Nginx configuration
COPY scrapper-ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
