# ⚙️ server

Fastify backend for scraping workflows, monitored entities, history tracking, and settings management.

## 🎯 Highlights

- 🧠 Job-based scraping pipeline
- 📈 Price and keyword ranking history endpoints
- 🗂️ File-based storage layer with migration support
- 📚 Built-in Swagger documentation

## 🧩 Tech Stack

- Fastify
- TypeScript
- tsx (dev runner)
- tsup (build)
- vitest (tests)

## ▶️ Setup

1. Install dependencies

```bash
npm install
```

2. Create environment file

```bash
cp .env.example .env
```

3. Recommended `.env` values

```env
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
DATA_DIR=./data
FIRECRAWL_API_KEY=your_api_key_here
ETSY_FORCE_FIRECRAWL=false
```

## ▶️ Run in Development

```bash
npm run dev
```

## 📦 Build & Start

```bash
npm run build
npm start
```

## 🧪 Tests

```bash
npm test
```

## 📘 Swagger API Docs

When the server is running, open:

- [http://localhost:3001/docs](http://localhost:3001/docs)

If you run on another port, use `http://localhost:<PORT>/docs`.

## ❤️ Health Endpoint

- [http://localhost:3001/health](http://localhost:3001/health)
