# ---- build stage: compiles TypeScript -> JavaScript ----
# Small official Node 22 image based on Alpine Linux; named "builder" so the next stage can copy from it
FROM node:22-alpine AS builder
# All following commands run inside /app in the image
WORKDIR /app

# Copy only the dependency manifests first, so Docker can cache the npm install layer
COPY package.json package-lock.json ./
# Install ALL dependencies (incl. dev ones like the Nest CLI + TypeScript needed to build)
RUN npm ci

# Copy the TypeScript/Nest build configuration
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
# Copy the application source code
COPY src ./src
# Compile src/ into dist/ (plain JavaScript)
RUN npm run build

# ---- production runtime: only what's needed to run ----
# Start fresh from the same small base image (none of the build tools come along)
FROM node:22-alpine AS runner
# Work inside /app again
WORKDIR /app
# Tell Node libraries we're running in production mode
ENV NODE_ENV=production

# Copy dependency manifests again for the runtime install
COPY package.json package-lock.json ./
# Install only runtime dependencies (skip dev tools) to keep the image small
RUN npm ci --omit=dev

# Bring over the compiled JavaScript from the build stage, owned by the non-root "node" user
COPY --from=builder --chown=node:node /app/dist ./dist
# Bring over the SQL migration files, owned by "node" so it can read them
# (your Mac's file permissions are copied as-is, and some aren't world-readable)
COPY --chown=node:node drizzle ./drizzle

# Run as the unprivileged "node" user (built into the official image) instead of root
USER node

# Document that the app listens on port 3000 (informational only)
EXPOSE 3000
# On start: apply DB migrations, seed starting balances, then launch the API.
# Migrations + seed run on every boot (free-tier services have no
# preDeployCommand hook) — both are idempotent, see render.yaml's note.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/seed.js && node dist/main.js"]
