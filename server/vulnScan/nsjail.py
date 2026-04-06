"""Bubblewrap (bwrap) sandbox for read-only file operations on scanned repos.

Provides ``run_in_sandbox`` which executes commands with the repo mounted
read-only at ``/repo`` inside an isolated namespace (no network, no host
filesystem access beyond /repo and minimal system libs).

If bwrap is unavailable the wrapper falls back to running commands directly —
the Python-level path validation in the calling tools still prevents access
outside the scan sandbox.
"""

import os
import shutil
import subprocess
import logging

logger = logging.getLogger(__name__)

# Determined once at first call so we don't re-probe on every invocation.
_bwrap_available: bool | None = None


def _check_bwrap() -> bool:
    """Return True if bwrap is installed and functional."""
    global _bwrap_available
    if _bwrap_available is not None:
        return _bwrap_available

    if not shutil.which("bwrap"):
        logger.warning("bwrap binary not found on PATH — falling back to direct execution.")
        _bwrap_available = False
        return False

    # Smoke-test: run /bin/true inside a minimal sandbox.
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

    If bwrap is functional the command runs inside a sandbox with the repo
    mounted read-only at ``/repo``.  Otherwise the command runs directly,
    with ``/repo`` in the command replaced by *repo_dir* so paths still
    resolve.

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
        # Minimal read-only system mounts for coreutils (find, head, wc, cat)
        "--ro-bind", "/usr", "/usr",
        "--ro-bind", "/bin", "/bin",
        "--ro-bind", "/lib", "/lib",
        "--symlink", "/usr/lib64", "/lib64",
        "--proc", "/proc",
        "--dev", "/dev",
        # Scanned repo mounted read-only at /repo
        "--ro-bind", repo_dir, "/repo",
        # Isolation
        "--unshare-net",       # no network
        "--unshare-pid",       # isolated PID namespace
        "--die-with-parent",   # kill sandbox if parent dies
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
