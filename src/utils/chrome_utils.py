"""Playwright browser lifecycle and HTML-to-PDF helpers (legacy module path)."""

import base64
import importlib.metadata
import os
import platform
import shutil
import subprocess
from pathlib import Path

from src.logging import logger
from src.utils.automation_settings import PAGE_LOAD_TIMEOUT
from src.utils.playwright_session import PlaywrightSession


def _env_enabled(name, default=False):
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


def _browser_name():
    name = os.getenv("ATF_BROWSER", "chrome").strip().lower()
    if name not in {"chrome", "chromium", "edge", "firefox", "webkit"}:
        raise ValueError("ATF_BROWSER deve ser chrome, chromium, edge, firefox ou webkit.")
    return name


def _detect_browser_version(name, executable):
    candidates = [executable] if executable else []
    if not candidates:
        candidates = {
            "chrome": ["google-chrome", "google-chrome-stable"],
            "chromium": ["chromium", "chromium-browser"],
            "edge": ["microsoft-edge", "msedge"],
            "firefox": ["firefox"],
            "webkit": [],
        }.get(name, [])
    for candidate in candidates:
        command = shutil.which(candidate) or (candidate if Path(candidate).is_file() else None)
        if not command:
            continue
        try:
            result = subprocess.run([command, "--version"], capture_output=True, text=True, timeout=4, check=False)
            version = (result.stdout or result.stderr).strip().splitlines()
            if version:
                return version[0]
        except (OSError, subprocess.TimeoutExpired):
            continue
    return "Playwright-managed browser"


def init_browser():
    """Launch a headed, persistent browser context and return its active page."""
    name = _browser_name()
    profile = Path(os.getenv("ATF_BROWSER_PROFILE", f"data_folder/playwright-profile-{name}")).expanduser().resolve()
    profile.mkdir(parents=True, exist_ok=True)
    executable = os.getenv("ATF_BROWSER_EXECUTABLE_PATH", "").strip() or None
    headless = _env_enabled("ATF_HEADLESS", False)
    playwright = None
    try:
        from playwright.sync_api import sync_playwright

        playwright_version = importlib.metadata.version("playwright")
        playwright = sync_playwright().start()
        browser_type = getattr(playwright, "chromium" if name in {"chrome", "chromium", "edge"} else name)
        launch_options = {"headless": headless}
        if executable:
            launch_options["executable_path"] = executable
        elif name == "chrome":
            launch_options["channel"] = "chrome"
        elif name == "edge":
            launch_options["channel"] = "msedge"
        if platform.system() == "Linux":
            launch_options["args"] = ["--disable-dev-shm-usage"]
        detected_version = _detect_browser_version(name, executable)

        logger.info(
            "Playwright launch: browser={} headless={} profile={} playwright_version={} browser_expected_version={}",
            name,
            headless,
            profile,
            playwright_version,
            detected_version,
        )
        context = browser_type.launch_persistent_context(str(profile), **launch_options)
        page = context.pages[0] if context.pages else context.new_page()
        session = PlaywrightSession(playwright, context, page, name, str(profile))
        if session.browser_version == "unknown":
            session.browser_version = detected_version
        session.set_navigation_timeout(PAGE_LOAD_TIMEOUT)
        page.on("pageerror", lambda error: logger.error("Playwright page error: {}", type(error).__name__))
        page.on("crash", lambda: logger.error("Playwright page crashed; browser session lost"))
        page.on("console", lambda message: logger.error("Browser console error: {}", message.type) if message.type == "error" else None)
        logger.info(
            "Playwright session ready: browser={} browser_version={} playwright_version={} profile={} headless={} navigation_timeout={}s",
            name,
            session.browser_version,
            playwright_version,
            profile,
            headless,
            PAGE_LOAD_TIMEOUT,
        )
        return session
    except Exception as error:
        if playwright is not None:
            try:
                playwright.stop()
            except Exception:
                pass
        logger.exception("Playwright browser initialization failed; type={}", type(error).__name__)
        if type(error).__name__ == "ModuleNotFoundError" and getattr(error, "name", "") == "playwright":
            raise RuntimeError("Playwright não está instalado. Instale requirements.txt e execute 'playwright install chromium'.") from error
        raise RuntimeError(f"Falha ao inicializar navegador Playwright: {type(error).__name__}") from error


def HTML_to_PDF(html_content, driver):
    if not isinstance(html_content, str) or not html_content.strip():
        raise ValueError("O conteúdo HTML deve ser uma string não vazia.")
    try:
        driver.page.set_content(html_content, wait_until="load")
        return base64.b64encode(driver.page.pdf(print_background=True, format="A4")).decode("ascii")
    except Exception as error:
        logger.exception("Falha ao gerar PDF via Playwright; tipo={}", type(error).__name__)
        raise RuntimeError(f"Falha ao gerar PDF via Playwright: {type(error).__name__}") from error
