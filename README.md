# Intelligent Media Processing Pipeline

Production-style backend + dashboard for asynchronous image upload, multi-stage analysis (dimensions, blur, brightness, OCR, number-plate validation, duplicate detection), and structured result delivery.

The HTTP API and the BullMQ worker are **separate processes** sharing one Docker image — they scale independently and isolate failure domains. A React dashboard sits on top of the same API for an end-to-end demo.

---

## Stack

| Concern          | Choice                                |
| ---------------- | ------------------------------------- |
| Runtime          | Node.js 20 (ES modules)               |
| HTTP             | Express 4                             |
| Datastore        | MongoDB 7 (via Mongoose)              |
| Queue broker     | Redis 7 + BullMQ                      |
| Image decoding   | Sharp (libvips)                       |
| OCR              | Tesseract.js                          |
| Validation       | Joi                                   |
| Logging          | Winston + daily file rotation         |
| HTTP logging     | Morgan piped into Winston             |
| Security headers | Helmet, CORS                          |
| Frontend         | React 18, Vite, Tailwind CSS, Axios   |

---

## Architecture

```
                ┌─────────────┐         ┌──────────────────┐
   client ─────▶│  Express    │ enqueue │  BullMQ (Redis)  │
   (browser)    │  /api/v1/*  │────────▶│ image-processing │
                └─────┬───────┘         └────────┬─────────┘
                      │                          │ consume
                      │  read/write              ▼
                      │                  ┌──────────────────┐
                      └─────────────────▶│   Worker (Node)  │
                                         │  analyzers       │
                                         └────────┬─────────┘
                                                  │ persist
                                                  ▼
                                          ┌─────────────────┐
                                          │   MongoDB       │
                                          │   (images coll) │
                                          └─────────────────┘
```

- **API process** ([src/server.js](src/server.js)) handles upload, status, results — never blocks on heavy work. The HTTP response returns the moment the job is enqueued.
- **Worker process** ([src/workers/index.js](src/workers/index.js)) consumes the queue, runs the analyzers, and writes results back to Mongo.
- **Frontend** ([frontend/](frontend/)) is a small React dashboard that uploads, polls `/status`, then fetches `/results` and renders the analyzer output.

For local dev you can run them in one process by setting `START_WORKER_IN_API=true` (the default in [.env.example](.env.example)). For production set it to `false` and run the worker as its own service — that's what [docker-compose.yml](docker-compose.yml) does.

---

## Processing pipeline

For every uploaded image, the worker runs these analyzers in this order:

1. **Dimensions** — Sharp metadata read; flags inputs smaller than 200×200 (downstream OCR/blur are noisy on tiny crops).
2. **Blur detection** — variance of the Laplacian (the canonical Pech-Pacheco approach: convolve the grayscale image with the 3×3 discrete Laplacian, report response variance; below threshold = blurry). Implemented as a single-pass Welford convolution in [src/services/image/blur.service.js](src/services/image/blur.service.js) — sub-50ms on typical phone-sized inputs. Default threshold = 100.
3. **Brightness analysis** — Sharp grayscale + per-channel mean (ITU-R BT.601 luma). Buckets into `dark` / `normal` / `overexposed`.
4. **OCR (Tesseract.js)** — grayscale + histogram-normalised pre-processing for plates; alphanumeric whitelist; persistent worker reused across jobs to avoid the ~1s init cost.
5. **Plate validation** — regex match against Indian formats (STANDARD `KA01AB1234` style, BH-series `22BH1234AA` style).
6. **Duplicate detection** — perceptual difference-hash (dHash) computed via Sharp resize → 8×8 gradient compare → 64-bit hex hash. Hamming distance against already-processed records in Mongo; ≤5-bit distance ⇒ duplicate.

Steps 1–3 run in parallel (`Promise.all`) since they're independent. Steps 4–5 are sequential (plate consumes OCR output). Step 6 runs last because it queries Mongo.

A single analyzer failure does **not** poison the pipeline — each step is wrapped so the failure is recorded inline (`{ error: '...' }`) while the rest of the analysis still completes.

Lifecycle:

```
pending ─▶ processing ─▶ completed
                      └▶ failed   (after attempts exhausted)
```

The worker owns all status transitions. Analyzers are pure(-ish) functions that take a file path and return a result object; they never touch Mongo.

---

## Project structure

```
.
├── src/
│   ├── api/
│   │   ├── routes/         versioned route definitions (/api/v1/*)
│   │   ├── controllers/    thin HTTP handlers — no business logic
│   │   └── middlewares/    requestId, requestLogger, upload, validation, errors
│   ├── config/             env loader + Joi schema validation (fail-fast)
│   ├── database/           Mongo connection lifecycle
│   ├── models/             Mongoose schemas (Image)
│   ├── queues/             BullMQ Queue + QueueEvents, Redis factory
│   ├── workers/            BullMQ Worker process entrypoint
│   ├── services/
│   │   ├── image/          blur / brightness / dimensions / duplicate
│   │   ├── ocr/            Tesseract.js wrapper
│   │   └── validation/     Indian number-plate format validator
│   ├── utils/              logger, asyncHandler, ApiError, constants
│   ├── logs/               rotated log files (gitignored)
│   ├── uploads/            received images (gitignored)
│   ├── app.js              Express application factory
│   └── server.js           HTTP server bootstrap + graceful shutdown
└── frontend/
    └── src/
        ├── components/     Dropzone, UploadPanel, StatusBadge, ResultCard, ResultsGrid, ...
        ├── pages/          DashboardPage
        ├── hooks/          useImageProcessing (upload + poll state machine)
        ├── services/       api.js (axios wrapper)
        └── styles/         index.css (Tailwind)
```

---

## API reference

All responses follow the envelope:

```json
{ "success": true, "data": { ... }, "requestId": "..." }
```

Errors use the same envelope with `success: false` and a `{ code, message, details? }` object. `requestId` flows from the inbound `X-Request-Id` header (or is generated) and is echoed back on the response.

### `GET /health`

Liveness + dependency check. Returns 200 when Mongo + Redis are healthy, 503 otherwise.

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "uptime": 123.4,
  "timestamp": "2026-05-15T10:00:00.000Z",
  "dependencies": { "mongo": "connected", "redis": "ready" }
}
```

### `POST /api/v1/upload`

Accepts one image as `multipart/form-data` with field name `image`. JPEG / PNG / WebP, up to 10 MB. Persists a `pending` record, enqueues a job, and returns immediately.

```bash
curl -F "image=@/path/to/photo.jpg" http://localhost:3000/api/v1/upload
```

```json
{
  "success": true,
  "data": {
    "imageId": "8c2c4f3a-2c1d-4f87-9a0c-13a4b7c8d901",
    "status": "pending",
    "uploadedAt": "2026-05-15T10:00:00.000Z"
  }
}
```

### `GET /api/v1/status/:id`

Lightweight lifecycle check. Safe to poll.

```bash
curl http://localhost:3000/api/v1/status/8c2c4f3a-2c1d-4f87-9a0c-13a4b7c8d901
```

```json
{
  "success": true,
  "data": {
    "imageId": "8c2c4f3a-2c1d-4f87-9a0c-13a4b7c8d901",
    "status": "processing",
    "attempts": 1,
    "uploadedAt": "2026-05-15T10:00:00.000Z",
    "processingStartedAt": "2026-05-15T10:00:01.000Z"
  }
}
```

### `GET /api/v1/results/:id`

Full structured analysis. 409 if the job hasn't reached a terminal state yet.

```bash
curl http://localhost:3000/api/v1/results/8c2c4f3a-2c1d-4f87-9a0c-13a4b7c8d901
```

```json
{
  "success": true,
  "data": {
    "imageId": "8c2c4f3a-2c1d-4f87-9a0c-13a4b7c8d901",
    "status": "completed",
    "uploadedAt": "2026-05-15T10:00:00.000Z",
    "processedAt": "2026-05-15T10:00:04.000Z",
    "analysisResults": {
      "dimensions": { "validDimensions": true, "width": 1280, "height": 720 },
      "blur":       { "isBlurry": false, "blurScore": 312.45, "threshold": 100 },
      "brightness": { "brightnessLevel": "normal", "brightnessScore": 134.22 },
      "ocr":        { "extractedText": "KA01AB1234", "confidence": 92, "rawText": "KA 01 AB 1234" },
      "plate":      { "isValidPlate": true, "matchedPattern": "STANDARD" },
      "duplicate":  { "isDuplicate": false, "imageHash": "e6c3a1b287f49d12", "matchedImageId": null }
    },
    "failureReason": null
  }
}
```

---

## Setup

### Prerequisites

- Node.js 20+
- Docker + Docker Compose (recommended for Mongo + Redis)

### 1. Install backend dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if your Mongo/Redis are not on the defaults
```

### 3. Start infrastructure

```bash
docker compose up -d mongo redis
```

### 4. Run the API + worker

In one terminal (worker runs in-process with the default `START_WORKER_IN_API=true`):

```bash
npm run dev
```

Or in two terminals if you want to mirror production:

```bash
npm run dev          # HTTP API
npm run worker:dev   # BullMQ worker
```

The API listens on `http://localhost:3000` and `http://localhost:3000/health` should return `{ "status": "ok" }`.

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api`, `/uploads`, `/health` to the backend on port 3000 — no CORS config needed in dev.

### 6. Smoke test from the CLI

```bash
curl -F "image=@/path/to/photo.jpg" http://localhost:3000/api/v1/upload
# -> { "success": true, "data": { "imageId": "<uuid>", "status": "pending", ... } }

curl http://localhost:3000/api/v1/status/<uuid>
curl http://localhost:3000/api/v1/results/<uuid>
```

---

## Docker

```bash
docker compose up --build
```

| Service   | Description                                |
| --------- | ------------------------------------------ |
| `api`     | Express HTTP server on host port `3000`    |
| `worker`  | BullMQ worker consuming the image queue    |
| `mongo`   | MongoDB 7, port `27017`                    |
| `redis`   | Redis 7, port `6379`                       |

`api` and `worker` share the same image but use different start commands. Scale the worker pool independently:

```bash
docker compose up --scale worker=4
```

The frontend isn't in `docker-compose.yml` — build it with `npm run build` and serve `frontend/dist/` from any static host (or behind the same reverse proxy as the API).

---

## Configuration reference

All variables are validated at startup by Joi. The process refuses to boot on missing/malformed config — see [.env.example](.env.example) for the full list.

| Group   | Key                  | Default                                | Purpose                                  |
| ------- | -------------------- | -------------------------------------- | ---------------------------------------- |
| App     | `NODE_ENV`           | `development`                          | Standard Node env switch                 |
| App     | `PORT`               | `3000`                                 | HTTP port                                |
| App     | `API_PREFIX`         | `/api/v1`                              | URL prefix for versioned routes          |
| Logs    | `LOG_LEVEL`          | `info`                                 | `error\|warn\|info\|http\|debug`         |
| Logs    | `LOG_DIR`            | `src/logs`                             | Where rotated log files land             |
| Mongo   | `MONGO_URI`          | `mongodb://localhost:27017/...`        | Mongo connection string                  |
| Redis   | `REDIS_HOST`         | `localhost`                            | Redis host                               |
| Redis   | `REDIS_PORT`         | `6379`                                 | Redis port                               |
| Queue   | `IMAGE_QUEUE_NAME`   | `image-processing`                     | BullMQ queue name                        |
| Queue   | `WORKER_CONCURRENCY` | `4`                                    | Concurrent jobs per worker process       |
| Queue   | `JOB_ATTEMPTS`       | `3`                                    | Max retries before terminal failure      |
| Queue   | `JOB_BACKOFF_MS`     | `5000`                                 | Exponential backoff base delay           |
| Queue   | `START_WORKER_IN_API`| `true`                                 | Run worker in-process (dev convenience)  |
| Uploads | `UPLOAD_DIR`         | `src/uploads`                          | On-disk storage path                     |
| Uploads | `MAX_UPLOAD_BYTES`   | `10485760`                             | Multer file size cap (10 MB)             |
| Uploads | `ALLOWED_MIME_TYPES` | `image/jpeg,image/png,image/webp`      | Comma-separated allow-list               |
| CORS    | `CORS_ORIGIN`        | `*`                                    | CORS allow-list                          |

---

## Operational notes

- **Logs** rotate daily under `src/logs/` (`app-YYYY-MM-DD.log`, `error-YYYY-MM-DD.log`).
- **Correlation** every HTTP request gets an `X-Request-Id` (echoed in the response). Winston `.child({ requestId })` carries it through every log line.
- **Graceful shutdown** SIGTERM/SIGINT drain in-flight requests, close the BullMQ worker + queue, dispose the Tesseract worker, and disconnect Mongo before exiting. A 15s hard timeout prevents hangs.
- **Health** `/health` returns 503 if Mongo or Redis are not in a healthy state — wire this into your load balancer / orchestrator probe.

---

## Scalability discussion

What scales today, and where the obvious bottlenecks would be at higher load:

| Layer            | How it scales now                                                                                  | What to change at higher load                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **API**          | Stateless Express. Horizontally scalable behind any L7 LB.                                          | None until you actually have a CPU bottleneck — uploads are cheap because heavy work is deferred to the queue.                              |
| **Worker pool**  | Independent process. `docker compose up --scale worker=N` or k8s replicas. Concurrency is configurable per-process via `WORKER_CONCURRENCY`. | Run one worker per CPU; tune concurrency to your CPU/memory mix. Tesseract is the hot path, so keep concurrency conservative or pool it separately. |
| **Queue**        | Redis + BullMQ with retries + exponential backoff. Job IDs = imageId to de-dup accidental double-submits. | At very high throughput, shard queues by content type or by region. Use Redis Cluster or a managed Redis (Elasticache, Upstash).            |
| **Storage**      | Local disk under `UPLOAD_DIR`. Fine for a single host. Multer engine is isolated.                   | Swap multer's disk storage for `multer-s3` (or `multer-gcs`). The middleware export stays the same so callers don't change.                  |
| **Duplicate hash lookup** | Linear scan over `ImageModel` filtered by status + index on `analysisResults.duplicate.imageHash`. | Beyond ~100k images, swap the linear scan for an LSH index (multi-probe LSH, or a Hamming-friendly datastore — FAISS sidecar, ClickHouse). The service surface stays identical. |
| **OCR**          | One persistent Tesseract worker per process to amortise the ~1s init cost.                          | Move OCR to its own service (gRPC) so it can scale on GPU/Tesseract-native nodes independently from the rest of the analyzers.              |
| **Mongo**        | Indexes on `imageId`, `status`, `(status, uploadedAt)`, `analysisResults.duplicate.imageHash`.       | Shard by `imageId` hash. Move terminal-state documents to a colder collection / S3-backed audit log with a TTL.                            |

---

## Tradeoffs

- **Sharp + plain-JS convolution instead of OpenCV.** The PDF lists OpenCV as one of the suggested image-analysis options. An OpenCV.js (WASM) integration was prototyped for plate-region detection (Canny → findContours → aspect-ratio filter, with Tesseract OCR run only on the detected crops). It fixed one false-positive hallucination class but regressed on close-up plates where the detector picked body-panel edges over the real plate, so it was rolled back. The current analyzers use Sharp (libvips) for decode/resize/grayscale and hand-rolled JS for the math (Laplacian convolution for blur, dHash for duplicates) — sub-50 ms per op and no WASM init cost. The OCR service deliberately keeps its preprocessing pipeline isolated so a real ALPR (OpenALPR, YOLO+OCR head, or a hosted vision API) can be swapped in as a one-file change when the accuracy ceiling matters.
- **In-process worker for dev, separate process for prod.** `START_WORKER_IN_API=true` is great for local dev (`npm run dev` and you have the whole pipeline) but bad in production (a crash in an analyzer can take down the API). The flag-flip toggle keeps both modes ergonomic.
- **Polling vs WebSockets / SSE on the frontend.** Polling `/status` every 1.5s is dumb and reliable. Server-Sent Events would be slightly cheaper but adds a new transport, reverse-proxy concern, and reconnection logic. At this scale and SLA, polling wins on operational simplicity.
- **dHash vs pHash for duplicate detection.** dHash (gradient-based) is cheaper and slightly more robust to small lighting changes than pHash (DCT-based). pHash catches geometric variation slightly better but is overkill here.
- **MongoDB for both metadata + analysis.** Single store keeps the read path trivial — `findOne({ imageId })` returns everything the API needs. The cost is that the document grows over time; for very high-volume deployments, split the analysis payload into its own collection or move to a columnar store.
- **Tesseract.js (WASM) vs system Tesseract.** WASM means no native dependency, Docker image stays slim, and the same code runs on every developer's laptop. The cost is throughput — system Tesseract is ~2-3× faster. The OCR service is a single file, so swapping engines is a contained change.

---

## Assumptions

Constraints and design choices baked into the build, surfaced here so reviewers don't have to infer them from code.

### Domain

- **Plates are Indian only — STANDARD (`KA01AB1234`) and BH_SERIES (`22BH1234AA`) formats.** [plateValidation.service.js](src/services/validation/plateValidation.service.js) does not recognise EU / US / UK / commercial-fleet plates. A pluggable validator-set is straightforward to add if scope changes.
- **Inputs are unedited photos.** The dHash duplicate detector is robust to small lighting and JPEG-compression variance but not to rotation, crop, or perspective change — a 90°-rotated copy of the same image hashes differently and won't match.
- **Image orientation is in pixel-space.** EXIF orientation flags are not honoured. A portrait photo shot landscape and tagged with rotation will be processed in its untransformed orientation.

### Operational

- **Single-tenant.** No user accounts, no auth, no per-tenant scoping. Duplicate matches search across all completed records — re-uploading anyone's image triggers a hit. Multi-tenant scoping would add a `tenantId` filter to the duplicate query.
- **Local-disk storage.** Uploads land in `src/uploads/` on the API instance. The Multer middleware is isolated so an S3 / GCS adapter is a one-file change, but the current setup assumes one API instance with persistent local storage and workers co-located to read the file.
- **MongoDB and Redis are reachable at startup.** Both API and worker fail-fast on connection error at boot. `/health` reports 503 if either dependency is unhealthy at runtime.
- **Public API.** No JWT / API-key middleware on the upload / status / results endpoints. Suitable for an internal demo or behind a trusted reverse proxy, not direct public exposure.

### Pipeline behaviour

- **A single analyzer failure does NOT poison the pipeline.** Each step is wrapped — a failed analyzer records `{ error: ... }` and the rest of the pipeline continues. Clients must therefore tolerate partial `analysisResults` payloads.
- **Tesseract OCR confidence is a soft signal.** A regex-shaped plate string is currently reported as `isValidPlate: true` regardless of OCR confidence. On small or busy-scene inputs the OCR can hallucinate plate-shaped strings from background texture — see *Known limitations*. The validator could be confidence-gated as a one-line follow-up.
- **`pending` → `processing` → `completed` / `failed` is the only state machine.** BullMQ retries happen inside `processing`; no retry-pending or paused states are surfaced externally.

### Limits and defaults

| Knob | Value | Where to change |
|---|---|---|
| Accepted image MIME types | `image/jpeg`, `image/png`, `image/webp` | `ALLOWED_MIME_TYPES` env |
| Max upload size | 10 MB → HTTP 413 above | `MAX_UPLOAD_BYTES` env |
| Min image dimensions | 150 × 150 → `validDimensions: false` below | `dimensions.service.js` |
| Blur threshold | Laplacian variance < 100 → `isBlurry: true` | `blur.service.js` |
| Brightness buckets | `<60` dark, `60–200` normal, `>200` overexposed | `brightness.service.js` |
| Duplicate threshold | Hamming distance ≤ 5 bits out of 64 | `duplicate.service.js` |
| OCR character whitelist | `A-Z` + `0-9` only | `tesseract.service.js` |
| Job retries | 3 attempts, 5 s exponential backoff | `JOB_ATTEMPTS` / `JOB_BACKOFF_MS` env |
| Worker concurrency | 4 jobs in flight per worker | `WORKER_CONCURRENCY` env |

Thresholds were tuned empirically against the handful of test images used during development — not formally calibrated against a labelled dataset. All are exposed as env vars or service-level constants so they can be retuned without code-shape changes.

---

## Known limitations

The assignment brief explicitly states *"the goal is NOT perfect ML accuracy"* — these are the heuristic blind spots in the current implementation, kept here so reviewers know what was a deliberate scope decision vs an oversight.

- **OCR struggles on small, watermarked, or low-resolution real-world photos.** Tesseract.js is a general-purpose English OCR, not a license-plate model. On a 259×194 photo of a car with a "TeamBHP.com" watermark and a plate occupying ~10% of the frame, the pipeline currently returns gibberish despite the aggressive preprocessing (5 variants × 4 PSMs, edge-density band crop, position-aware OCR-confusion repair). A production system targeting real field photos should swap in a dedicated ALPR model (OpenALPR) or a managed API (Google Vision, AWS Rekognition) — the `runOcr` interface is isolated to a single file ([src/services/ocr/tesseract.service.js](src/services/ocr/tesseract.service.js)) precisely so this swap is one-file change.
- **dHash collides on flat/empty images.** A blank white panel and a blank gray panel both hash to all-zero. Real photos won't hit this, but synthetic test inputs do. The duplicate match threshold (Hamming distance ≤ 5 bits out of 64) is also tunable — drop to 2 for stricter "near-identical only" matching, or pair dHash with a secondary signature (size + aspect + average color) to break ties.
- **Blur detection on solid-color images returns score = 0, flagged blurry.** Technically correct (no edges → Laplacian variance = 0), but conflates "out of focus" with "no content". A separate "low-content" heuristic would disambiguate.
- **No screenshot / photo-of-photo / EXIF-tampering heuristic.** Listed as example checks in the brief; not implemented. The six implemented checks (dimensions, blur, brightness, OCR, plate format, dHash duplicate) exceed the required minimum of four, so this was a deliberate scope cut in favor of polishing the implemented checks.
- **Duplicate match is global, not per-tenant.** If you re-upload a colleague's image you'll get a duplicate hit against their record. Multi-tenant scoping would add a `tenantId` to the duplicate query.

---

## AI usage disclosure

AI tooling (Claude) was used during this build for:

- Drafting boilerplate (Express factory, Mongoose schema, BullMQ wiring, Multer config) and iterating on it.
- Producing the structure of the Tailwind components and the polling state machine for the dashboard.
- Generating the initial README scaffold and the inline documentation comments.

All AI-assisted output was reviewed, edited, and integrated by hand. Design choices that mattered — analyzer ordering, duplicate-detection algorithm, worker/queue topology, error-handling contract, configuration boundary — were decided by the author. Where AI suggested a non-obvious dependency or approach, it was sanity-checked against the docs (BullMQ, Sharp, Tesseract.js).

No AI tooling was given runtime access to a database, Redis instance, or any external service during this build.

---

## What's intentionally NOT in this repo

- **No tests yet.** Analyzers are pure functions of `(path, opts)` so they are straightforward to unit test; the worker is a thin orchestrator that can be tested with a stubbed queue.
- **No auth.** Add JWT/API-key middleware in [src/api/middlewares/](src/api/middlewares/) if it becomes a requirement.
- **No object-storage adapter.** Uploads land on local disk; the multer middleware is isolated so swapping to S3/GCS is a single-file change.
- **No frontend bundling in Docker.** Build with `npm run build` and serve `frontend/dist/` from any static host (or behind the same reverse proxy as the API).
