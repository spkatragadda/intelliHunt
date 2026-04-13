from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reportApp", "0008_scheduleconfig_retention"),
    ]

    operations = [
        migrations.AddField(
            model_name="scanresult",
            name="scan_level",
            field=models.CharField(default="speed", max_length=10),
        ),
    ]
