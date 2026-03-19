# 🖥️ scrapper-ui

Frontend application for scraping analytics, tracker management, and ranking history visualization.

## 🎯 Highlights

- ⚡ **React 19 + Vite** for fast local development
- 🎨 **MUI-based UI** with responsive dashboard layouts
- 🌍 **i18n support** (`en` / `uk`) via `i18next`
- 🔄 **RTK Query** integration with optimistic updates for tracker actions

## 🧩 Tech Stack

- React 19
- TypeScript
- Vite
- MUI
- Redux Toolkit + RTK Query
- i18next

## ▶️ Run Locally

```bash
npm install
npm start
```

Open: [http://localhost:3000](http://localhost:3000)

## 📦 Production Build

```bash
npm run build
```

Build output: `dist/`

## 🧪 Tests

```bash
npm test -- --watchAll=false --watchman=false
```

## 🔌 API Configuration

API base URL is defined in:

- `src/store/apiSlice.ts`

Current value:

- `http://localhost:3001/api/`

Make sure backend is running on `3001`, or update this value if needed.

## 📁 Key Folders

```text
src/
├── components/
├── modules/
├── pages/
├── store/
├── locales/
└── utils/
```
