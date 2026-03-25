"""
JWT authentication utilities and per-tenant file path helpers.
"""
import os
import jwt
from datetime import datetime, timedelta, timezone
from functools import wraps

from django.conf import settings
from django.http import JsonResponse

_ALGORITHM = "HS256"
_ACCESS_TTL_HOURS = 1    # Short-lived; client refreshes automatically via authedFetch
_REFRESH_TTL_DAYS = 30


def _secret() -> str:
    return settings.SECRET_KEY


# ── Token creation ─────────────────────────────────────────────────────────────

def create_access_token(user_id, org_id: str, username: str) -> str:
    payload = {
        "type": "access",
        "user_id": str(user_id),
        "org_id": str(org_id),
        "username": username,
        "exp": datetime.now(tz=timezone.utc) + timedelta(hours=_ACCESS_TTL_HOURS),
        "iat": datetime.now(tz=timezone.utc),
    }
    return jwt.encode(payload, _secret(), algorithm=_ALGORITHM)


def create_refresh_token(user_id, org_id: str) -> str:
    payload = {
        "type": "refresh",
        "user_id": str(user_id),
        "org_id": str(org_id),
        "exp": datetime.now(tz=timezone.utc) + timedelta(days=_REFRESH_TTL_DAYS),
        "iat": datetime.now(tz=timezone.utc),
    }
    return jwt.encode(payload, _secret(), algorithm=_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _secret(), algorithms=[_ALGORITHM])


# ── Auth decorator ─────────────────────────────────────────────────────────────

def require_auth(view_func):
    """Validate JWT Bearer token; attach user_id, org_id, username to request."""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JsonResponse({"error": "Authentication required"}, status=401)
        token = auth_header[7:].strip()
        try:
            payload = decode_token(token)
            if payload.get("type") != "access":
                return JsonResponse({"error": "Invalid token type"}, status=401)
            request.user_id = payload["user_id"]
            request.org_id = payload["org_id"]
            request.username = payload.get("username", "")
        except jwt.ExpiredSignatureError:
            return JsonResponse(
                {"error": "Token expired", "code": "token_expired"}, status=401
            )
        except jwt.InvalidTokenError:
            return JsonResponse({"error": "Invalid token"}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper


# ── Per-tenant data paths ──────────────────────────────────────────────────────

def tenant_dir(org_id: str) -> str:
    """Return (and create) the per-tenant data directory."""
    path = os.path.join(
        settings.BASE_DIR, "intelliHunt", "data", "tenants", str(org_id)
    )
    os.makedirs(path, exist_ok=True)
    return path


def tenant_path(org_id: str, filename: str) -> str:
    """Full path to a file inside the tenant's data directory."""
    return os.path.join(tenant_dir(org_id), filename)
