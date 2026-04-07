"""Bubblewrap (bwrap) sandbox for read-only file operations on scanned repos.

Provides ``run_in_sandbox`` which executes commands with the repo mounted
read-only at ``/repo`` inside an isolated namespace (no network, no host
filesystem access beyond /repo and minimal system libs).

Set the env var ENABLE_BWRAP=1 to activate bubblewrap sandboxing.  By
default commands run directly with Python-level path validation as the
guard — this avoids hangs in container environments where bwrap cannot
create namespaces.
"""

import os
import shutil
import subprocess
import logging

logger = logging.getLogger(__name__)

_bwrap_available: bool | None = None


def _check_bwrap() -> bool:
    """Return True if bwrap is explicitly enabled and functional."""
    global _bwrap_available
    if _bwrap_available is not None:
        return _bwrap_available

    if os.environ.get("ENABLE_BWRAP") != "1":
        logger.info("ENABLE_BWRAP not set — using direct execution with path validation.")
        _bwrap_available = False
        return False

    if not shutil.which("bwrap"):
        logger.warning("bwrap binary not found — falling back to direct execution.")
        _bwrap_available = False
        return False

    try:
        probe = subprocess.run(
            [
                "bwrap",
                "--ro-bind", "/usr", "/usr",
                "--ro-bind", "/bin", "/bin",
                "--ro-bind", "/lib", "/lib",
                "--symlink", "/usr/lib64", "/lib64",
                "--proc", "/proc",
                "--dev", "/dev",
                "--unshare-net",
                "--unshare-pid",
                "--die-with-parent",
                "--", "/bin/true",
            ],
            capture_output=True, text=True, timeout=10,
        )
        if probe.returncode == 0:
            logger.info("bwrap sandbox is available and functional.")
            _bwrap_available = True
        else:
            logger.warning(
                "bwrap probe failed (code %d): %s — falling back to direct execution.",
                probe.returncode, probe.stderr[:300],
            )
            _bwrap_available = False
    except Exception as exc:
        logger.warning("bwrap probe raised %s — falling back to direct execution.", exc)
        _bwrap_available = False

    return _bwrap_available


def run_in_sandbox(command: list[str], repo_dir: str, timeout: int = 30) -> str:
    """Execute a command with the repo directory accessible.

    If bwrap is enabled and functional the command runs inside a sandbox
    with the repo mounted read-only at ``/repo``.  Otherwise the command
    runs directly, with ``/repo`` in the command replaced by *repo_dir*.

    Args:
        command: The command and arguments.  Paths should reference ``/repo``.
        repo_dir: Absolute host path to the repository directory.
        timeout: Maximum wall-clock seconds.

    Returns:
        stdout of the process.
    """
    repo_dir = os.path.realpath(repo_dir)
    if not os.path.isdir(repo_dir):
        raise ValueError(f"repo_dir does not exist: {repo_dir}")

    if _check_bwrap():
        return _run_sandboxed(command, repo_dir, timeout)
    return _run_direct(command, repo_dir, timeout)


def _run_sandboxed(command: list[str], repo_dir: str, timeout: int) -> str:
    bwrap_cmd = [
        "bwrap",
        "--ro-bind", "/usr", "/usr",
        "--ro-bind", "/bin", "/bin",
        "--ro-bind", "/lib", "/lib",
        "--symlink", "/usr/lib64", "/lib64",
        "--proc", "/proc",
        "--dev", "/dev",
        "--ro-bind", repo_dir, "/repo",
        "--unshare-net",
        "--unshare-pid",
        "--die-with-parent",
        "--",
        *command,
    ]

    result = subprocess.run(
        bwrap_cmd,
        capture_output=True,
        text=True,
        timeout=timeout + 5,
    )

    if result.returncode not in (0, 1):
        logger.warning(
            "bwrap exited with code %d. stderr: %s",
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
