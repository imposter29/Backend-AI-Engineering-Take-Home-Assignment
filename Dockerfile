# ----------------------------------------------------------------------
# Multi-stage Dockerfile for the Intelligent Media Processing Pipeline.
#
# Stage 1 (deps):  install production dependencies only.
# Stage 2 (run):   copy app + deps into a slim runtime image.
#
# OpenCV (via @techstark/opencv-js) is a pure-JS/WASM build, so we do
# NOT need system-level libopencv. Tesseract.js similarly ships its own
# WASM core. Sharp pulls a prebuilt libvips binary that works on
# debian-slim out of the box. If you switch to native bindings later,
# install build-essential / python3 / libvips-dev here.
# ----------------------------------------------------------------------

# ---------- Stage 1: dependencies ----------
FROM node:20-bookworm-slim AS deps

WORKDIR /app

# Copy lockfile + manifest first to leverage Docker layer caching.
COPY package*.json ./

# Use `npm ci` once a package-lock.json is generated. Until then,
# `npm install` keeps the image buildable from a fresh clone.
RUN npm install --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Pull deps from the builder stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy application source.
COPY . .

# Create runtime directories owned by the non-root `node` user.
RUN mkdir -p src/logs src/uploads && chown -R node:node /app

USER node

EXPOSE 3000

# Default command runs the API. The worker process is started by a
# separate service in docker-compose.yml (`command: npm run worker`).
CMD ["node", "src/server.js"]