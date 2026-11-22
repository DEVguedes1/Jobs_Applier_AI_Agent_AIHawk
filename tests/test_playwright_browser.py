"""Opt-in browser integration checks; these never submit applications."""

import os
import tempfile
import unittest
from datetime import datetime
from types import SimpleNamespace

from src.logging import _format_loguru_record
from src.utils.chrome_utils import init_browser
from src.utils.playwright_session import By, PageWait, TimeoutException


RUN_BROWSER_TESTS = os.getenv("ATF_RUN_BROWSER_TESTS") == "1"


class PlaywrightUnitTests(unittest.TestCase):
    def test_loguru_keeps_chromedriver_style_braces_literal(self):
        record = {
            "message": "ChromeDriver 158 refs/branch-heads/8127@{#1691}",
            "time": datetime(2026, 1, 1),
            "name": "playwright",
            "function": "test",
            "line": 1,
            "level": SimpleNamespace(name="INFO"),
            "exception": None,
        }
        formatter_result = _format_loguru_record(record)
        self.assertIn("8127@{#1691}", formatter_result.format())


@unittest.skipUnless(RUN_BROWSER_TESTS, "set ATF_RUN_BROWSER_TESTS=1 on a graphical browser host")
class PlaywrightBrowserIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile_dir = tempfile.TemporaryDirectory(prefix="atf-playwright-profile-")
        os.environ.setdefault("ATF_BROWSER", "chrome")
        os.environ["ATF_BROWSER_PROFILE"] = cls.profile_dir.name
        os.environ["ATF_HEADLESS"] = "false"
        cls.session = init_browser()

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "session", None):
            cls.session.quit()
        cls.profile_dir.cleanup()

    def test_browser_initializes_headful(self):
        self.assertFalse(os.getenv("ATF_HEADLESS", "false").lower() == "true")
        self.assertFalse(self.session.page.is_closed())
        self.assertTrue(self.session.browser_version)

    def test_http_https_and_linkedin_navigation(self):
        for url, hostname in (
            ("http://example.com", "example.com"),
            ("https://example.com", "example.com"),
            ("https://www.linkedin.com/login", "linkedin.com"),
        ):
            with self.subTest(url=url):
                self.session.get(url)
                self.assertIn(hostname, self.session.current_url)

    def test_persistent_profile_retains_browser_cookie(self):
        self.session.context.add_cookies([{
            "name": "atf_test_persistence",
            "value": "persisted",
            "url": "https://example.com",
            "httpOnly": True,
        }])
        profile_path = self.session.profile_dir
        self.session.quit()
        os.environ["ATF_BROWSER_PROFILE"] = profile_path
        self.__class__.session = init_browser()
        cookies = self.session.context.cookies("https://example.com")
        self.assertTrue(any(cookie["name"] == "atf_test_persistence" for cookie in cookies))

    def test_job_card_can_be_found_and_clicked(self):
        self.session.page.set_content(
            '<a class="job-card-container__link" href="#job">Open job</a>'
        )
        card = self.session.find_element(By.CSS_SELECTOR, "a.job-card-container__link")
        self.assertTrue(card.get_attribute("href").endswith("#job"))
        card.click()
        self.assertTrue(self.session.current_url.endswith("#job"))

    def test_missing_element_times_out_and_session_remains_usable(self):
        with self.assertRaises(TimeoutException):
            PageWait(self.session, timeout=0.2, poll_frequency=0.05).until(
                lambda page: page.find_elements(By.CSS_SELECTOR, ".atf-element-that-does-not-exist")
            )
        self.assertFalse(self.session.page.is_closed())


if __name__ == "__main__":
    unittest.main()
