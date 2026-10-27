import contextlib
import io
import os
import tempfile
import unittest
from unittest.mock import patch

from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.common.by import By
from urllib3.exceptions import ReadTimeoutError

import main
from src.database import DatabaseManager
from src.utils import chrome_utils


class FakeElement:
    def __init__(self, text="", attributes=None, on_click=None, children=None, visible=True):
        self.text = text
        self.attributes = attributes or {}
        self.on_click = on_click
        self.children = children or {}
        self.visible = visible
        self.clicked = False

    def is_displayed(self):
        return self.visible

    def get_attribute(self, name):
        return self.attributes.get(name)

    def is_selected(self):
        return bool(self.attributes.get("checked"))

    def click(self):
        self.clicked = True
        if self.on_click:
            self.on_click()

    def find_elements(self, by, selector):
        return self.children.get((by, selector), [])

    def find_element(self, by, selector):
        elements = self.find_elements(by, selector)
        if not elements:
            raise LookupError(selector)
        return elements[0]


class FakeDatabase:
    def __init__(self, fail_saves=False):
        self.fail_saves = fail_saves
        self.saved = []
        self.external = []

    def save_or_update_opportunity(self, *args, **kwargs):
        if self.fail_saves:
            raise RuntimeError("simulated SQLite write failure")
        self.saved.append((args, kwargs))
        return "fake-opportunity-id"

    def is_job_registered(self, url):
        return False

    def isolate_external_unregistered(self, **kwargs):
        self.external.append(kwargs)
        return "fake-external-id"


class FakeCard(FakeElement):
    def __init__(self, url, driver):
        super().__init__(on_click=lambda: setattr(driver, "details_open", True))
        link = FakeElement(attributes={"href": url})
        self.children[(By.CSS_SELECTOR, "a.job-card-container__link")] = [link]


class FakeDriver:
    def __init__(
        self,
        *,
        card_urls=(),
        apply_button=True,
        multi_step=False,
        required_value=None,
        confirm_submission=True,
        submit_error=False,
        navigation_error=False,
        results_delay_checks=0,
        page_load_timeout=False,
        remote_read_timeout=False,
        new_search_layout=False,
    ):
        self.current_url = "https://www.linkedin.com/jobs/search/"
        self.requested_urls = []
        self.details_open = False
        self.form_open = False
        self.apply_button_enabled = apply_button
        self.confirm_submission = confirm_submission
        self.submit_error = submit_error
        self.navigation_error = navigation_error
        self.results_delay_checks = results_delay_checks
        self.result_checks = 0
        self.page_load_timeout = page_load_timeout
        self.remote_read_timeout = remote_read_timeout
        self.new_search_layout = new_search_layout
        self.cards = [FakeCard(url, self) for url in card_urls]
        self.required_field = (
            FakeElement(attributes={"required": "true", "value": required_value})
            if required_value is not None
            else None
        )
        self.submit_button = FakeElement(
            attributes={"aria-label": "Submit application"},
            on_click=self._submit,
        )
        self.next_button = FakeElement(
            text="Continue",
            attributes={"aria-label": "Continue"},
            on_click=self._advance_step,
        )
        self.close_button = FakeElement(
            attributes={"aria-label": "Dismiss"},
            on_click=self._close_form,
        )
        self.apply_button = FakeElement(text="Easy Apply", on_click=self._open_form)
        self.dialog = FakeElement()
        self.multi_step = multi_step
        self.form_step = 0
        self.confirmation = FakeElement(text="Your application was sent")

    def _open_form(self):
        self.form_open = True
        self.form_step = 0
        self.submit_button.clicked = False

    def _advance_step(self):
        self.form_step += 1

    def _close_form(self):
        self.form_open = False

    def _submit(self):
        if self.submit_error:
            raise WebDriverException("simulated send failure")

    def get(self, url):
        if self.navigation_error:
            raise WebDriverException("simulated navigation failure")
        self.requested_urls.append(url)
        self.current_url = (
            "https://www.linkedin.com/jobs/search-results/?currentJobId=20"
            if self.new_search_layout
            else url
        )
        if self.remote_read_timeout:
            raise ReadTimeoutError(None, "http://localhost:1234", "simulated ChromeDriver read timeout")
        if self.page_load_timeout:
            raise TimeoutException("simulated page load timeout")

    def execute_script(self, *_args):
        return None

    def find_elements(self, by, selector):
        if (by, selector) == (By.CSS_SELECTOR, ".job-card-container"):
            self.result_checks += 1
            if self.result_checks <= self.results_delay_checks:
                return []
            return [] if self.new_search_layout else self.cards
        if (by, selector) == (By.CSS_SELECTOR, "li[data-occludable-job-id]"):
            return self.cards if self.new_search_layout else []
        if (by, selector) == (By.CSS_SELECTOR, ".scaffold-layout__list"):
            return [FakeElement()] if self.new_search_layout else []
        if by == By.TAG_NAME and selector == "body":
            results_loaded = self.result_checks > self.results_delay_checks
            text = "No matching jobs found" if not self.cards and results_loaded else ""
            return [FakeElement(text=text)]
        if by == By.CLASS_NAME and selector == "job-details-jobs-unified-top-card__job-title":
            return [FakeElement(text="Junior Developer")] if self.details_open else []
        if by == By.CLASS_NAME and selector == "job-details-jobs-unified-top-card__company-name":
            return [FakeElement(text="Example Co")] if self.details_open else []
        if by == By.CSS_SELECTOR and selector in (
            ".job-details-jobs-unified-top-card__job-title",
            ".jobs-unified-top-card__job-title",
            "[data-test-job-title]",
            "main h1",
        ):
            return [FakeElement(text="Junior Developer")] if self.details_open else []
        if by == By.CSS_SELECTOR and selector in (
            ".job-details-jobs-unified-top-card__company-name",
            ".jobs-unified-top-card__company-name",
            "[data-test-job-company-name]",
        ):
            return [FakeElement(text="Example Co")] if self.details_open else []
        if by == By.CLASS_NAME and selector == "jobs-apply-button--top-card":
            return [self.apply_button] if self.details_open and self.apply_button_enabled else []
        if by == By.CSS_SELECTOR and selector == "button.jobs-apply-button":
            return []
        if by == By.CSS_SELECTOR and selector == "div[role='dialog'], .jobs-easy-apply-content":
            return [self.dialog] if self.form_open else []
        if by == By.CSS_SELECTOR and selector == "div[role='dialog'], .artdeco-inline-feedback, [role='alert']":
            return [self.confirmation] if self.confirm_submission and self.submit_button.clicked else []
        if by == By.XPATH:
            return []
        return []

    def find_element(self, by, selector):
        elements = self.find_elements(by, selector)
        if not elements:
            raise LookupError(selector)
        return elements[0]

    def _dialog_elements(self, by, selector):
        if by == By.CSS_SELECTOR and selector == (
            "button[aria-label='Dismiss'], button[aria-label='Close'], "
            "button[aria-label='Fechar'], button[data-test-modal-close-btn]"
        ):
            return [self.close_button] if self.form_open else []
        if by == By.CSS_SELECTOR and selector.startswith("button[aria-label="):
            is_final_step = not self.multi_step or self.form_step > 0
            return [self.submit_button] if self.form_open and is_final_step else []
        if by == By.CSS_SELECTOR and "input[required]" in selector:
            return [self.required_field] if self.form_open and self.required_field else []
        if by == By.XPATH and selector == ".//button":
            if not self.form_open:
                return []
            if self.multi_step and self.form_step == 0:
                return [self.next_button]
            return [self.submit_button]
        if by == By.XPATH and "Submit application" in selector:
            is_final_step = not self.multi_step or self.form_step > 0
            return [self.submit_button] if self.form_open and is_final_step else []
        if by == By.XPATH and "Avançar" in selector:
            return [
                self.next_button
            ] if self.form_open and self.multi_step and self.form_step == 0 else []
        return []


class ImmediateWait:
    def __init__(self, driver, _timeout):
        self.driver = driver

    def until(self, condition):
        result = condition(self.driver)
        if not result:
            raise TimeoutException("simulated wait timeout")
        return result


def configure_dialog(driver):
    driver.dialog.find_elements = driver._dialog_elements


class ApplicationFlowTests(unittest.TestCase):
    def run_search(self, driver, database=None):
        configure_dialog(driver)
        with patch.object(main, "WebDriverWait", ImmediateWait), patch.object(main.time, "sleep"):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                result = main.search_jobs(
                    driver,
                    ["Junior Developer"],
                    ["Remote"],
                    db=database or FakeDatabase(),
                )
        return result, output.getvalue()

    def test_search_without_results_is_reported(self):
        result, output = self.run_search(FakeDriver())
        self.assertEqual(result, (0, 0))
        self.assertIn("Nenhuma vaga encontrada", output)
        self.assertIn("Nenhuma vaga elegível", output)

    def test_found_job_without_apply_button_is_not_eligible(self):
        database = FakeDatabase()
        result, output = self.run_search(
            FakeDriver(card_urls=["https://www.linkedin.com/jobs/view/1"], apply_button=False),
            database,
        )
        self.assertEqual(result, (1, 0))
        self.assertIn("Elegíveis: 0", output)
        self.assertEqual(database.saved[0][0][4], "Ignorada: botão Easy Apply não identificado.")
        self.assertFalse(database.saved[0][0][5])

    def test_duplicate_job_is_attempted_only_once_in_one_run(self):
        database = FakeDatabase()
        url = "https://www.linkedin.com/jobs/view/2/"
        result, output = self.run_search(FakeDriver(card_urls=[url, url]), database)
        self.assertEqual(result, (2, 1))
        self.assertIn("Vaga duplicada nesta execução", output)
        self.assertEqual(len(database.saved), 1)

    def test_search_continues_after_successful_application(self):
        database = FakeDatabase()
        driver = FakeDriver(
            card_urls=[
                "https://www.linkedin.com/jobs/view/20",
                "https://www.linkedin.com/jobs/view/21",
            ]
        )
        result, output = self.run_search(driver, database)
        self.assertEqual(result, (2, 2))
        self.assertEqual(len(database.saved), 2)
        self.assertIn("Confirmadas: 2", output)
        self.assertFalse(driver.form_open)

    def test_multistep_form_advances_and_submits_when_required_fields_are_complete(self):
        driver = FakeDriver(multi_step=True)
        driver.form_open = True
        configure_dialog(driver)
        with patch.object(main, "WebDriverWait", ImmediateWait):
            status, confirmed = main.tentar_aplicar_sozinho(driver)
        self.assertIn("Enviada e confirmada", status)
        self.assertTrue(confirmed)
        self.assertTrue(driver.submit_button.clicked)

    def test_easy_apply_modal_timeout_is_reported(self):
        driver = FakeDriver()
        configure_dialog(driver)
        with patch.object(main, "WebDriverWait", ImmediateWait):
            status, confirmed = main.tentar_aplicar_sozinho(driver)
        self.assertIn("não abriu dentro do tempo limite", status)
        self.assertFalse(confirmed)

    def test_unanswered_multistep_application_stays_pending_and_search_continues(self):
        database = FakeDatabase()
        driver = FakeDriver(
            card_urls=[
                "https://www.linkedin.com/jobs/view/8",
                "https://www.linkedin.com/jobs/view/9",
            ],
            multi_step=True,
            required_value="",
        )
        result, output = self.run_search(driver, database)
        self.assertEqual(result, (2, 0))
        self.assertIn("campos obrigatórios sem resposta", output)
        self.assertIn("continuando a busca", output)
        self.assertEqual(len(database.saved), 2)
        self.assertTrue(all(not saved[1]["is_success"] for saved in database.saved))
        self.assertFalse(driver.submit_button.clicked)
        self.assertFalse(driver.form_open)

    def test_unanswered_required_field_is_not_submitted(self):
        driver = FakeDriver(required_value="")
        driver.form_open = True
        configure_dialog(driver)
        with patch.object(main, "WebDriverWait", ImmediateWait):
            status, confirmed = main.tentar_aplicar_sozinho(driver)
        self.assertIn("campos obrigatórios", status)
        self.assertFalse(confirmed)
        self.assertFalse(driver.submit_button.clicked)

    def test_search_waits_for_delayed_results_without_fixed_timeout(self):
        driver = FakeDriver(
            card_urls=["https://www.linkedin.com/jobs/view/23"],
            results_delay_checks=35,
        )
        result, output = self.run_search(driver)
        self.assertEqual(result, (1, 1))
        self.assertIn("sem limite fixo de tempo", output)
        self.assertGreater(driver.result_checks, 30)

    def test_results_are_processed_when_only_full_page_load_times_out(self):
        driver = FakeDriver(
            card_urls=["https://www.linkedin.com/jobs/view/10"],
            page_load_timeout=True,
        )
        result, output = self.run_search(driver)
        self.assertEqual(result, (1, 1))
        self.assertIn("verificando se os resultados já estão disponíveis", output)

    def test_search_results_route_with_updated_list_markup_is_processed(self):
        driver = FakeDriver(
            card_urls=["https://www.linkedin.com/jobs/view/22"],
            new_search_layout=True,
        )
        result, output = self.run_search(driver)
        self.assertEqual(result, (1, 1))
        self.assertIn("Vaga elegível", output)
        self.assertIn("location=Remote", driver.requested_urls[0])
        self.assertIn("keywords=Junior+Developer", driver.requested_urls[0])
        self.assertNotIn("f_AL=", driver.requested_urls[0])

    def test_search_reads_job_link_from_updated_card_anchor(self):
        driver = FakeDriver(
            card_urls=["https://www.linkedin.com/jobs/view/24"],
            new_search_layout=True,
        )
        card = driver.cards[0]
        card.children[(By.CSS_SELECTOR, "a.job-card-container__link")] = []
        card.children[(By.CSS_SELECTOR, "a[href*='/jobs/view/']")] = [
            FakeElement(attributes={"href": "https://www.linkedin.com/jobs/view/24/?tracking=search"})
        ]
        result, output = self.run_search(driver)
        self.assertEqual(result, (1, 1))
        self.assertIn("Vaga elegível", output)

    def test_search_builds_job_link_from_updated_card_id(self):
        driver = FakeDriver(
            card_urls=["https://www.linkedin.com/jobs/view/25"],
            new_search_layout=True,
        )
        card = driver.cards[0]
        card.attributes["data-occludable-job-id"] = "urn:li:jobPosting:25"
        card.children[(By.CSS_SELECTOR, "a.job-card-container__link")] = []
        result, output = self.run_search(driver)
        self.assertEqual(result, (1, 1))
        self.assertIn("Vaga elegível", output)

    def test_chromedriver_read_timeout_stops_further_searches(self):
        driver = FakeDriver(remote_read_timeout=True)
        result, output = self.run_search(driver)
        self.assertEqual(result, (0, 0))
        self.assertIn("ChromeDriver não respondeu", output)
        self.assertIn("Busca interrompida", output)

    def test_navigation_failure_is_reported_without_claiming_application(self):
        driver = FakeDriver(navigation_error=True)
        result, output = self.run_search(driver)
        self.assertEqual(result, (0, 0))
        self.assertIn("Falha de navegação na busca", output)

    def test_submission_exception_is_saved_as_failure(self):
        database = FakeDatabase()
        driver = FakeDriver(card_urls=["https://www.linkedin.com/jobs/view/3"], submit_error=True)
        result, output = self.run_search(driver, database)
        self.assertEqual(result, (1, 0))
        self.assertIn("Falhou durante o envio", output)
        self.assertFalse(database.saved[0][1]["is_success"])

    def test_submission_requires_visible_confirmation(self):
        database = FakeDatabase()
        driver = FakeDriver(
            card_urls=["https://www.linkedin.com/jobs/view/4"],
            confirm_submission=False,
        )
        result, output = self.run_search(driver, database)
        self.assertEqual(result, (1, 0))
        self.assertIn("não confirmou o envio", output)
        self.assertFalse(database.saved[0][1]["is_success"])

    def test_confirmed_submission_is_the_only_success_state(self):
        database = FakeDatabase()
        result, output = self.run_search(
            FakeDriver(card_urls=["https://www.linkedin.com/jobs/view/5"]),
            database,
        )
        self.assertEqual(result, (1, 1))
        self.assertIn("enviada e confirmada", output)
        self.assertTrue(database.saved[0][1]["is_success"])

    def test_database_failure_is_not_silently_swallowed(self):
        driver = FakeDriver(card_urls=["https://www.linkedin.com/jobs/view/6"])
        with self.assertRaisesRegex(RuntimeError, "simulated SQLite write failure"):
            self.run_search(driver, FakeDatabase(fail_saves=True))

    def test_unconfirmed_application_remains_pending_in_sqlite(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database = DatabaseManager(os.path.join(temp_dir, "test.db"))
            database.save_or_update_opportunity(
                "Junior Developer",
                "Example Co",
                "Remote",
                "https://www.linkedin.com/jobs/view/7",
                "Falhou: interface sem confirmação.",
                False,
            )
            connection = database.get_connection()
            row = connection.execute(
                "SELECT stage, date_applied FROM opportunities"
            ).fetchone()
            connection.close()
        self.assertEqual(row["stage"], "pending")
        self.assertIsNone(row["date_applied"])

    def test_login_page_after_manual_pause_is_not_treated_as_authenticated(self):
        driver = FakeDriver()
        driver.current_url = "https://www.linkedin.com/login"
        with patch.object(main, "input", return_value=""), patch.object(main.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "Autenticação não confirmada"):
                main.login_linkedin(driver, "user", "password")

    def test_feed_confirms_authentication_without_legacy_global_nav_selector(self):
        driver = FakeDriver()
        def finish_manual_login():
            driver.current_url = "https://www.linkedin.com/feed/"
            return ""

        with patch.object(main, "input", side_effect=finish_manual_login), patch.object(main.time, "sleep"):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                main.login_linkedin(driver, "user", "password")
        self.assertIn("Sessão do LinkedIn confirmada no Feed", output.getvalue())

    def test_chrome_uses_eager_page_load_strategy(self):
        options = chrome_utils.chrome_browser_options()
        self.assertEqual(options.page_load_strategy, "eager")

    def test_browser_sets_finite_page_load_timeout(self):
        browser = type("Browser", (), {"set_page_load_timeout": unittest.mock.Mock()})()
        with (
            patch.object(chrome_utils, "ChromeDriverManager") as manager,
            patch.object(chrome_utils, "ChromeService"),
            patch.object(chrome_utils.webdriver, "Chrome", return_value=browser),
        ):
            manager.return_value.install.return_value = "/tmp/chromedriver"
            chrome_utils.init_browser()
        browser.set_page_load_timeout.assert_called_once_with(45)


if __name__ == "__main__":
    unittest.main()
