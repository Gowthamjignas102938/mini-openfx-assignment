# ---- build stage: turns the React/TypeScript source into static HTML/JS/CSS ----
# Small official Node 22 image, named "builder" so the next stage can copy from it
FROM node:22-alpine AS builder
# All following commands run inside /app
WORKDIR /app

# Copy only the dependency manifests first, so the npm install layer is cached
COPY package.json package-lock.json ./
# Install all dependencies (Vite, TypeScript, Tailwind are needed to build)
RUN npm ci

# Copy the rest of the frontend source (.dockerignore keeps out node_modules, dist, .env)
COPY . .
# The browser calls the API at "/v1" on the same address it loaded the page from;
# nginx (below) forwards those calls to the API inside the cluster.
ENV VITE_API_BASE_URL=/v1
# Deliberately empty: nginx adds the real key server-side, so no secret is baked into the JS
ENV VITE_API_KEY=""
# Type-check and build into dist/
RUN npm run build

# ---- runtime stage: a tiny web server that only serves the built files ----
# Official NGINX image variant that runs as a non-root user and listens on port 8080
FROM nginxinc/nginx-unprivileged:1.27-alpine
# Config template: at startup nginx fills in ${API_KEY} from the environment
# (--chown so the non-root nginx user owns and can read it, whatever the Mac's file permissions are)
COPY --chown=nginx:nginx nginx/default.conf.template /etc/nginx/templates/default.conf.template
# The built website from the build stage
COPY --from=builder /app/dist /usr/share/nginx/html
# Document the port nginx listens on (informational only)
EXPOSE 8080
# No CMD needed: the base image already starts nginx
