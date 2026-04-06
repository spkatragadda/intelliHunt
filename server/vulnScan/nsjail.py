"""nsjail wrapper for sandboxed file operations on scanned repositories.

Provides a ``run_in_nsjail`` function that attempts to run commands inside
an nsjail sandbox.  If nsjail is unavailable or the container lacks the
required kernel capabilities (SYS_ADMIN, SYS_PTRACE), the wrapper falls
back to running the command directly — the Python-level path validation in
the calling tools still prevents access outside the scan sandbox.
"""

import os
import shutil
import subprocess
import logging

logger = logging.getLogger(__name__)

_CFG_PATH = os.path.join(os.path.dirname(__file__), "nsjail_reader.cfg")

# Determined once at import time so we don't retry a broken nsjail on every call.
_nsjail_available: bool | None = None


def _check_nsjail() -> bool:
    """Return True if nsjail is installed and can create namespaces."""
    global _nsjail_available
    if _nsjail_available is not None:
        return _nsjail_available

    if not shutil.which("nsjail"):
        logger.warning("nsjail binary not found on PATH — falling back to direct execution.")
        _nsjail_available = False
        return False

    # Quick smoke-test: ask nsjail to run `true` in a minimal jail.
    try:
        probe = subprocess.run(
            ["nsjail", "--config", _CFG_PATH, "--time_limit", "5",
             "-R", "/tmp:/repo", "--", "/bin/true"],
            capture_output=True, text=True, timeout=10,
        )
        if probe.returncode == 0:
            logger.info("nsjail sandbox is available and functional.")
            _nsjail_available = True
        else:
            logger.warning(
                "nsjail probe failed (code %d): %s — falling back to direct execution.",
                probe.returncode, probe.stderr[:300],
            )
            _nsjail_available = False
    except Exception as exc:
        logger.warning("nsjail probe raised %s — falling back to direct execution.", exc)
        _nsjail_available = False

    return _nsjail_available


def run_in_nsjail(command: list[str], repo_dir: str, timeout: int = 30) -> str:
    """Execute a command with the repo directory accessible.

    If nsjail is functional, the command runs inside a jail with the repo
    mounted read-only at ``/repo``.  Otherwise the command runs directly,
    with ``/repo`` in the command replaced by *repo_dir* so the paths
    still resolve.

    Args:
        command: The command and arguments to run.  Paths inside the
                 command should reference ``/repo``.
        repo_dir: Absolute host path to the repository directory.
        timeout: Maximum wall-clock seconds.

    Returns:
        stdout of the process.
    """
    repo_dir = os.path.realpath(repo_dir)
    if not os.path.isdir(repo_dir):
        raise ValueError(f"repo_dir does not exist: {repo_dir}")

    if _check_nsjail():
        return _run_jailed(command, repo_dir, timeout)
    return _run_direct(command, repo_dir, timeout)


def _run_jailed(command: list[str], repo_dir: str, timeout: int) -> str:
    nsjail_cmd = [
        "nsjail",
        "--config", _CFG_PATH,
        "--time_limit", str(timeout),
        "-R", f"{repo_dir}:/repo",
        "--",
        *command,
    ]

    result = subprocess.run(
        nsjail_cmd,
        capture_output=True,
        text=True,
        timeout=timeout + 5,
    )

    if result.returncode not in (0, 1):
        logger.warning(
            "nsjail exited with code %d. stderr: %s",
            result.returncode, result.stderr[:500],
        )

    return result.stdout


def _run_direct(command: list[str], repo_dir: str, timeout: int) -> str:
    """Fallback: run the command directly, rewriting /repo → repo_dir."""
    rewritten = [arg.replace("/repo", repo_dir) for arg in command]

    result = subprocess.run(
        rewritten,
        capture_output=True,
        text=True,
        timeout=timeout + 5,
    )

    if result.returncode not in (0, 1):
        logger.warning(
            "Direct command exited with code %d. stderr: %s",
            result.returncode, result.stderr[:500],
        )

    return result.stdout
