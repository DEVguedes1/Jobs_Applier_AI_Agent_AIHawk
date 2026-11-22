import os
import sys
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.edge.service import Service as EdgeService
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.firefox.service import Service as FirefoxService
import urllib
from src.logging import logger
from src.utils.automation_settings import PAGE_LOAD_TIMEOUT

def _env_enabled(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def chrome_browser_options():
    logger.debug("Setting Chrome browser options")
    options = ChromeOptions()
    options.page_load_strategy = "eager"
    options.add_argument("--start-maximized")
    options.add_argument("--disable-extensions")
    options.add_argument("window-size=1200x800")
    options.add_argument("--incognito")
    if _env_enabled("ATF_HEADLESS"):
        options.add_argument("--headless=new")
    # These flags are Linux-only and opt-in because disabling the sandbox weakens
    # browser isolation. They are useful only in constrained container runtimes.
    if sys.platform.startswith("linux"):
        options.add_argument("--disable-dev-shm-usage")
        if _env_enabled("ATF_CHROME_NO_SANDBOX"):
            options.add_argument("--no-sandbox")
    return options


def _browser_configuration():
    browser_name = os.getenv("ATF_BROWSER", "chrome").strip().lower()
    logger.info("Browser solicitado: {}", browser_name)
    if browser_name not in {"chrome", "edge", "firefox"}:
        raise ValueError("ATF_BROWSER deve ser chrome, edge ou firefox.")

    if browser_name == "chrome":
        options = chrome_browser_options()
        service_class = ChromeService
        driver_env = "ATF_CHROMEDRIVER"
        constructor = webdriver.Chrome
    elif browser_name == "edge":
        options = EdgeOptions()
        options.page_load_strategy = "eager"
        if _env_enabled("ATF_HEADLESS"):
            options.add_argument("--headless=new")
        service_class = EdgeService
        driver_env = "ATF_EDGEDRIVER"
        constructor = webdriver.Edge
    else:
        options = FirefoxOptions()
        options.page_load_strategy = "eager"
        if _env_enabled("ATF_HEADLESS"):
            options.add_argument("-headless")
        service_class = FirefoxService
        driver_env = "ATF_GECKODRIVER"
        constructor = webdriver.Firefox
    return browser_name, options, service_class, driver_env, constructor


def init_browser():
    try:
        browser_name, options, service_class, driver_env, constructor = _browser_configuration()
        remote_url = os.getenv("ATF_SELENIUM_REMOTE_URL", "").strip()
        driver_path = os.getenv(driver_env, "").strip()

        if remote_url:
            logger.info("Inicializando WebDriver remoto; endpoint ocultado nos logs")
            driver = webdriver.Remote(command_executor=remote_url, options=options)
            execution = "remote WebDriver"
        else:
            service = service_class(executable_path=driver_path) if driver_path else None
            # Selenium Manager is used automatically when no explicit Service path
            # is supplied. This avoids stale third-party driver cache selection.
            method = "driver configurado por ambiente" if service else "Selenium Manager"
            logger.info("Inicializando navegador via {}", method)
            driver = constructor(options=options, **({"service": service} if service else {}))
            execution = f"driver={driver_path or 'Selenium Manager'}"

        driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
        capabilities = getattr(driver, "capabilities", {}) or {}
        browser_version = capabilities.get("browserVersion", "unknown")
        if browser_name == "chrome":
            driver_version = (capabilities.get("chrome") or {}).get("chromedriverVersion", "unknown")
        elif browser_name == "edge":
            driver_version = (capabilities.get("ms:edgeOptions") or {}).get("msedgedriverVersion", "unknown")
        else:
            driver_version = (capabilities.get("moz:geckodriverVersion") or "unknown")
        logger.info(
            "Browser session initialized: browser={} browserVersion={} driverVersion={} {} headless={} pageLoadTimeout={}s",
            browser_name,
            browser_version,
            driver_version,
            execution,
            _env_enabled("ATF_HEADLESS"),
            PAGE_LOAD_TIMEOUT,
        )
        return driver
    except Exception as e:
        logger.exception("Failed to initialize browser: {}", e)
        raise RuntimeError(f"Falha ao inicializar navegador: {type(e).__name__}: {e}") from e



def HTML_to_PDF(html_content, driver):
    """
    Converte una stringa HTML in un PDF e restituisce il PDF come stringa base64.

    :param html_content: Stringa contenente il codice HTML da convertire.
    :param driver: Istanza del WebDriver di Selenium.
    :return: Stringa base64 del PDF generato.
    :raises ValueError: Se l'input HTML non è una stringa valida.
    :raises RuntimeError: Se si verifica un'eccezione nel WebDriver.
    """
    # Validazione del contenuto HTML
    if not isinstance(html_content, str) or not html_content.strip():
        raise ValueError("Il contenuto HTML deve essere una stringa non vuota.")

    # Codifica l'HTML in un URL di tipo data
    encoded_html = urllib.parse.quote(html_content)
    data_url = f"data:text/html;charset=utf-8,{encoded_html}"

    try:
        driver.get(data_url)
        # Attendi che la pagina si carichi completamente
        time.sleep(2)  # Potrebbe essere necessario aumentare questo tempo per HTML complessi

        # Esegue il comando CDP per stampare la pagina in PDF
        pdf_base64 = driver.execute_cdp_cmd("Page.printToPDF", {
            "printBackground": True,          # Includi lo sfondo nella stampa
            "landscape": False,               # Stampa in verticale (False per ritratto)
            "paperWidth": 8.27,               # Larghezza del foglio in pollici (A4)
            "paperHeight": 11.69,             # Altezza del foglio in pollici (A4)
            "marginTop": 0.8,                  # Margine superiore in pollici (circa 2 cm)
            "marginBottom": 0.8,               # Margine inferiore in pollici (circa 2 cm)
            "marginLeft": 0.5,                 # Margine sinistro in pollici (circa 1.27 cm)
            "marginRight": 0.5,                # Margine destro in pollici (circa 1.27 cm)
            "displayHeaderFooter": False,      # Non visualizzare intestazioni e piè di pagina
            "preferCSSPageSize": True,         # Preferire le dimensioni della pagina CSS
            "generateDocumentOutline": False,  # Non generare un sommario del documento
            "generateTaggedPDF": False,        # Non generare PDF taggato
            "transferMode": "ReturnAsBase64"   # Restituire il PDF come stringa base64
        })
        return pdf_base64['data']
    except Exception as e:
        logger.error(f"Si è verificata un'eccezione WebDriver: {e}")
        raise RuntimeError(f"Si è verificata un'eccezione WebDriver: {e}")
