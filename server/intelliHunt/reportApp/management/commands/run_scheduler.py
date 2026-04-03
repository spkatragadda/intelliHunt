"""
Management command: python manage.py run_scheduler

Starts a blocking APScheduler process backed by DjangoJobStore (Postgres).
Run this as a separate process alongside gunicorn (via supervisord).
"""
from django.core.management.base import BaseCommand

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.jobstores.django import DjangoJobStore
from django_apscheduler.jobstores import register_events

from intelliHunt.reportApp.schedule_sync import sync_all_jobs


class Command(BaseCommand):
    help = 'Start the APScheduler process for autonomous report runs'

    def handle(self, *args, **options):
        scheduler = BlockingScheduler(timezone='UTC')
        scheduler.add_jobstore(DjangoJobStore(), 'default')
        register_events(scheduler)

        # Load existing enabled schedules from the database
        sync_all_jobs(scheduler)

        # Expose to views so PUT /api/schedule/ can upsert jobs live
        from intelliHunt.reportApp import _scheduler_ref
        _scheduler_ref.scheduler = scheduler

        self.stdout.write('[run_scheduler] Scheduler starting — press Ctrl+C to stop.')
        try:
            scheduler.start()
        except (KeyboardInterrupt, SystemExit):
            self.stdout.write('[run_scheduler] Scheduler stopped.')
            scheduler.shutdown(wait=False)
