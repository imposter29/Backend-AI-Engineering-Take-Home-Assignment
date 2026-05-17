# Frontend — Media Pipeline Dashboard

Minimal React + Vite + Tailwind dashboard for the image-processing API.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies `/api`, `/uploads`, `/health` to the backend on `http://localhost:3000` (see [vite.config.js](vite.config.js)). Make sure the backend is running first (`npm run dev` from the repo root).

## Build for production

```bash
npm run build      # outputs to dist/
npm run preview    # serve the built bundle locally
```

In production, serve `dist/` from any static host (or behind the same reverse proxy as the API to avoid CORS).

## Structure

```
src/
├── components/   Header, Dropzone, UploadPanel, StatusBadge, ResultCard,
│                 ResultsGrid, ResultsSkeleton, ErrorPanel
├── pages/        DashboardPage (the only page, for now)
├── hooks/        useImageProcessing — upload + poll state machine
├── services/     api.js — axios wrapper around /api/v1/*
└── styles/       index.css with Tailwind layers
```

## Flow

```
pick file
   ▼
POST /api/v1/upload   (multipart, progress event -> progress bar)
   ▼
returns { imageId, status: 'pending' }
   ▼
poll GET /api/v1/status/:id every 1500 ms
   │  status === 'completed' || 'failed'
   ▼
GET /api/v1/results/:id
   ▼
render six analyzer cards
```
