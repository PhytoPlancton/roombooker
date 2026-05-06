# syntax=docker/dockerfile:1.7

# Plus besoin de Playwright/Chromium : on utilise l'API HTTP Skedda directement (cf lib/skedda-http.ts)
ARG NODE_IMAGE=node:20-bookworm-slim

# ---- deps ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --omit=dev || npm ci --no-audit --no-fund

# ---- builder ----
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runner ----
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
