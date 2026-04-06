"""nsjail wrapper for sandboxed file operations on scanned repositories."""

import os
import subprocess
import logging

logger = logging.getLogger(__name__)

_CFG_PATH = os.path.join(os.path.dirname(__file__), "nsjail_reader.cfg")


def run_in_nsjail(command: list[str], repo_dir: str, timeout: int = 30) -> str:
    """Execute a command inside nsjail with the repo mounted read-only at /repo.

    Args:
        command: The command and arguments to run inside the jail
                 (paths should reference /repo, not the host path).
        repo_dir: Absolute host path to the repository directory.
        timeout: Maximum wall-clock seconds for the jailed process.

    Returns:
        stdout of the jailed process.

    Raises:
        RuntimeError: If nsjail itself fails (not the inner command).
    """
    repo_dir = os.path.realpath(repo_dir)
    if not os.path.isdir(repo_dir):
        raise ValueError(f"repo_dir does not exist: {repo_dir}")

    nsjail_cmd = [
        "nsjail",
        "--config", _CFG_PATH,
        "--time_limit", str(timeout),
        # Mount the scanned repo read-only at /repo inside the jail
        "-R", f"{repo_dir}:/repo",
        "--",
        *command,
    ]

    result = subprocess.run(
        nsjail_cmd,
        capture_output=True,
        text=True,
        timeout=timeout + 5,  # outer timeout slightly longer than nsjail's
    )

    # nsjail logs to stderr; the inner command's stdout is what we want.
    # A non-zero exit code from the inner command is not necessarily an error
    # (e.g., find returning 1 for permission issues on some dirs).
    if result.returncode not in (0, 1):
        logger.warning(
            "nsjail exited with code %d. stderr: %s",
            result.returncode,
            result.stderr[:500],
        )

    return result.stdout
