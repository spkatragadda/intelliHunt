"""
Authentication endpoints: register, login, token refresh, current user.
"""
import json
import logging

import jwt
from django.conf import settings
from django.contrib.auth.models import User
from django_ratelimit.decorators import ratelimit

logger = logging.getLogger("intelliHunt")
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    require_auth,
)
from .models import Organization, UserProfile
from .logging_utils import log_action


def _user_payload(user: User, org: Organization) -> dict:
    """
    Returns a flat structure:
      { access, refresh, user: { id, username, email }, organization: { id, name } }
    Tokens are added by callers.
    """
    return {
        "user": {
            "id": str(user.pk),
            "username": user.username,
            "email": user.email,
        },
        "organization": {
            "id": str(org.id),
            "name": org.name,
        },
    }


@ratelimit(key='ip', rate='5/m', method='POST', block=True)
@csrf_exempt
def register(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)
    try:
        body = json.loads(request.body)
        username = body.get("username", "").strip()
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        org_name = body.get("org_name", "").strip() or f"{username}'s Org"

        if not username or not email or not password:
            return JsonResponse(
                {"error": "Username, email, and password are required"}, status=400
            )
        if email == "admin@admin.com":
            return JsonResponse({"error": "Email already registered"}, status=400)
        if len(password) < 8:
            return JsonResponse(
                {"error": "Password must be at least 8 characters"}, status=400
            )
        if User.objects.filter(username=username).exists():
            return JsonResponse({"error": "Username already taken"}, status=400)
        if email and User.objects.filter(email=email).exists():
            return JsonResponse({"error": "Email already registered"}, status=400)

        org = Organization.objects.create(name=org_name)
        user = User.objects.create_user(
            username=username, email=email, password=password,
            is_active=False,  # account is pending admin approval
        )
        UserProfile.objects.create(user=user, organization=org)

        log_action(str(org.id), user.pk, username, "register", "pending")
        logger.info("REGISTER_PENDING user=%s email=%s org=%s", username, email, org_name)
        return JsonResponse({
            "pending": True,
            "message": "Your request has been submitted. You'll receive an email once an admin approves your account.",
        }, status=201)

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    except Exception:
        logger.exception("Unexpected error in register")
        return JsonResponse({"error": "An unexpected error occurred."}, status=500)


@ratelimit(key='ip', rate='10/m', method='POST', block=True)
@csrf_exempt
def login_view(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)
    try:
        body = json.loads(request.body)
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")

        if not email or not password:
            return JsonResponse(
                {"error": "Email and password are required"}, status=400
            )

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            logger.warning("LOGIN_FAIL email=%s reason=user_not_found", email)
            return JsonResponse({"error": "Invalid credentials"}, status=401)
        except User.MultipleObjectsReturned:
            logger.error("LOGIN_FAIL email=%s reason=duplicate_accounts", email)
            return JsonResponse({"error": "Account configuration error"}, status=500)

        if not user.check_password(password):
            logger.warning("LOGIN_FAIL email=%s reason=wrong_password", email)
            return JsonResponse({"error": "Invalid credentials"}, status=401)

        if not user.is_active:
            logger.warning("LOGIN_FAIL email=%s reason=pending_approval", email)
            return JsonResponse(
                {"error": "Your account is pending approval. You'll receive an email once an admin approves your request."},
                status=403,
            )

        try:
            org = user.profile.organization
        except UserProfile.DoesNotExist:
            return JsonResponse({"error": "Account not fully configured"}, status=500)

        log_action(str(org.id), user.pk, user.username, "login", "completed")
        logger.info("LOGIN user=%s org=%s", user.username, org.name)
        payload = _user_payload(user, org)
        access = create_access_token(user.pk, org.id, user.username)
        refresh = create_refresh_token(user.pk, org.id)
        response = JsonResponse(payload)
        _is_secure = request.is_secure()
        response.set_cookie(
            "access_token", access, httponly=True, secure=_is_secure,
            samesite="Lax", max_age=3600, path="/",
        )
        response.set_cookie(
            "refresh_token", refresh, httponly=True, secure=_is_secure,
            samesite="Lax", max_age=60 * 60 * 24 * 30, path="/api/auth/refresh/",
        )
        return response

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    except Exception:
        logger.exception("Unexpected error in login_view")
        return JsonResponse({"error": "An unexpected error occurred."}, status=500)


@csrf_exempt
def refresh_view(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)
    try:
        # Read refresh token from HttpOnly cookie (preferred) or JSON body (fallback)
        token = request.COOKIES.get("refresh_token")
        if not token:
            try:
                body = json.loads(request.body)
                token = body.get("refresh", "")
            except (json.JSONDecodeError, ValueError):
                pass
        if not token:
            return JsonResponse({"error": "Refresh token required"}, status=401)

        payload = decode_token(token)
        if payload.get("type") != "refresh":
            return JsonResponse({"error": "Invalid token type"}, status=401)

        user = User.objects.get(pk=payload["user_id"])
        new_access = create_access_token(
            user.pk, payload["org_id"], user.username
        )
        response = JsonResponse({"status": "ok"})
        response.set_cookie(
            "access_token", new_access, httponly=True, secure=request.is_secure(),
            samesite="Lax", max_age=3600, path="/",
        )
        return response

    except jwt.ExpiredSignatureError:
        return JsonResponse(
            {"error": "Refresh token expired", "code": "refresh_expired"}, status=401
        )
    except jwt.InvalidTokenError:
        return JsonResponse({"error": "Invalid token"}, status=401)
    except Exception:
        logger.exception("Unexpected error in refresh_view")
        return JsonResponse({"error": "An unexpected error occurred."}, status=500)


@require_auth
def me(request):
    try:
        user = User.objects.get(pk=request.user_id)
        org = user.profile.organization
        return JsonResponse(_user_payload(user, org))
    except Exception:
        logger.exception("Unexpected error in me")
        return JsonResponse({"error": "An unexpected error occurred."}, status=500)


@csrf_exempt
@require_auth
def logout_view(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)
    response = JsonResponse({"status": "ok"})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth/refresh/")
    return response
