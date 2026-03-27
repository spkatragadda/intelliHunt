"""
Add a non-unique index on auth_user.email.

Every login does User.objects.get(email=email).  Django's default auth_user
table has no index on the email column, so that query is a sequential scan.
This migration adds a btree index to make it O(log n) on PostgreSQL.

The index is named explicitly so it can be dropped cleanly on reverse.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("reportApp", "0002_activitylog_scanresult"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                CREATE INDEX IF NOT EXISTS auth_user_email_idx
                ON auth_user (email);
            """,
            reverse_sql="DROP INDEX IF EXISTS auth_user_email_idx;",
        ),
    ]
