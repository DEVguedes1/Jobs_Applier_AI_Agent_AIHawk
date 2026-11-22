"""Small synchronous Playwright session facade used by ATF automation flows.

The facade centralizes navigation, locator waits and lifecycle handling while
keeping the existing job-processing routines readable during the migration.
It has no Selenium dependency.
"""

import time
from urllib.parse import urlsplit


class AutomationError(Exception):
    """Base error for browser automation failures."""


class TimeoutException(AutomationError):
    pass


class BrowserAutomationError(AutomationError):
    pass


class BrowserSessionLostError(BrowserAutomationError):
    pass


class StaleLocatorError(AutomationError):
    pass


class ClickBlockedError(AutomationError):
    pass


class By:
    CSS_SELECTOR = "css selector"
    XPATH = "xpath"
    ID = "id"
    CLASS_NAME = "class name"
    TAG_NAME = "tag name"


class Keys:
    ENTER = "Enter"


def _page_is_connected(page):
    try:
        if page.is_closed():
            return False
        browser = page.context.browser
        if browser is not None:
            return browser.is_connected()
        page.evaluate("() => 1")
        return True
    except Exception:
        return False


def _raise_if_session_lost(page, error):
    if not _page_is_connected(page):
        raise BrowserSessionLostError("A sessão Playwright foi desconectada.") from error


def _selector(by, value):
    if by == By.XPATH:
        return f"xpath={value}"
    if by == By.ID:
        return f"#{value}"
    if by == By.CLASS_NAME:
        return "." + ".".join(value.split())
    if by == By.TAG_NAME:
        return value
    return value


class PageElement:
    def __init__(self, page, locator):
        self.page = page
        self.locator = locator

    @property
    def text(self):
        try:
            return self.locator.inner_text(timeout=1000)
        except Exception as error:
            _raise_if_session_lost(self.page, error)
            return ""

    def find_elements(self, by, selector):
        try:
            nested = self.locator.locator(_selector(by, selector))
            return [PageElement(self.page, nested.nth(index)) for index in range(nested.count())]
        except Exception as error:
            _raise_if_session_lost(self.page, error)
            raise BrowserAutomationError(str(error)) from error

    def find_element(self, by, selector):
        elements = self.find_elements(by, selector)
        if not elements:
            raise TimeoutException(f"Elemento não encontrado: {selector}")
        return elements[0]

    def get_attribute(self, name):
        if name in {"value", "checked", "selected"}:
            try:
                return self.locator.evaluate("(element, propertyName) => element[propertyName]", name)
            except Exception as error:
                _raise_if_session_lost(self.page, error)
                return None
        if name == "href":
            try:
                return self.locator.evaluate("element => element.href")
            except Exception as error:
                _raise_if_session_lost(self.page, error)
                return None
        if name == "outerHTML":
            try:
                return self.locator.evaluate("element => element.outerHTML")
            except Exception as error:
                _raise_if_session_lost(self.page, error)
                return None
        return self.locator.get_attribute(name, timeout=1000)

    def is_displayed(self):
        try:
            return self.locator.is_visible(timeout=1000)
        except Exception as error:
            _raise_if_session_lost(self.page, error)
            return False

    def is_enabled(self):
        try:
            return self.locator.is_enabled(timeout=1000)
        except Exception as error:
            _raise_if_session_lost(self.page, error)
            return False

    def is_selected(self):
        try:
            return self.locator.is_checked(timeout=1000)
        except Exception as error:
            _raise_if_session_lost(self.page, error)
            return False

    def click(self):
        from src.logging import logger
        logger.debug("Playwright click attempt")
        try:
            self.locator.click()
        except Exception as error:
            browser = self.page.context.browser
            if self.page.is_closed() or (browser is not None and not browser.is_connected()):
                raise BrowserSessionLostError("A página Playwright foi fechada durante o clique.") from error
            raise ClickBlockedError(str(error)) from error

    def clear(self):
        self.locator.fill("")

    def send_keys(self, value):
        if value == Keys.ENTER:
            self.locator.press("Enter")
        else:
            self.locator.fill(str(value))


class PlaywrightSession:
    """An ATF browser context and its active page."""

    def __init__(self, playwright, context, page, browser_name, profile_dir):
        self.playwright = playwright
        self.context = context
        self.page = page
        self.browser_name = browser_name
        self.profile_dir = profile_dir
        self.browser = context.browser
        self.browser_version = getattr(self.browser, "version", "unknown")
        self.timeout_ms = 30_000
        self.navigation_timeout_ms = self.timeout_ms
        self.page.set_default_timeout(self.timeout_ms)
        self.page.set_default_navigation_timeout(self.timeout_ms)

    @property
    def url(self):
        try:
            return self.page.url
        except Exception as error:
            if not self.is_connected:
                raise BrowserSessionLostError("A sessão Playwright foi desconectada.") from error
            raise BrowserAutomationError(str(error)) from error

    @property
    def is_connected(self):
        return _page_is_connected(self.page)

    def set_navigation_timeout(self, seconds):
        self.navigation_timeout_ms = seconds * 1000
        self.page.set_default_navigation_timeout(self.navigation_timeout_ms)

    def navigate(self, url):
        from src.logging import logger
        parsed = urlsplit(url or "")
        safe_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        started = time.monotonic()
        logger.info("Playwright navigation started: url={}", safe_url)
        try:
            self.page.goto(url, wait_until="domcontentloaded", timeout=self.navigation_timeout_ms)
            page_location = urlsplit(self.url)
            logger.info(
                "Playwright navigation completed: url={} page_url={}://{}{}",
                safe_url,
                page_location.scheme,
                page_location.netloc,
                page_location.path,
            )
        except Exception as error:
            if not self.is_connected:
                raise BrowserSessionLostError("A sessão Playwright foi desconectada durante a navegação.") from error
            logger.exception("Playwright navigation failed: url={} type={}", safe_url, type(error).__name__)
            if type(error).__name__ == "TimeoutError":
                raise TimeoutException(str(error)) from error
            raise BrowserAutomationError(str(error)) from error
        finally:
            elapsed = time.monotonic() - started
            logger.info("Playwright navigation duration={:.2f}s", elapsed)

    def find_elements(self, by, selector):
        locator = self.page.locator(_selector(by, selector))
        try:
            elements = [PageElement(self.page, locator.nth(index)) for index in range(locator.count())]
            from src.logging import logger
            logger.debug("Playwright elements located: selector={} count={}", selector, len(elements))
            return elements
        except Exception as error:
            if not self.is_connected:
                raise BrowserSessionLostError("A sessão Playwright foi desconectada ao localizar elementos.") from error
            raise BrowserAutomationError(str(error)) from error

    def find_element(self, by, selector):
        elements = self.find_elements(by, selector)
        if not elements:
            raise TimeoutException(f"Elemento não encontrado: {selector}")
        return elements[0]

    def close(self):
        try:
            self.context.close()
        finally:
            self.playwright.stop()


class PageWait:
    def __init__(self, session, timeout, poll_frequency=0.25):
        self.session = session
        self.timeout = timeout
        self.poll_frequency = poll_frequency

    def until(self, condition):
        deadline = time.monotonic() + self.timeout
        last_error = None
        while time.monotonic() < deadline:
            try:
                result = condition(self.session)
                if result:
                    return result
            except (TimeoutException, StaleLocatorError) as error:
                last_error = error
            time.sleep(self.poll_frequency)
        message = f"Condição não satisfeita em {self.timeout}s"
        raise TimeoutException(message) from last_error
