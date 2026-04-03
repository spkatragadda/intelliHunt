"""
Module-level reference to the running APScheduler instance.
Set by run_scheduler management command so views can call upsert_job() live.
Only populated in the scheduler process; None in gunicorn workers.
"""
scheduler = None
