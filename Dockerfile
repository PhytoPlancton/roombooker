# syntax=docker/dockerfile:1.7

# Image runtime avec Chromium déjà installé pour Playwright
ARG PW_IMAGE=mcr.microsoft.com/playwright:v1.59.1-jammy

# ---- deps ----
FROM ${PW_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ---- builder ----
FROM ${PW_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner ----
FROM ${PW_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Standalone output Next.js (server.js + minimal node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Playwright et googleapis sont marqués comme serverExternalPackages dans next.config.js,
# donc Next.js standalone ne les bundle pas. On les copie explicitement.
COPY --from=builder /app/node_modules/playwright ./node_modules/playwright
COPY --from=builder /app/node_modules/playwright-core ./node_modules/playwright-core

# Volume pour stocker les screenshots d'erreur Skedda
VOLUME ["/app/debug-screenshots"]

EXPOSE 3000
CMD ["node", "server.js"]
