# # --- Stage 1: Build the React Client ---
# FROM node:20-alpine AS client-builder
# WORKDIR /client/intellihunt
# COPY ./client/intellihunt/package.json ./
# RUN npm install
# COPY ./client/intellihunt ./
# RUN npm run build

# # --- Stage 2: Build and Run the Django Server ---
# FROM python:3.10-slim
# WORKDIR /server
# ENV PYTHONPATH=/server

# # Copy the required directories from your project
# # Paths are relative to the Docker build context (your repo root)
# COPY --from=client-builder /client/intellihunt/.next/build ./client/intellihunt/.next/build
# COPY ./server/requirements.txt ./requirements.txt
# COPY ./server/intelliHunt/crew ./crew

# RUN pip install --no-cache-dir -r requirements.txt

# # Copy the rest of the server code
# COPY ./server/ ./

# EXPOSE 8000
# # Change the CMD to specify the full path to the WSGI file
# CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "intelliHunt.wsgi:application"]

# --- Stage 1: Build the Next.js Client ---
# Use node:20 (Debian/glibc) not alpine — Next.js 15's SWC and Turbopack ship
# prebuilt Rust binaries that require glibc.  Alpine's musl libc causes the
# native binary lookup to fail silently, leaving node_modules/.bin/next missing.
FROM node:20 AS client-builder
WORKDIR /app/client/intellihunt

# Copy manifests first so npm install is cached independently of source changes
COPY ./client/intellihunt/package.json ./client/intellihunt/package-lock.json* ./

# Install all deps (including devDependencies needed for the TypeScript build)
# NODE_ENV=development ensures devDeps aren't skipped even if the host env
# exports NODE_ENV=production
RUN NODE_ENV=development npm ci --prefer-offline || NODE_ENV=development npm install

COPY ./client/intellihunt .
RUN npm run build
RUN ls -la /app/client/intellihunt/.next/standalone || echo "Standalone build not found"
RUN ls -la /app/client/intellihunt/.next/static || echo "Static directory not found"

# Pull scanner
FROM ghcr.io/google/osv-scanner:latest AS scanner

# --- Stage 2: Run Django ---
FROM python:3.10-slim AS django
WORKDIR /app
ENV PYTHONPATH=/app/server
# RUN apt-get update \
#     && apt-get install -y --no-install-recommends git \
#     && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y git libcurl4-gnutls-dev gosu && rm -rf /var/lib/apt/lists/*

# CVE-2026-27208: create a non-root user for the runtime process.
# Migrations and setup steps run as root; gunicorn is started as this user
# via gosu in entrypoint.sh, ensuring no privilege escalation is possible.
RUN groupadd -r intellihunt && \
    useradd -r -g intellihunt -u 1000 -d /home/intellihunt -s /sbin/nologin intellihunt && \
    mkdir -p /home/intellihunt/.local/share /home/intellihunt/.cache && \
    chown -R intellihunt:intellihunt /home/intellihunt

# CrewAI calls db_storage_path() at import time and tries to create
# $HOME/.local/share/crewai. Point XDG_DATA_HOME at the user's writable
# home so the import doesn't fail with EACCES when Django loads views.py.
ENV HOME=/home/intellihunt \
    XDG_DATA_HOME=/home/intellihunt/.local/share \
    XDG_CACHE_HOME=/home/intellihunt/.cache \
    CREWAI_STORAGE_DIR=/home/intellihunt/.local/share/crewai

COPY ./server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r /app/server/requirements.txt
COPY ./server /app/server
# EXPOSE 8000
# CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "intelliHunt.wsgi:application"]


COPY --from=scanner /osv-scanner /usr/local/bin/osv-scanner
RUN chmod +x /usr/local/bin/osv-scanner && \
    /usr/local/bin/osv-scanner --version || echo "OSV-Scanner verification failed."


# Generate any missing migration files at build time so they are baked into
# the image. migrate still runs at container startup (entrypoint.sh) to apply
# them against the live database. DEBUG=true is set inline only for this
# command so the production SECRET_KEY guard in settings.py does not fire
# during the build — runtime DEBUG is still controlled by the env var.
RUN cd /app/server && DEBUG=true python manage.py makemigrations --noinput

EXPOSE 8000
COPY ./server/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

# --- Stage 3: Run the Next.js Frontend ---
FROM node:20-alpine AS nextjs
WORKDIR /app
# Copy standalone build and static assets from the client-builder stage
COPY --from=client-builder /app/client/intellihunt/.next/standalone ./
# Copy the public directory if it exists, as it's needed for assets
COPY --from=client-builder /app/client/intellihunt/public ./public
# Copy the static assets
COPY --from=client-builder /app/client/intellihunt/.next/static ./.next/static
EXPOSE 3000
ENV NODE_ENV=production
# The standalone output includes all necessary files, so we can run it directly.
CMD ["node", "server.js"]