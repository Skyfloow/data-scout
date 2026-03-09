# 🚀 Scrap Data MVP (Data Scout)

A compact full-stack platform for **market scraping**, **continuous monitoring**, and **keyword ranking history**.
Now utilizing a modern **NPM Workspaces** and **Turborepo** monorepo architecture.

## ✨ What You Get

- 🖥️ **Frontend (`scrapper-ui`)**: React + Vite dashboard with monitoring workflows
- ⚙️ **Backend (`server`)**: Fastify API for scraping jobs (Crawlee/Playwright + Firecrawl), history storage, and scheduler logic
- 🐳 **Dockerized**: Easy setup and deployment via Docker Compose
- 📚 **API Docs**: Built-in Swagger UI

## 🧱 Monorepo Structure

```text
data-scout/
├── scrapper-ui/       # Frontend app (Vite + React)
├── server/            # Backend API (Fastify + Crawlee)
├── docker-compose.yml # Main Docker orchestration
├── .env               # Unified configuration
└── turbo.json         # Workspace execution pipeline
```

## 🐳 Quick Start (Docker - Recommended)

The easiest way to run the application is using Docker Compose. This ensures all dependencies (including headless browsers for scraping) are correctly configured.

1.  **Start the application:**

    ```bash
    docker compose up -d --build
    ```

2.  **Access the interfaces:**
    - **Frontend UI:** [http://localhost:8080](http://localhost:8080)
    - **Backend API:** [http://localhost:3001/api](http://localhost:3001/api) (Mapped inside from 3000)
    - **Swagger Docs:** [http://localhost:3001/docs](http://localhost:3001/docs)

3.  **Logs & Management:**

    ```bash
    # View all logs
    docker compose logs -f

    # Stop the application
    docker compose down
    ```

_(Note: The server `.env` variables and data files persist in the `./server/data` and `./server/storage` folders)._

---

## ⚡ Local Development (Without Docker)

You can run both services natively for development, orchestrated from the root:

1. **Install dependencies at the root**

   ```bash
   npm install
   ```

2. **Configure backend environment**

   ```bash
   cp .env.example .env
   # Ensure PORT=3000 in your .env
   ```

3. **Start complete development environment**
   ```bash
   # Starts both Vite (scrapper-ui) and Fastify (server) simultaneously in watch mode
   npm run dev
   ```

## 🛠️ Build & Test

You can build and test both applications across the monorepo from the root directory using Turborepo parallelism and caching.

**Build everything:**

```bash
npm run build
```

**Run all tests:**

```bash
npm run test
```
