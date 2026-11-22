"""Emit a safe machine-readable runtime diagnostic for the dashboard startup."""

import importlib.metadata
import json
import os
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def declared_version(package):
    requirements = ROOT / "requirements.txt"
    if not requirements.exists():
        return "not declared"
    pattern = re.compile(rf"^{re.escape(package)}\s*([<>=!~].+)?$", re.IGNORECASE)
    for line in requirements.read_text(encoding="utf-8").splitlines():
        match = pattern.match(line.strip())
        if match:
            return (match.group(1) or "unconstrained").strip()
    return "not declared"


def installed_version(package):
    try:
        return importlib.metadata.version(package)
    except importlib.metadata.PackageNotFoundError:
        return "not installed"


def command_version(command):
    executable = shutil.which(command)
    if not executable:
        return None
    try:
        result = subprocess.run(
            [executable, "--version"],
            capture_output=True,
            text=True,
            timeout=4,
            check=False,
        )
        output = (result.stdout or result.stderr).strip().splitlines()
        return {"path": executable, "version": output[0] if output else f"exit={result.returncode}"}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"path": executable, "version": f"unavailable ({type(error).__name__})"}


def main():
    browser_name = os.getenv("ATF_BROWSER", "chrome").strip().lower()
    browser_commands = {
        "chrome": ("google-chrome", "google-chrome-stable"),
        "chromium": ("chromium", "chromium-browser"),
        "edge": ("msedge", "microsoft-edge", "microsoft-edge-stable"),
        "firefox": ("firefox",),
        "webkit": (),
    }
    browser = next((result for command in browser_commands.get(browser_name, ()) if (result := command_version(command))), None)
    if browser_name == "webkit":
        browser = {"path": "Playwright WebKit", "version": "Playwright-managed WebKit"}
    executable = os.getenv("ATF_BROWSER_EXECUTABLE_PATH", "")
    if executable:
        browser = command_version(executable)
    driver_method = "Playwright persistent browser context; driver management is internal"

    try:
        from src.utils.automation_settings import (
            PAGE_LOAD_TIMEOUT,
            RESULTS_WAIT_TIMEOUT,
            CARD_CLICK_TIMEOUT,
            DETAIL_WAIT_TIMEOUT,
            FORM_WAIT_TIMEOUT,
            ALLOW_REAL_APPLICATIONS,
            LOG_LEVEL,
        )
        timeouts = {
            "page_load_seconds": PAGE_LOAD_TIMEOUT,
            "search_results_seconds": RESULTS_WAIT_TIMEOUT,
            "card_click_seconds": CARD_CLICK_TIMEOUT,
            "job_detail_seconds": DETAIL_WAIT_TIMEOUT,
            "application_form_seconds": FORM_WAIT_TIMEOUT,
        }
        allow_submissions = ALLOW_REAL_APPLICATIONS
        log_level = LOG_LEVEL
    except Exception as error:
        timeouts = {"error": type(error).__name__}
        allow_submissions = False
        log_level = os.getenv("ATF_LOG_LEVEL", "INFO")

    report = {
        "os": {"name": platform.system(), "release": platform.release(), "machine": platform.machine()},
        "node": os.getenv("ATF_NODE_VERSION", "unknown"),
        "python": {"version": platform.python_version(), "executable": sys.executable},
        "playwright": {"installed": installed_version("playwright"), "declared": declared_version("playwright")},
        "browser": {"selected": browser_name, "detected": browser or "not detected"},
        "driver_management": driver_method,
        "execution": {"headless": os.getenv("ATF_HEADLESS", "false"), "persistent_profile": os.getenv("ATF_BROWSER_PROFILE", "data_folder/playwright-profile-" + browser_name), "allow_real_applications": allow_submissions},
        "paths": {"project_root": str(ROOT), "python": sys.executable, "browser": browser.get("path") if browser else "not detected", "browser_executable_override": executable or "not configured"},
        "timeouts": timeouts,
        "log_level": log_level,
    }
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
