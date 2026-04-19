"""
Helpers to add/replace/remove APScheduler jobs from a running scheduler
instance based on ScheduleConfig model rows.
"""
import logging

from apscheduler.triggers.cron import CronTrigger

from .scheduler_jobs import run_scheduled_report, prune_old_artifacts_job, run_deep_research

logger = logging.getLogger("intelliHunt")


def _job_id(org_id) -> str:
    return f"org_{org_id}_scheduled_report"


def upsert_job(scheduler, config):
    """
    Add or replace the APScheduler cron job for a single ScheduleConfig row.
    If config.enabled is False, the job is removed instead.
    """
    job_id = _job_id(config.organization_id)

    if not config.enabled:
        remove_job(scheduler, config.organization_id)
        return

    if config.frequency == 'daily':
        trigger = CronTrigger(hour=config.hour, minute=0)
    elif config.frequency == 'weekly':
        trigger = CronTrigger(day_of_week=config.day_of_week, hour=config.hour, minute=0)
    else:  # monthly
        trigger = CronTrigger(day=config.day_of_month, hour=config.hour, minute=0)

    org_id_str = str(config.organization_id)

    try:
        scheduler.add_job(
            run_scheduled_report,
            trigger=trigger,
            id=job_id,
            args=[org_id_str],
            replace_existing=True,
            misfire_grace_time=3600,  # allow up to 1h late start
        )
        logger.info("[scheduler] upserted job %s (%s @ hour=%s)", job_id, config.frequency, config.hour)
    except Exception:
        logger.exception("[scheduler] failed to upsert job %s", job_id)


def remove_job(scheduler, org_id):
    """Remove the scheduled job for an org if it exists."""
    job_id = _job_id(org_id)
    try:
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
            logger.info("[scheduler] removed job %s", job_id)
    except Exception:
        logger.exception("[scheduler] failed to remove job %s", job_id)


def sync_all_jobs(scheduler):
    """
    At scheduler startup, load all enabled ScheduleConfig rows and register
    their jobs. Called once from the management command before scheduler.start().
    """
    from .models import ScheduleConfig

    configs = ScheduleConfig.objects.filter(enabled=True).select_related('organization')
    count = 0
    for config in configs:
        upsert_job(scheduler, config)
        count += 1
    logger.info("[scheduler] synced %d job(s) from database", count)

    # Register the daily artifact-pruning housekeeping job (02:00 UTC)
    try:
        scheduler.add_job(
            prune_old_artifacts_job,
            trigger=CronTrigger(hour=2, minute=0),
            id="global_prune_old_artifacts",
            replace_existing=True,
            misfire_grace_time=3600,
        )
        logger.info("[scheduler] registered prune_old_artifacts_job (daily 02:00 UTC)")
    except Exception:
        logger.exception("[scheduler] failed to register prune_old_artifacts_job")

    # Register deep research jobs for orgs that have it enabled
    _sync_deep_research_jobs(scheduler)


# ── Deep research scheduling ────────────────────────────────────────────────

def _deep_research_job_id(org_id) -> str:
    return f"org_{org_id}_deep_research"


def upsert_deep_research_job(scheduler, config):
    """Add or replace the deep research cron job for a GraphResearchConfig row."""
    job_id = _deep_research_job_id(config.organization_id)

    if not config.enabled:
        remove_deep_research_job(scheduler, config.organization_id)
        return

    if config.frequency == "daily":
        trigger = CronTrigger(hour=config.hour, minute=30)
    elif config.frequency == "biweekly":
        # Run every other week on the configured day
        trigger = CronTrigger(day_of_week=config.day_of_week, hour=config.hour,
                              minute=30, week="*/2")
    else:  # weekly (default)
        trigger = CronTrigger(day_of_week=config.day_of_week, hour=config.hour, minute=30)

    org_id_str = str(config.organization_id)

    try:
        scheduler.add_job(
            run_deep_research,
            trigger=trigger,
            id=job_id,
            args=[org_id_str],
            replace_existing=True,
            misfire_grace_time=7200,
        )
        logger.info("[scheduler] upserted deep research job %s (%s @ hour=%s)",
                    job_id, config.frequency, config.hour)
    except Exception:
        logger.exception("[scheduler] failed to upsert deep research job %s", job_id)


def remove_deep_research_job(scheduler, org_id):
    """Remove the deep research job for an org if it exists."""
    job_id = _deep_research_job_id(org_id)
    try:
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
            logger.info("[scheduler] removed deep research job %s", job_id)
    except Exception:
        logger.exception("[scheduler] failed to remove deep research job %s", job_id)


def _sync_deep_research_jobs(scheduler):
    """Load all enabled GraphResearchConfig rows and register their jobs."""
    try:
        from .models import GraphResearchConfig
        configs = GraphResearchConfig.objects.filter(enabled=True)
        count = 0
        for config in configs:
            upsert_deep_research_job(scheduler, config)
            count += 1
        if count:
            logger.info("[scheduler] synced %d deep research job(s)", count)
    except Exception:
        logger.debug("[scheduler] GraphResearchConfig not available yet — skipping")
