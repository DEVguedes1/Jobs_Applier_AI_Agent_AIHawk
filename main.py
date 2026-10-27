import time
import random
import os
import sys
from urllib.parse import urlencode

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import yaml
from datetime import datetime
from urllib.parse import urlparse
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException, WebDriverException
from selenium.webdriver.support.ui import WebDriverWait
from urllib3.exceptions import ReadTimeoutError

from src.utils.chrome_utils import init_browser
from src.database import db_manager
from src.status_verifier import StatusVerifier, run_verifier_flow

historico_vagas = []

def load_secrets():
    try:
        with open("data_folder/secrets.yaml", "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception as e:
        print(f"❌ Erro ao ler secrets.yaml: {e}")
        sys.exit(1)

def load_preferences():
    try:
        with open("data_folder/work_preferences.yaml", "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception as e:
        print(f"❌ Erro ao ler work_preferences.yaml: {e}")
        sys.exit(1)

def is_external_url(url: str) -> bool:
    """Verifica se a URL aponta para fora do domínio do LinkedIn."""
    if not url:
        return False
    try:
        parsed = urlparse(url)
        netloc = parsed.netloc.lower()
        if not netloc:
            return False
        return not any(netloc == domain or netloc.endswith('.' + domain) for domain in ['linkedin.com', 'www.linkedin.com', 'br.linkedin.com'])
    except Exception:
        return False

def login_linkedin(driver, username, password):
    print("--- 🔑 FAZENDO LOGIN ---")
    driver.get("https://www.linkedin.com/login")
    time.sleep(3)
    
    try:
        # Dismiss any cookie banner if present
        for cookie_btn in driver.find_elements(By.XPATH, "//button[contains(text(), 'Aceitar') or contains(text(), 'Accept') or contains(@action_type, 'ACCEPT')]"):
            try:
                if cookie_btn.is_displayed():
                    cookie_btn.click()
                    time.sleep(1)
                    break
            except Exception:
                pass

        user_field = None
        for sel in ["#username", "#session_key", "input[name='session_key']", "input[autocomplete='username']"]:
            for el in driver.find_elements(By.CSS_SELECTOR, sel):
                if el.is_displayed():
                    user_field = el
                    break
            if user_field:
                break

        pass_field = None
        for sel in ["#password", "#session_password", "input[name='session_password']", "input[type='password']"]:
            for el in driver.find_elements(By.CSS_SELECTOR, sel):
                if el.is_displayed():
                    pass_field = el
                    break
            if pass_field:
                break

        if user_field and pass_field:
            user_field.clear()
            user_field.send_keys(username)
            time.sleep(0.5)
            pass_field.clear()
            pass_field.send_keys(password)
            time.sleep(0.5)
            
            submit_btn = None
            for s in driver.find_elements(By.XPATH, "//button[@type='submit']"):
                if s.is_displayed():
                    submit_btn = s
                    break
            if submit_btn:
                submit_btn.click()
            else:
                pass_field.send_keys(Keys.ENTER)
            print("✅ Dados enviados automaticamente.")
        else:
            print("⚠️ Campos de login não visíveis. Por favor, faça login na janela do Chrome.")
    except Exception as e:
        print(f"⚠️ Aviso no preenchimento: {e}. Por favor, faça login diretamente na janela do Chrome.")

    print("\n" + "="*50 + "\n✋ PAUSA: conclua o login e qualquer verificação manual no Chrome.\n👉 Abra o Feed do LinkedIn e clique em Continuar no Dashboard.\n" + "="*50)
    input()

    parsed_url = urlparse(driver.current_url)
    hostname = (parsed_url.hostname or "").lower()
    login_paths = ("/login", "/checkpoint", "/authwall", "/uas/")
    is_linkedin = hostname == "linkedin.com" or hostname.endswith(".linkedin.com")
    is_login_page = any(parsed_url.path.lower().startswith(path) for path in login_paths)
    if not is_linkedin or is_login_page or not parsed_url.path.lower().startswith("/feed"):
        raise RuntimeError(
            "Autenticação não confirmada: após concluir login/verificação no Chrome, "
            "abra o Feed do LinkedIn e clique em Continuar."
        )
    visible_login_fields = [
        element
        for element in driver.find_elements(
            By.CSS_SELECTOR,
            "input[name='session_key'], input[name='session_password'], #username, #password"
        )
        if element.is_displayed()
    ]
    if visible_login_fields:
        raise RuntimeError(
            "Autenticação não confirmada: campos de login ainda estão visíveis no LinkedIn."
        )
    print("✅ Sessão do LinkedIn confirmada no Feed.")


def _visible_elements(container, by, selector):
    return [element for element in container.find_elements(by, selector) if element.is_displayed()]


def _required_fields_are_complete(dialog):
    required_fields = dialog.find_elements(
        By.CSS_SELECTOR,
        "input[required], select[required], textarea[required], "
        "input[aria-required='true'], select[aria-required='true'], "
        "textarea[aria-required='true'], [role='combobox'][aria-required='true']"
    )
    for field in required_fields:
        if not field.is_displayed():
            continue
        field_type = (field.get_attribute("type") or "").lower()
        if field_type in ("checkbox", "radio"):
            if not field.is_selected():
                return False
        elif not (field.get_attribute("value") or field.text or "").strip():
            return False
    return True


def _application_confirmation_visible(driver):
    confirmation_texts = (
        "application submitted",
        "your application was sent",
        "candidatura enviada",
        "sua candidatura foi enviada",
    )
    for element in driver.find_elements(By.CSS_SELECTOR, "div[role='dialog'], .artdeco-inline-feedback, [role='alert']"):
        if element.is_displayed():
            text = (element.text or "").lower()
            if any(phrase in text for phrase in confirmation_texts):
                return True
    return False


def tentar_aplicar_sozinho(driver, timeout=10):
    try:
        dialog = WebDriverWait(driver, timeout).until(
            lambda current_driver: next(
                (
                    element for element in current_driver.find_elements(
                        By.CSS_SELECTOR, "div[role='dialog'], .jobs-easy-apply-content"
                    )
                    if element.is_displayed()
                ),
                False,
            )
        )
    except TimeoutException:
        return "Falhou: formulário Easy Apply não abriu dentro do tempo limite.", False

    try:
        next_buttons = _visible_elements(
            dialog,
            By.XPATH,
            ".//button[normalize-space()='Avançar' or normalize-space()='Continuar' "
            "or normalize-space()='Próxima' or normalize-space()='Next' "
            "or normalize-space()='Continue' or normalize-space()='Review']"
        )
        if next_buttons:
            return "Ignorada: formulário de várias etapas exige revisão/respostas manuais.", False

        submit_buttons = _visible_elements(
            dialog,
            By.CSS_SELECTOR,
            "button[aria-label='Enviar candidatura'], button[aria-label='Submit application']"
        )
        if not submit_buttons:
            submit_buttons = _visible_elements(
                dialog,
                By.XPATH,
                ".//button[normalize-space()='Enviar candidatura' or normalize-space()='Submit application']"
            )

        if not submit_buttons:
            return "Falhou: botão de envio não encontrado no formulário.", False

        if not _required_fields_are_complete(dialog):
            return "Ignorada: há campos obrigatórios sem resposta confiável.", False

        submit_buttons[0].click()
        WebDriverWait(driver, timeout).until(_application_confirmation_visible)
        return "Enviada e confirmada pela interface do LinkedIn.", True
    except TimeoutException:
        return "Falhou: a interface não confirmou o envio após a tentativa.", False
    except (StaleElementReferenceException, WebDriverException) as error:
        return f"Falhou durante o envio: {type(error).__name__}: {error}", False


def _canonical_job_url(url):
    return (url or "").split("?", 1)[0].rstrip("/")


def _job_results_ready(driver):
    if driver.find_elements(By.CSS_SELECTOR, ".job-card-container"):
        return True
    current_url = driver.current_url.lower()
    if "/login" in current_url or "/checkpoint" in current_url:
        return True
    try:
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
    except WebDriverException:
        return False
    return any(message in body_text for message in (
        "nenhuma vaga", "não encontramos", "no matching jobs", "no jobs found"
    ))


def search_jobs(driver, positions, locations, db=None):
    db = db or db_manager
    print("--- 🔎 BUSCANDO E APLICANDO ---")
    total_encontradas = 0
    total_enviadas = 0
    status_verifier = StatusVerifier(db=db)
    seen_urls = set()
    stats = {"elegiveis": 0, "em_andamento": 0, "ignoradas": 0, "falhas": 0, "duplicadas": 0}
    stop_for_manual_review = False
    stop_after_driver_timeout = False
    
    for cargo in positions:
        for local in locations:
            print(f"\n📍 Pesquisando: {cargo} em {local}")
            url = "https://www.linkedin.com/jobs/search/?" + urlencode({
                "keywords": cargo,
                "location": local,
                "f_AL": "true",
            })

            try:
                driver.get(url)
            except TimeoutException:
                print("   ⏱️ O carregamento completo excedeu o limite; verificando se os resultados já estão disponíveis.")
            except ReadTimeoutError as error:
                print(f"   ❌ ChromeDriver não respondeu durante a navegação: {error}")
                print("   ⏹️ Busca interrompida para evitar repetir comandos em um navegador sem resposta.")
                stats["falhas"] += 1
                stop_after_driver_timeout = True
                break
            except WebDriverException as error:
                print(f"   ❌ Falha de navegação na busca: {type(error).__name__}: {error}")
                stats["falhas"] += 1
                continue

            try:
                WebDriverWait(driver, 15).until(_job_results_ready)
            except TimeoutException:
                print(f"   ⏱️ Busca não carregou resultados a tempo: {driver.current_url}")
                stats["falhas"] += 1
                continue
            except ReadTimeoutError as error:
                print(f"   ❌ ChromeDriver não respondeu enquanto aguardava resultados: {error}")
                print("   ⏹️ Busca interrompida para evitar repetir comandos em um navegador sem resposta.")
                stats["falhas"] += 1
                stop_after_driver_timeout = True
                break
            except WebDriverException as error:
                print(f"   ❌ Falha de navegação na busca: {type(error).__name__}: {error}")
                stats["falhas"] += 1
                continue

            if "/login" in driver.current_url.lower() or "/checkpoint" in driver.current_url.lower():
                raise RuntimeError("Sessão do LinkedIn não autenticada durante a busca.")

            try:
                job_cards = driver.find_elements(By.CSS_SELECTOR, ".job-card-container")
                print(f"   Encontrei {len(job_cards)} vagas nesta busca.")
                total_encontradas += len(job_cards)
                if not job_cards:
                    print("   ℹ️ Nenhuma vaga encontrada para esta combinação de cargo e local.")
                    continue

                for i, card in enumerate(job_cards):
                    titulo = ""
                    empresa = "Empresa não identificada"
                    link_vaga = ""
                    try:
                        link_elem = card.find_element(By.CSS_SELECTOR, "a.job-card-container__link")
                        link_vaga = _canonical_job_url(link_elem.get_attribute("href"))
                        if not link_vaga:
                            stats["ignoradas"] += 1
                            print(f"   ⏭️ Vaga {i + 1} ignorada: link não identificado.")
                            continue
                        if link_vaga in seen_urls:
                            stats["duplicadas"] += 1
                            print(f"   ⏭️ Vaga duplicada nesta execução: {link_vaga}")
                            continue
                        seen_urls.add(link_vaga)

                        driver.execute_script("arguments[0].scrollIntoView();", card)
                        card.click()
                        WebDriverWait(driver, 10).until(
                            lambda current_driver: current_driver.find_elements(
                                By.CLASS_NAME, "job-details-jobs-unified-top-card__job-title"
                            )
                        )
                        titulo = driver.find_element(
                            By.CLASS_NAME, "job-details-jobs-unified-top-card__job-title"
                        ).text.strip()
                        company_elements = driver.find_elements(
                            By.CLASS_NAME, "job-details-jobs-unified-top-card__company-name"
                        )
                        if company_elements:
                            empresa = company_elements[0].text.strip() or empresa

                        button_info = status_verifier.detect_apply_button_type(driver)
                        if button_info["type"] == "already_applied":
                            stats["ignoradas"] += 1
                            print(f"   ⏭️ Já aplicada segundo a interface: {titulo} @ {empresa}")
                            db.save_or_update_opportunity(
                                titulo, empresa, local, link_vaga,
                                "Candidatura já enviada (confirmada na interface).", True
                            )
                            continue
                        if button_info["type"] == "closed":
                            stats["ignoradas"] += 1
                            status = "Ignorada: vaga encerrada."
                            print(f"   ⏭️ {status} {titulo} @ {empresa}")
                            db.save_or_update_opportunity(titulo, empresa, local, link_vaga, status, False)
                            continue

                        # ============================================================
                        # FASE 2: FILTRO DE LINKS EXTERNOS
                        # Se for link externo E NÃO estiver previamente cadastrado,
                        # separa o registro como 'LINK_EXTERNO_NAO_CADASTRADO'
                        # ============================================================
                        external_apply_url = button_info.get("external_url")
                        if button_info["type"] == "external_link" or is_external_url(link_vaga):
                            external_url = external_apply_url or link_vaga
                            already_in_db = db.is_job_registered(external_url)
                            if not already_in_db:
                                print(f"   📦 [FILTRO EXTERNO] Separando vaga externa não cadastrada: {titulo} @ {empresa}")
                                db.isolate_external_unregistered(
                                    title=titulo,
                                    company=empresa,
                                    location=local,
                                    url=external_url
                                )
                                stats["ignoradas"] += 1
                                continue
                            print(f"   ℹ️ [FILTRO EXTERNO] Link já cadastrado; vaga mantida sem novo processamento: {titulo} @ {empresa}")
                            stats["duplicadas"] += 1
                            continue

                        if button_info["type"] != "easy_apply":
                            stats["ignoradas"] += 1
                            status = "Ignorada: botão Easy Apply não identificado."
                            print(f"   ⏭️ {status} {titulo} @ {empresa}")
                            db.save_or_update_opportunity(titulo, empresa, local, link_vaga, status, False)
                            continue

                        stats["elegiveis"] += 1
                        print(f"   ✅ Vaga elegível: {titulo} @ {empresa}")
                        apply_buttons = driver.find_elements(By.CLASS_NAME, "jobs-apply-button--top-card")
                        if not apply_buttons:
                            apply_buttons = driver.find_elements(By.CSS_SELECTOR, "button.jobs-apply-button")
                        if not apply_buttons:
                            stats["falhas"] += 1
                            db.save_or_update_opportunity(
                                titulo, empresa, local, link_vaga,
                                "Falhou: botão Easy Apply desapareceu antes da tentativa.", False
                            )
                            print("   ❌ Botão de candidatura desapareceu antes do clique.")
                            continue

                        print(f"   ▶️ Candidatura em andamento: {titulo} @ {empresa}")
                        stats["em_andamento"] += 1
                        apply_buttons[0].click()
                        status, is_success = tentar_aplicar_sozinho(driver)
                        if is_success:
                            total_enviadas += 1
                            print(f"   ✅ Candidatura enviada e confirmada: {titulo} @ {empresa}")
                        elif status.startswith("Falhou:") or status.startswith("Falhou durante"):
                            stats["falhas"] += 1
                            print(f"   ❌ {status}")
                        else:
                            stats["ignoradas"] += 1
                            print(f"   ⏭️ {status}")

                        db.save_or_update_opportunity(
                            title=titulo,
                            company=empresa,
                            location=local,
                            url=link_vaga,
                            status_msg=status,
                            is_success=is_success
                        )
                        historico_vagas.append([
                            datetime.now().strftime("%d/%m/%Y %H:%M"),
                            titulo, empresa, local, status, link_vaga
                        ])
                        if status.startswith("Ignorada: formulário") or status.startswith(
                            "Ignorada: há campos obrigatórios"
                        ):
                            print("⏸️ Busca pausada para não interagir com o formulário sem respostas confiáveis.")
                            stop_for_manual_review = True
                            break

                    except StaleElementReferenceException as error:
                        stats["falhas"] += 1
                        print(f"   ❌ Vaga {i + 1} mudou durante a leitura; ignorada: {error}")
                    except (TimeoutException, WebDriverException) as error:
                        stats["falhas"] += 1
                        print(f"   ❌ Falha Selenium na vaga {i + 1} ({link_vaga or 'sem URL'}): "
                              f"{type(error).__name__}: {error}")
                        if link_vaga and titulo:
                            db.save_or_update_opportunity(
                                titulo, empresa, local, link_vaga,
                                f"Falhou durante navegação/formulário: {type(error).__name__}.", False
                            )
                    except Exception as error:
                        print(f"   ❌ Falha inesperada na vaga {i + 1} ({link_vaga or 'sem URL'}): "
                              f"{type(error).__name__}: {error}")
                        raise

                    time.sleep(1)

            except (StaleElementReferenceException, WebDriverException) as error:
                print(f"   ❌ Falha Selenium na lista de vagas: {type(error).__name__}: {error}")
                stats["falhas"] += 1
            except Exception as error:
                print(f"   ❌ Falha inesperada ao processar lista de vagas: {type(error).__name__}: {error}")
                raise

            if stop_for_manual_review or stop_after_driver_timeout:
                break
            time.sleep(1)

    print("\n--- RESUMO DA BUSCA ---")
    print(f"Encontradas: {total_encontradas} | Elegíveis: {stats['elegiveis']} | "
          f"Em andamento: {stats['em_andamento']} | Confirmadas: {total_enviadas}")
    print(f"Ignoradas: {stats['ignoradas']} | Duplicadas: {stats['duplicadas']} | "
          f"Falhas: {stats['falhas']}")
    if stats["elegiveis"] == 0:
        print("ℹ️ Nenhuma vaga elegível para candidatura foi encontrada nesta execução.")

    return total_encontradas, total_enviadas

def main():
    # Verifica se foi solicitado o modo de verificação de estado
    if "--verify" in sys.argv or "--mode=verify" in sys.argv:
        run_verifier_flow()
        return

    print("=" * 60)
    print("🤖 AIHAWK / KIWIBOT - CANDIDATURAS AUTOMATIZADAS (v2.0)")
    print("   Persistência Direta SQLite • Expurgo CSV • Sem E-mails")
    print("=" * 60)

    # 1. Rotina de expurgo inicial de arquivos CSV residuais
    db_manager.purge_csv_files()
    run_id = db_manager.record_bot_run_start()

    total_encontradas = 0
    total_enviadas = 0
    status_final = "completed"
    driver = None
    fatal_error = None

    try:
        secrets = load_secrets()
        prefs = load_preferences()
        email = secrets.get("linkedin_username")
        password = secrets.get("linkedin_password")
        positions = prefs.get("positions", ["Java Developer"])
        locations = prefs.get("locations", ["Brazil"])

        print("🌐 Inicializando navegador Chrome...")
        driver = init_browser()
        print("✅ Navegador Chrome inicializado.")
        login_linkedin(driver, email, password)
        total_encontradas, total_enviadas = search_jobs(driver, positions, locations)
    except KeyboardInterrupt:
        print("\n🛑 Parado pelo usuário.")
        status_final = "interrupted"
    except Exception as e:
        print(f"🚨 Erro: {e}")
        status_final = "error"
        fatal_error = e
    finally:
        if driver:
            try:
                driver.quit()
            except Exception as e:
                print(f"⚠️ Erro ao fechar o navegador: {e}")

        # 2. Rotina de expurgo obrigatória de arquivos CSV a cada término de processamento
        db_manager.purge_csv_files()

        # 3. Registra execução concluída no SQLite
        db_manager.record_bot_run_finish(
            run_id=run_id,
            vagas=total_encontradas,
            enviadas=total_enviadas,
            status=status_final,
            log_output=f"Execução {status_final}: {total_encontradas} vagas encontradas e "
                       f"{total_enviadas} candidaturas enviadas e confirmadas."
        )
        print(f"\n💾 Todas as informações foram gravadas DIRETAMENTE no banco SQLite (kiwibot.db).")
    if fatal_error:
        raise RuntimeError("A execução do robô terminou com erro.") from fatal_error

if __name__ == "__main__":
    main()