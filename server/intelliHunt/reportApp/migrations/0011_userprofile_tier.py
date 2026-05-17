from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reportApp", "0010_notification_remove_activitylog_act_org_ts_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="tier",
            field=models.CharField(
                choices=[("free", "Free"), ("pro", "Pro")],
                default="free",
                max_length=10,
            ),
        ),
    ]
