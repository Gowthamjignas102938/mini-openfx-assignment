# ---- build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- production runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY drizzle ./drizzle

EXPOSE 3000
# Migrations + seed run on every boot (free-tier services have no
# preDeployCommand hook) — both are idempotent, see render.yaml's note.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/seed.js && node dist/main.js"]
