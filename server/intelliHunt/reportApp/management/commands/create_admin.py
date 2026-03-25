"""
Management command: create_admin
Creates (or resets) the privileged admin account:
  - email:    admin@admin.com
  - username: admin
  - is_staff: True

If the account already exists its password is left unchanged and the
existing credentials file is preserved.  Pass --reset to rotate the
password unconditionally.

The generated password is written to ADMIN_CREDENTIALS_FILE
(default: <BASE_DIR>/admin_credentials.txt) and printed once to stdout.
Never commit or expose that file.
"""
import os
import secrets
import string

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.conf import settings

from intelliHunt.reportApp.models import Organization, UserProfile

ADMIN_EMAIL    = "admin@admin.com"
ADMIN_USERNAME = "admin"
# Credentials file path (override via ADMIN_CREDENTIALS_FILE env var)
_DEFAULT_CREDS_FILE = os.path.join(settings.BASE_DIR, "admin_credentials.txt")
CREDS_FILE = os.environ.get("ADMIN_CREDENTIALS_FILE", _DEFAULT_CREDS_FILE)


def _generate_password(length: int = 32) -> str:
    """Cryptographically random password: letters + digits + safe symbols."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()-_=+"
    return "".join(secrets.choice(alphabet) for _ in range(length))


class Command(BaseCommand):
    help = "Create or verify the admin@admin.com superuser account."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Rotate the admin password even if the account already exists.",
        )

    def handle(self, *args, **options):
        reset = options["reset"]

        # Match on either email OR username so a partial previous run can't
        # leave an orphan "admin" username that blocks re-creation.
        existing = (
            User.objects.filter(email=ADMIN_EMAIL).first()
            or User.objects.filter(username=ADMIN_USERNAME).first()
        )

        if existing and not reset:
            # Ensure the existing record is fully configured even if a previous
            # run left it in a partial state (wrong email, missing is_staff, etc.)
            changed = False
            if existing.email.lower() != ADMIN_EMAIL:
                existing.email = ADMIN_EMAIL
                changed = True
            if not existing.is_staff:
                existing.is_staff = True
                changed = True
            if changed:
                existing.save()
            # Ensure UserProfile / org exist
            org, _ = Organization.objects.get_or_create(name="__admin__")
            UserProfile.objects.get_or_create(user=existing, defaults={"organization": org})
            self.stdout.write(
                self.style.SUCCESS(
                    f"Admin account '{ADMIN_EMAIL}' already exists. "
                    f"Use --reset to rotate the password."
                )
            )
            return

        password = _generate_password()

        if existing:
            # Rotate password (--reset path)
            existing.email = ADMIN_EMAIL
            existing.is_staff = True
            existing.set_password(password)
            existing.save(update_fields=["email", "password", "is_staff"])
            org, _ = Organization.objects.get_or_create(name="__admin__")
            UserProfile.objects.get_or_create(user=existing, defaults={"organization": org})
            user = existing
            action = "Password rotated"
        else:
            # First-time creation
            org, _ = Organization.objects.get_or_create(name="__admin__")
            user = User.objects.create_user(
                username=ADMIN_USERNAME,
                email=ADMIN_EMAIL,
                password=password,
                is_staff=True,
            )
            UserProfile.objects.get_or_create(user=user, defaults={"organization": org})
            action = "Admin account created"

        # Write credentials file (owner-readable only)
        try:
            with open(CREDS_FILE, "w") as f:
                f.write(f"email:    {ADMIN_EMAIL}\n")
                f.write(f"password: {password}\n")
                f.write(
                    "\nKEEP THIS FILE SECURE. "
                    "Delete or chmod 600 after noting the password.\n"
                )
            os.chmod(CREDS_FILE, 0o600)
        except OSError as exc:
            self.stderr.write(f"Warning: could not write credentials file: {exc}")

        self.stdout.write(self.style.SUCCESS(
            f"{action}.\n"
            f"  email:    {ADMIN_EMAIL}\n"
            f"  password: {password}\n"
            f"  saved to: {CREDS_FILE}\n"
        ))
