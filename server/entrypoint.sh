#!/bin/sh
# Docker entrypoint
# -----------------
# 1. Run database migrations
# 2. Ensure the admin@admin.com account exists
# 3. Create today's log directories
# 4. Start Gunicorn, writing its access + error logs into the same
#    dated structure used by the Django application logger:
#
#    logs/
#      <YYYY>/
#        <MM>/
#          <YYYY-MM-DD>.log          ← Django app logs  (via DailyDirectoryHandler)
#          <YYYY-MM-DD>-access.log   ← Gunicorn HTTP access log
#          <YYYY-MM-DD>-gunicorn.log ← Gunicorn worker errors / startup
#      django/
#        <YYYY>/<MM>/<YYYY-MM-DD>.log ← Django framework warnings
#
# Gunicorn's logs are opened at startup; they roll over on the next
# container restart (or manual SIGHUP).  Django's DailyDirectoryHandler
# rolls over exactly at midnight with no restart required.

set -e

cd /app/server

# ── compute today's date-based paths ────────────────────────────────────────
YEAR=$(date -u +%Y)
MONTH=$(date -u +%m)
DAY=$(date -u +%Y-%m-%d)

LOG_BASE=/app/server/logs
LOG_DIR="$LOG_BASE/$YEAR/$MONTH"
DJANGO_LOG_DIR="$LOG_BASE/django/$YEAR/$MONTH"

mkdir -p "$LOG_DIR" "$DJANGO_LOG_DIR"

ACCESS_LOG="$LOG_DIR/${DAY}-access.log"
GUNICORN_LOG="$LOG_DIR/${DAY}-gunicorn.log"

# ── migrations ───────────────────────────────────────────────────────────────
echo "[entrypoint] Running database migrations..."
python manage.py migrate --noinput

# ── static files ─────────────────────────────────────────────────────────────
echo "[entrypoint] Collecting static files..."
python manage.py collectstatic --noinput --clear

# ── admin account ────────────────────────────────────────────────────────────
echo "[entrypoint] Ensuring admin account exists..."
if [ -n "$ADMIN_PASSWORD" ]; then
  echo "[entrypoint] ADMIN_PASSWORD env var detected — using provided password."
else
  echo "[entrypoint] No ADMIN_PASSWORD set — auto-generating password (see credentials file or logs)."
fi
python manage.py create_admin

# ── start Gunicorn ───────────────────────────────────────────────────────────
echo "[entrypoint] Starting Gunicorn..."
echo "  access log → $ACCESS_LOG"
echo "  error log  → $GUNICORN_LOG"

exec gunicorn \
  --bind 0.0.0.0:8000 \
  --workers 3 \
  --timeout 120 \
  --capture-output \
  --access-logfile  "$ACCESS_LOG" \
  --error-logfile   "-" \
  --access-logformat '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)sµs' \
  intelliHunt.wsgi:application
