"""Shared timestamped, rotating and redacted Python/Playwright logging."""

import logging
import logging.handlers
import os
import re
import sys
import traceback
from pathlib import Path

from loguru import logger

from src.utils.automation_settings import LOG_LEVEL


LOG_DIR = Path(os.getenv("ATF_LOG_DIR", "log")).resolve()
RETENTION_DAYS = 14
_REDACTIONS = (
    (re.compile(r"(?i)(authorization\s*[:=]\s*bearer)\s+[^\s,;]+"), r"\1 [REDACTED]"),
    (re.compile(r"(?i)(kiwi_session=)[^;\s]+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(password|passwd|token|cookie|secret)\s*([:=])\s*([^\s,;&]+)"), r"\1\2[REDACTED]"),
    (re.compile(r"(?i)([?&](?:token|password|session|secret|key)=)[^&#\s]+"), r"\1[REDACTED]"),
)


def redact_log_text(value):
    text = str(value)
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def _format_loguru_record(record):
    message = redact_log_text(record["message"])
    timestamp = record["time"].strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    name = record["name"].rsplit(".", 1)[-1]
    location = f"{name}:{record['function']}:{record['line']}"
    exception = record.get("exception")
    details = ""
    if exception:
        details = "\n" + redact_log_text("".join(traceback.format_exception(*exception)))
    rendered = f"{timestamp} | {record['level'].name:<7} | PYTHON | {location} | {message}{details}\n"
    # Loguru formats callable formatter results with str.format(). Escape braces
    # in already-rendered messages/tracebacks so values such as ChromeDriver's
    # refs/branch-heads/8127@{{#1691}} remain literal text.
    return rendered.replace("{", "{{").replace("}", "}}")


class RedactingFormatter(logging.Formatter):
    def format(self, record):
        record.message = redact_log_text(record.getMessage())
        record.msg = record.message
        record.args = ()
        return super().format(record)


def configure_logging():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logger.remove()
    logger.add(
        sys.stdout,
        level=LOG_LEVEL,
        format=_format_loguru_record,
        backtrace=False,
        diagnose=False,
        enqueue=True,
    )
    logger.add(
        str(LOG_DIR / "atf-python.log"),
        level=LOG_LEVEL,
        format=_format_loguru_record,
        rotation="00:00",
        retention=f"{RETENTION_DAYS} days",
        compression="zip",
        encoding="utf-8",
        backtrace=False,
        diagnose=False,
        enqueue=True,
    )

    playwright_logger = logging.getLogger("playwright")
    playwright_logger.handlers.clear()
    playwright_logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
    playwright_logger.propagate = False
    formatter = RedactingFormatter("%(asctime)s | %(levelname)-7s | PLAYWRIGHT | %(message)s", "%Y-%m-%d %H:%M:%S")
    file_handler = logging.handlers.TimedRotatingFileHandler(
        LOG_DIR / "atf-playwright.log",
        when="midnight",
        interval=1,
        backupCount=RETENTION_DAYS,
        encoding="utf-8",
        utc=True,
    )
    file_handler.setFormatter(formatter)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    playwright_logger.addHandler(file_handler)
    playwright_logger.addHandler(console_handler)


configure_logging()
