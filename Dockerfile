# syntax=docker/dockerfile:1.6
#
# Multi-stage build for IntelliHunt (Next.js frontend + Django backend).
#
# Build performance notes:
#   * Requires BuildKit (default in Docker 20.10+, or `DOCKER_BUILDKIT=1`).
#   * pip and npm both mount a persistent cache (`--mount=type=cache,…`) so
#     dependency downloads are reused across builds — full cold builds still
#     pay the install cost once, but subsequent builds after a code change
#     are dramatically faster.
#   * package manifests are COPYed *before* source so the install layer
#     stays cached until dependencies actually change.
#   * `.dockerignore` keeps the build context small (no .venv, no logs,
#     no node_modules, no .next build artefacts).

# -----------------------------------------------------------------------------
# Stage 1: Build the Next.js client
# -----------------------------------------------------------------------------
# Use node:20 (Debian/glibc) not alpine — Next.js 15's SWC and Turbopack ship
# prebuilt Rust binaries that require glibc. Alpine's musl libc causes the
# native binary lookup to fail silently, leaving node_modules/.bin/next missing.
# The `-slim` variant keeps glibc but drops ~800 MB of docs/tools we don't need.
FROM node:20-slim AS client-builder
WORKDIR /app/client/intellihunt

# Copy manifests first so `npm ci` is cached independently of source changes.
COPY ./client/intellihunt/package.json ./client/intellihunt/package-lock.json* ./

# Install all deps (devDeps included — TypeScript/tailwind are needed to build).
# NODE_ENV=development ensures devDeps aren't skipped even if the host env
# exports NODE_ENV=production. `npm ci` is deterministic, fast, and errors
# loudly on lockfile drift — we *want* that signal rather than silently
# falling back to the slower `npm install`.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    NODE_ENV=development npm ci --no-audit --no-fund --prefer-offline

COPY ./client/intellihunt .

# Re-use Next's build cache across builds. `.next/cache` holds the incremental
# compile output; without this mount every build recompiles from scratch.
RUN --mount=type=cache,target=/app/client/intellihunt/.next/cache,sharing=locked \
    npm run build

# -----------------------------------------------------------------------------
# OSV scanner (pulled as a thin base, we only need the binary)
# -----------------------------------------------------------------------------
FROM ghcr.io/google/osv-scanner:latest AS scanner

# -----------------------------------------------------------------------------
# Stage 2: Python dependency builder
# -----------------------------------------------------------------------------
# Install dependencies into an isolated virtualenv at /opt/venv, then copy
# that venv wholesale into the runtime stage. Keeps the final image free of
# build-time-only apt packages and avoids re-running pip on code changes.
FROM python:3.10-slim AS python-builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

# Build tools needed only while compiling wheels for packages that lack a
# manylinux wheel on the target Python version. Everything installed here
# stays in this stage and is discarded from the final image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv && /opt/venv/bin/pip install --upgrade pip

WORKDIR /app/server
COPY ./server/requirements.txt ./requirements.txt

# Cache pip downloads across builds. `--no-compile` skips `.pyc` bytecode
# generation during install — the interpreter will JIT-compile at first use,
# and the saved disk + I/O is a meaningful speedup on every build.
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    /opt/venv/bin/pip install --no-compile -r requirements.txt

# -----------------------------------------------------------------------------
# Stage 3: Django runtime
# -----------------------------------------------------------------------------
FROM python:3.10-slim AS django
WORKDIR /app
ENV PYTHONPATH=/app/server \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PATH="/opt/venv/bin:$PATH"

# Runtime-only system packages. Dropped from previous version:
#   * libcurl4-gnutls-dev — it's a *dev* headers package; no Python dep in
#     requirements.txt links against libcurl, so it was bloat.
# Kept:
#   * git      — GitPython / crewai clone remote repos at scan time
#   * gosu     — entrypoint drops privileges from root to `intellihunt`
#   * bubblewrap — nsjail.py invokes bwrap to sandbox semgrep subprocesses
RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        gosu \
        bubblewrap \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

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

# Pull the pre-built venv from the builder stage instead of running pip again
# here. This is what keeps the final image small and the Django rebuild fast:
# a code change invalidates only the COPY ./server layer below, not the
# expensive dependency install. The venv is activated via PATH above.
COPY --from=python-builder /opt/venv /opt/venv

# OSV scanner binary
COPY --from=scanner /osv-scanner /usr/local/bin/osv-scanner
RUN chmod +x /usr/local/bin/osv-scanner

# Application source — copied last so edits only rebuild this layer.
COPY ./server /app/server

# Generate any missing migration files at build time so they are baked into
# the image. migrate still runs at container startup (entrypoint.sh) to apply
# them against the live database. DEBUG=true is set inline only for this
# command so the production SECRET_KEY guard in settings.py does not fire
# during the build — runtime DEBUG is still controlled by the env var.
RUN cd /app/server && DEBUG=true python manage.py makemigrations --noinput

COPY ./server/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]

# -----------------------------------------------------------------------------
# Stage 4: Next.js runtime (standalone output)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS nextjs
WORKDIR /app
ENV NODE_ENV=production

# Next.js `output: "standalone"` produces a self-contained server bundle.
# We only need standalone + public + static — no node_modules, no source.
COPY --from=client-builder /app/client/intellihunt/.next/standalone ./
COPY --from=client-builder /app/client/intellihunt/public ./public
COPY --from=client-builder /app/client/intellihunt/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
