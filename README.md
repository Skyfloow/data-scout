# 🚀 Scrap Data MVP

A compact full-stack platform for **market scraping**, **continuous monitoring**, and **keyword ranking history**.

## ✨ What You Get

- 🖥️ **Frontend (`scrapper-ui`)**: React + Vite dashboard with monitoring workflows
- ⚙️ **Backend (`server`)**: Fastify API for scraping jobs, history storage, and scheduler logic
- 📚 **API Docs**: Built-in Swagger UI

## 🧱 Monorepo Structure

```text
Scrap_data_MVP/
├── scrapper-ui/   # Frontend app
├── server/        # Backend API
└── README.md
```

## ⚡ Quick Start

1. Install dependencies

```bash
cd scrapper-ui && npm install
cd ../server && npm install
```

2. Configure backend environment

```bash
cd ../server
cp .env.example .env
```

3. Set backend port to match frontend API base URL

```env
PORT=3001
```

4. Start backend

```bash
npm run dev
```

5. Start frontend (new terminal)

```bash
cd ../scrapper-ui
npm start
```

## 🌐 Local URLs

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API: [http://localhost:3001/api](http://localhost:3001/api)
- Swagger UI: [http://localhost:3001/docs](http://localhost:3001/docs)
- Healthcheck: [http://localhost:3001/health](http://localhost:3001/health)

## 📘 Swagger Documentation

After the backend is running, open:

- [http://localhost:3001/docs](http://localhost:3001/docs)

If your backend uses a different port, replace `3001` with that port.

## 🛠️ Build & Test

Frontend:

```bash
cd scrapper-ui
npm run build
npm test -- --watchAll=false --watchman=false
```

Backend:

```bash
cd server
npm run build
npm test
```

## 📝 Notes

- The frontend currently calls `http://localhost:3001/api/` from `scrapper-ui/src/store/apiSlice.ts`.
- If backend runs on another port, update that constant or align your `.env` port.
