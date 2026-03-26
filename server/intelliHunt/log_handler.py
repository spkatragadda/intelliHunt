"""
DailyDirectoryHandler
=====================
A thread-safe logging handler that writes to:

    <base_dir>/<YYYY>/<MM>/<YYYY-MM-DD>.log

A new log file is created for each day.  Intermediate directories are
created automatically.  File handles are switched atomically at midnight
so no log records are dropped across a day boundary.

Usage in Django LOGGING (settings.py):

    "handlers": {
        "daily_file": {
            "()": "intelliHunt.log_handler.DailyDirectoryHandler",
            "base_dir": "/path/to/logs",
            "formatter": "verbose",
        },
    }
"""

import logging
import os
import threading
from datetime import date


class DailyDirectoryHandler(logging.Handler):
    """
    Writes log records to date-partitioned files:
        <base_dir>/<YYYY>/<MM>/<YYYY-MM-DD>.log

    Thread-safe: a reentrant lock guards both the date check and file
    write so that mid-midnight rollovers are atomic.
    """

    def __init__(self, base_dir: str, encoding: str = "utf-8") -> None:
        super().__init__()
        self.base_dir = base_dir
        self.encoding = encoding
        self.terminator = "\n"  # logging.StreamHandler sets this; Handler base does not
        self._lock = threading.RLock()
        self._current_date: date | None = None
        self._stream = None
        # Open the file for today immediately so any startup messages land
        # in the correct file.
        self._rotate()

    # ── internal helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _today() -> date:
        return date.today()

    def _log_path(self, d: date) -> str:
        directory = os.path.join(
            self.base_dir,
            d.strftime("%Y"),
            d.strftime("%m"),
        )
        os.makedirs(directory, exist_ok=True)
        return os.path.join(directory, d.strftime("%Y-%m-%d") + ".log")

    def _rotate(self) -> None:
        """Open (or switch to) today's log file."""
        today = self._today()
        if self._stream is not None:
            try:
                self._stream.flush()
                self._stream.close()
            except OSError:
                pass
        path = self._log_path(today)
        self._stream = open(path, "a", encoding=self.encoding)  # noqa: WPS515
        self._current_date = today

    # ── public interface ──────────────────────────────────────────────────────

    def emit(self, record: logging.LogRecord) -> None:
        with self._lock:
            # Roll over if the calendar date has advanced.
            if self._today() != self._current_date:
                self._rotate()
            try:
                msg = self.format(record)
                self._stream.write(msg + self.terminator)
                self._stream.flush()
            except Exception:  # noqa: BLE001
                self.handleError(record)

    def flush(self) -> None:
        with self._lock:
            if self._stream:
                try:
                    self._stream.flush()
                except OSError:
                    pass

    def close(self) -> None:
        with self._lock:
            try:
                if self._stream:
                    self._stream.flush()
                    self._stream.close()
                    self._stream = None
            finally:
                super().close()
