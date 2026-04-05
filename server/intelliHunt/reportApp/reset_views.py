import hashlib
import json
import logging
import secrets

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from datetime import timedelta

from django.conf import settings
from django_ratelimit.decorators import ratelimit
from .models import PasswordResetToken

logger = logging.getLogger("intelliHunt")
User = get_user_model()


def _sha256(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


@ratelimit(key='ip', rate='3/m', method='POST', block=True)
@csrf_exempt
def forgot_password(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed."}, status=405)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    email = (body.get("email") or "").strip().lower()

    safe_response = JsonResponse(
        {"message": "If that email is registered, a reset link has been sent."},
        status=200,
    )

    if not email:
        return safe_response

    try:
        user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        return safe_response

    PasswordResetToken.objects.filter(user=user, used=False).delete()

    raw_token = secrets.token_urlsafe(32)
    token_hash = _sha256(raw_token)
    expires_at = timezone.now() + timedelta(minutes=30)

    PasswordResetToken.objects.create(
        user=user,
        token_hash=token_hash,
        expires_at=expires_at,
    )

    frontend_url = settings.FRONTEND_URL.rstrip("/")
    reset_url = f"{frontend_url}/reset-password?token={raw_token}"

    subject = "Reset your IntelliHunt password"
    body_text = (
        f"Hi {user.username},\n\n"
        f"We received a request to reset the password for your IntelliHunt account.\n\n"
        f"Click the link below to set a new password. This link expires in 30 minutes.\n\n"
        f"{reset_url}\n\n"
        f"If you did not request a password reset, you can safely ignore this email.\n\n"
        f"— The IntelliHunt Team"
    )

    try:
        send_mail(
            subject=subject,
            message=body_text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception as exc:
        logger.error("forgot_password: send_mail failed for user %s: %s", user.id, exc)

    return safe_response


@ratelimit(key='ip', rate='5/m', method='POST', block=True)
@csrf_exempt
def reset_password(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed."}, status=405)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    raw_token = (body.get("token") or "").strip()
    password = body.get("password") or ""

    if not raw_token:
        return JsonResponse(
            {"error": "This reset link is invalid or has expired."}, status=400
        )

    token_hash = _sha256(raw_token)

    try:
        token_obj = PasswordResetToken.objects.select_related("user").get(
            token_hash=token_hash,
            used=False,
            expires_at__gt=timezone.now(),
        )
    except PasswordResetToken.DoesNotExist:
        return JsonResponse(
            {"error": "This reset link is invalid or has expired."}, status=400
        )

    try:
        validate_password(password, user=token_obj.user)
    except ValidationError as exc:
        return JsonResponse({"error": " ".join(exc.messages)}, status=400)

    user = token_obj.user
    user.set_password(password)
    user.save()

    token_obj.used = True
    token_obj.save()

    return JsonResponse(
        {"message": "Password updated. You can now sign in."}, status=200
    )
