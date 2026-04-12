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

# ── wait for PostgreSQL ───────────────────────────────────────────────────────
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
echo "[entrypoint] Waiting for PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
until python - <<'EOF'
import socket, os, sys
host = os.environ.get("POSTGRES_HOST", "postgres")
port = int(os.environ.get("POSTGRES_PORT", "5432"))
try:
    s = socket.create_connection((host, port), timeout=3)
    s.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
EOF
do
    echo "[entrypoint] PostgreSQL not ready — retrying in 2s..."
    sleep 2
done
echo "[entrypoint] PostgreSQL is ready."

# ── migrations ───────────────────────────────────────────────────────────────
echo "[entrypoint] Running database migrations..."
# Legacy fix: if reportApp tables exist but Django has no migration records
# for the app, fake only the migrations whose schema changes already exist
# (0001-0008).  New migrations (0009+) are left UN-faked so Django actually
# runs them and creates the new columns.
#
# Previous approach faked ALL reportApp migrations, which silently skipped
# newly added migrations like 0009 (scan_level column).
python -c "
import django, os, sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'intelliHunt.settings')
django.setup()
from django.db import connection
with connection.cursor() as cur:
    # Check if tables exist but migration tracking is missing
    cur.execute(\"SELECT 1 FROM information_schema.tables WHERE table_name='reportApp_organization'\")
    has_tables = cur.fetchone()
    cur.execute(\"SELECT COUNT(*) FROM django_migrations WHERE app='reportApp'\")
    migration_count = cur.fetchone()[0]
    if has_tables and migration_count == 0:
        print('[entrypoint] Existing reportApp tables with no migration records — faking 0001-0008.')
        sys.exit(0)
    else:
        sys.exit(1)
" && python manage.py migrate --fake reportApp 0008 --noinput 2>/dev/null || true

# If a previous deploy wrongly faked migration 0009 (scan_level column),
# un-fake it so it actually runs this time.
python -c "
import django, os, sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'intelliHunt.settings')
django.setup()
from django.db import connection
with connection.cursor() as cur:
    # Check if 0009 is recorded as applied but the column doesn't exist
    cur.execute(\"SELECT 1 FROM django_migrations WHERE app='reportApp' AND name='0009_scanresult_scan_level'\")
    is_recorded = cur.fetchone()
    cur.execute(\"SELECT 1 FROM information_schema.columns WHERE table_name='reportApp_scanresult' AND column_name='scan_level'\")
    col_exists = cur.fetchone()
    if is_recorded and not col_exists:
        print('[entrypoint] Migration 0009 was faked but column missing — removing fake record.')
        cur.execute(\"DELETE FROM django_migrations WHERE app='reportApp' AND name='0009_scanresult_scan_level'\")
        sys.exit(0)
    else:
        sys.exit(1)
" 2>/dev/null || true

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

# CVE-2026-27208: drop root before starting the long-running server process.
# Migrations, collectstatic, and admin creation above needed root (or at least
# unrestricted filesystem access). From here, gunicorn runs as the unprivileged
# 'intellihunt' user so that any code-execution vulnerability in the app cannot
# be trivially escalated to root inside the container.
# Ensure writable directories exist before chown.
mkdir -p /app/server/intelliHunt/data /home/intellihunt/.local/share/crewai
chown -R intellihunt:intellihunt \
  "$LOG_BASE" \
  /app/server/intelliHunt/data \
  /home/intellihunt/.local/share/crewai \
  /home/intellihunt/.cache \
  2>/dev/null || true

exec gosu intellihunt gunicorn \
  --bind 0.0.0.0:8000 \
  --workers 2 \
  --timeout 900 \
  --capture-output \
  --access-logfile  "$ACCESS_LOG" \
  --error-logfile   "-" \
  --access-logformat '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)sµs' \
  intelliHunt.wsgi:application
