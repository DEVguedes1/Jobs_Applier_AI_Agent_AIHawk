"""Runtime settings shared by browser startup, search, and diagnostics."""

import os


def _positive_seconds(name, default):
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{name} deve ser um inteiro positivo.") from error
    if value < 1 or value > 600:
        raise ValueError(f"{name} deve estar entre 1 e 600 segundos.")
    return value


PAGE_LOAD_TIMEOUT = _positive_seconds("ATF_PAGE_LOAD_TIMEOUT", 45)
RESULTS_WAIT_TIMEOUT = _positive_seconds("ATF_RESULTS_WAIT_TIMEOUT", 20)
CARD_CLICK_TIMEOUT = _positive_seconds("ATF_CARD_CLICK_TIMEOUT", 8)
DETAIL_WAIT_TIMEOUT = _positive_seconds("ATF_DETAIL_WAIT_TIMEOUT", 10)
FORM_WAIT_TIMEOUT = _positive_seconds("ATF_FORM_WAIT_TIMEOUT", 10)

LOG_LEVEL = os.getenv("ATF_LOG_LEVEL", "INFO").strip().upper()
if LOG_LEVEL not in {"DEBUG", "INFO", "WARNING", "ERROR"}:
    LOG_LEVEL = "INFO"

ALLOW_REAL_APPLICATIONS = os.getenv("ATF_ALLOW_REAL_APPLICATIONS", "false").strip().lower() in {
    "1", "true", "yes", "on"
}
