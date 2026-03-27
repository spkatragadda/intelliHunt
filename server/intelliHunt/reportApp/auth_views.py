"""
Authentication endpoints: register, login, token refresh, current user.
"""
import json
import logging

import jwt
from django.contrib.auth.models import User

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
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


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
        payload["access"] = create_access_token(user.pk, org.id, user.username)
        payload["refresh"] = create_refresh_token(user.pk, org.id)
        return JsonResponse(payload)

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def refresh_view(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)
    try:
        body = json.loads(request.body)
        token = body.get("refresh", "")
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            return JsonResponse({"error": "Invalid token type"}, status=401)

        user = User.objects.get(pk=payload["user_id"])
        access_token = create_access_token(
            user.pk, payload["org_id"], user.username
        )
        return JsonResponse({"access": access_token})

    except jwt.ExpiredSignatureError:
        return JsonResponse(
            {"error": "Refresh token expired", "code": "refresh_expired"}, status=401
        )
    except jwt.InvalidTokenError:
        return JsonResponse({"error": "Invalid token"}, status=401)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@require_auth
def me(request):
    try:
        user = User.objects.get(pk=request.user_id)
        org = user.profile.organization
        return JsonResponse(_user_payload(user, org))
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
