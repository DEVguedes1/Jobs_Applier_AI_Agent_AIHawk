"""
Módulo de Verificação de Estado de Candidaturas e Classificação de Vagas
FASE 2:
1. Verificação passiva de status de candidaturas cadastradas no LinkedIn (sem aplicar).
2. Filtro de Links Externos: Detecta links externos fora do LinkedIn. Se não constar no banco,
   isola imediatamente o registro como 'LINK_EXTERNO_NAO_CADASTRADO' sem processar candidatura.
3. 100% integrado ao SQLite (DatabaseManager) com expurgo de CSVs e sem e-mails.
"""

import time
import os
import sys
import yaml
from datetime import datetime
from typing import List, Dict, Any, Optional
from urllib.parse import parse_qs, urlparse

from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.common.exceptions import StaleElementReferenceException

from src.database import db_manager, DatabaseManager
from src.utils.chrome_utils import init_browser

class StatusVerifier:
    def __init__(self, db: Optional[DatabaseManager] = None):
        self.db = db or db_manager
        self.external_domains_ignore = [
            'linkedin.com',
            'www.linkedin.com',
            'br.linkedin.com'
        ]

    def is_external_url(self, url: str) -> bool:
        """Verifica se a URL aponta para fora do domínio LinkedIn."""
        if not url:
            return False
        try:
            parsed = urlparse(url)
            netloc = parsed.netloc.lower()
            if parsed.scheme.lower() not in ("http", "https") or not netloc:
                return False
            return not any(netloc == domain or netloc.endswith('.' + domain) for domain in self.external_domains_ignore)
        except ValueError:
            return False

    @staticmethod
    def is_linkedin_url(url: str) -> bool:
        if not url:
            return False
        try:
            parsed = urlparse(url)
            if parsed.scheme.lower() not in ("http", "https"):
                return False
            hostname = (parsed.hostname or "").lower()
            return hostname == "linkedin.com" or hostname.endswith(".linkedin.com")
        except ValueError:
            return False

    def get_external_apply_url(self, driver: WebDriver, apply_button=None) -> Optional[str]:
        """Obtém o destino externo do botão de candidatura sem clicar nele."""
        candidate_elements = []
        if apply_button is not None:
            candidate_elements.append(apply_button)
            candidate_elements.extend(
                apply_button.find_elements(By.XPATH, "./ancestor::a[1] | .//a[@href]")
            )

        candidate_elements.extend(driver.find_elements(
            By.XPATH,
            "//a[@href and (contains(@class, 'jobs-apply-button') "
            "or contains(@aria-label, 'company website') "
            "or contains(@aria-label, 'site da empresa') "
            "or contains(@href, 'apply'))]"
        ))

        for element in candidate_elements:
            for attribute in ("href", "data-url", "data-apply-url", "formaction"):
                try:
                    candidate_url = element.get_attribute(attribute)
                except StaleElementReferenceException:
                    break
                if not candidate_url:
                    continue
                if self.is_external_url(candidate_url):
                    return candidate_url
                if self.is_linkedin_url(candidate_url):
                    query = parse_qs(urlparse(candidate_url).query)
                    for key in ("url", "redirect", "target"):
                        for target in query.get(key, []):
                            if self.is_external_url(target):
                                return target

        return None

    def detect_apply_button_type(self, driver: WebDriver) -> Dict[str, Any]:
        """
        Inspeciona o botão de candidatura da vaga aberta no momento:
        Retorna se é 'easy_apply', 'external_link', 'already_applied', ou 'closed'.
        """
        res = {
            "type": "unknown",
            "text": "",
            "external_url": None
        }

        # 1. Verifica se a vaga já foi encerrada
        closed_elements = driver.find_elements(
            By.XPATH,
            "//*[contains(text(), 'Não aceita mais candidaturas') or contains(text(), 'No longer accepting applications') or contains(text(), 'Vaga encerrada')]"
        )
        for el in closed_elements:
            if el.is_displayed():
                res["type"] = "closed"
                res["text"] = el.text.strip()
                return res

        # 2. Verifica se já consta como aplicada no LinkedIn
        applied_indicators = driver.find_elements(
            By.XPATH,
            "//*[contains(text(), 'Candidatura enviada') or contains(text(), 'Applied') or contains(text(), 'Candidatou-se') or contains(text(), 'Você se candidatou')]"
        )
        for el in applied_indicators:
            if el.is_displayed():
                res["type"] = "already_applied"
                res["text"] = el.text.strip()
                return res

        # 3. Procura os botões de candidatura no topo do detalhe da vaga
        apply_buttons = driver.find_elements(By.CLASS_NAME, "jobs-apply-button--top-card")
        if not apply_buttons:
            apply_buttons = driver.find_elements(By.CSS_SELECTOR, "button.jobs-apply-button")

        if apply_buttons:
            btn = apply_buttons[0]
            texto = btn.text.strip().lower()
            res["text"] = btn.text.strip()

            if "candidatura simplificada" in texto or "easy apply" in texto:
                res["type"] = "easy_apply"
                return res
            else:
                res["type"] = "external_link"
                res["external_url"] = self.get_external_apply_url(driver, btn)
                return res

        # Fallback de link de candidatura externa
        external_url = self.get_external_apply_url(driver)
        if external_url:
            res["type"] = "external_link"
            res["external_url"] = external_url

        return res

    def process_and_filter_job(
        self,
        driver: WebDriver,
        title: str,
        company: str,
        location: str,
        job_url: str
    ) -> Dict[str, Any]:
        """
        Processa uma vaga no modo de checagem/classificação:
        - Se for link externo E NÃO estiver no banco -> Isola como 'LINK_EXTERNO_NAO_CADASTRADO'
        - Se já constar no banco -> Mantém histórico e não duplica
        - Se for Easy Apply -> Verifica estado sem submeter aplicação
        """
        button_info = self.detect_apply_button_type(driver)
        b_type = button_info["type"]
        external_url = button_info["external_url"]

        # CHECAGEM DE LINK EXTERNO
        is_external = b_type == "external_link" or self.is_external_url(external_url or "")

        if is_external:
            # Sem href acessível, usa a URL da vaga para manter a triagem rastreável.
            candidate_url = external_url or job_url
            already_registered = self.db.is_job_registered(candidate_url)
            if not already_registered:
                print(f"🚨 [FILTRO EXTERNO] Link externo não cadastrado detectado: {candidate_url}")
                opp_id = self.db.isolate_external_unregistered(
                    title=title,
                    company=company,
                    location=location,
                    url=candidate_url
                )
                return {
                    "action": "isolated_external",
                    "id": opp_id,
                    "status": "LINK_EXTERNO_NAO_CADASTRADO",
                    "type": b_type,
                    "url": candidate_url
                }
            else:
                print(f"ℹ️ [FILTRO EXTERNO] Link externo já conhecido no banco: {company} - {title}")
                return {
                    "action": "already_registered_external",
                    "status": "known_external",
                    "type": b_type,
                    "url": candidate_url
                }

        # VAGA NO LINKEDIN (EASY APPLY OU ESTADO DO LINKEDIN)
        if b_type == "already_applied":
            print(f"✅ [ESTADO] Candidatura já enviada confirmada no LinkedIn: {title} @ {company}")
            self.db.save_or_update_opportunity(
                title=title,
                company=company,
                location=location,
                url=job_url,
                status_msg="Candidatura Enviada (Confirmado no LinkedIn) ✅",
                is_success=True
            )
            return {"action": "verified_applied", "status": "applied"}

        elif b_type == "closed":
            print(f"🔒 [ESTADO] Vaga encerrada / não aceita mais candidaturas: {title} @ {company}")
            opp_id = self.db.save_or_update_opportunity(
                title=title,
                company=company,
                location=location,
                url=job_url,
                status_msg="Vaga Encerrada no LinkedIn 🔒",
                is_success=False
            )
            self.db.update_verified_status(
                opp_id=opp_id,
                new_stage="rejected",
                new_status_msg="Vaga Encerrada no LinkedIn 🔒",
                description="Status verificado via varredura: Vaga encerrada."
            )
            return {"action": "verified_closed", "status": "rejected"}

        elif b_type == "easy_apply":
            print(f"⚡ [ESTADO] Vaga aberta para Easy Apply disponível: {title} @ {company} (Não aplicada)")
            self.db.save_or_update_opportunity(
                title=title,
                company=company,
                location=location,
                url=job_url,
                status_msg="Disponível para Candidatura (Easy Apply) ⚡",
                is_success=False
            )
            return {"action": "available_easy_apply", "status": "pending"}

        return {"action": "unknown", "status": "pending"}

    def verify_registered_applications(self, driver: WebDriver, limit: int = 25) -> Dict[str, int]:
        """
        Itera sobre as candidaturas cadastradas no banco de dados SQLite para
        revalidar seus estados no LinkedIn de forma 100% passiva.
        """
        print("\n🔍 --- INICIANDO VERIFICAÇÃO DE CANDIDATURAS CADASTRADAS ---")
        opportunities = self.db.get_opportunities_to_verify()
        print(f"📋 Encontradas {len(opportunities)} vagas cadastradas com URL para checagem.")

        stats = {
            "verificadas": 0,
            "confirmadas_enviadas": 0,
            "encerradas": 0,
            "inalteradas": 0,
            "erros": 0
        }

        for i, opp in enumerate(opportunities[:limit]):
            url = opp.get("url")
            title = opp.get("title")
            company = opp.get("company_name")
            opp_id = opp.get("id")

            if not self.is_linkedin_url(url) or "/jobs/view" not in url:
                continue

            stats["verificadas"] += 1
            print(f"\n🔎 [{i+1}/{min(len(opportunities), limit)}] Verificando: {title} @ {company}")
            try:
                driver.get(url)
                time.sleep(3)

                btn_info = self.detect_apply_button_type(driver)
                b_type = btn_info["type"]

                if b_type == "already_applied":
                    stats["confirmadas_enviadas"] += 1
                    self.db.update_verified_status(
                        opp_id=opp_id,
                        new_stage="applied",
                        new_status_msg="Candidatura Enviada (Confirmado no LinkedIn) ✅",
                        description=f"Status verificado no LinkedIn: Candidatura confirmada em {datetime.now().strftime('%d/%m/%Y %H:%M')}"
                    )
                    print(f"   ✓ Confirmado: Candidatura Enviada ✅")

                elif b_type == "closed":
                    stats["encerradas"] += 1
                    self.db.update_verified_status(
                        opp_id=opp_id,
                        new_stage="rejected",
                        new_status_msg="Vaga Encerrada no LinkedIn 🔒",
                        description=f"Status verificado no LinkedIn: Vaga encerrada / não aceita candidaturas."
                    )
                    print(f"   ✓ Atualizado: Vaga Encerrada 🔒")

                else:
                    stats["inalteradas"] += 1
                    print(f"   ℹ️ Estado mantido: {opp.get('stage')} ({btn_info['text'] or b_type})")

            except Exception as e:
                stats["erros"] += 1
                print(f"   ⚠️ Erro ao verificar vaga {opp_id}: {e}")

            time.sleep(1.5)

        print("\n📊 Resumo da Verificação de Vagas:")
        print(f"   • Total Verificadas: {stats['verificadas']}")
        print(f"   • Confirmadas Enviadas: {stats['confirmadas_enviadas']}")
        print(f"   • Encerradas Detectadas: {stats['encerradas']}")
        print(f"   • Inalteradas: {stats['inalteradas']}")
        return stats

    def scan_and_classify_search(
        self,
        driver: WebDriver,
        positions: List[str],
        locations: List[str]
    ) -> Dict[str, int]:
        """
        Executa a varredura das preferências de busca, classificando cada vaga e
        ISOLANDO links externos não cadastrados no banco sem realizar candidaturas.
        """
        print("\n🔎 --- INICIANDO VARREDURA E CLASSIFICAÇÃO PASSIVA DE VAGAS ---")
        stats = {
            "total_mapeadas": 0,
            "links_externos_isolados": 0,
            "easy_apply_detectadas": 0,
            "ja_aplicadas": 0
        }

        for cargo in positions:
            for local in locations:
                print(f"\n📍 Buscando vagas para classificar: {cargo} em {local}")
                url = f"https://www.linkedin.com/jobs/search/?keywords={cargo}&location={local}"
                driver.get(url)
                time.sleep(5)

                try:
                    # Fecha modais se houver
                    try:
                        driver.find_element(By.CSS_SELECTOR, "button[aria-label='Fechar'], button[aria-label='Dismiss']").click()
                    except Exception:
                        pass

                    job_cards = driver.find_elements(By.CSS_SELECTOR, ".job-card-container")
                    print(f"   Encontrei {len(job_cards)} vagas nesta listagem.")

                    for i, card in enumerate(job_cards):
                        try:
                            driver.execute_script("arguments[0].scrollIntoView();", card)

                            # Captura link da vaga
                            try:
                                link_elem = card.find_element(By.CSS_SELECTOR, "a.job-card-container__link")
                                link_vaga = link_elem.get_attribute("href").split("?")[0]
                            except Exception:
                                link_vaga = driver.current_url

                            card.click()
                            time.sleep(2)

                            try:
                                titulo = driver.find_element(By.CLASS_NAME, "job-details-jobs-unified-top-card__job-title").text.strip()
                            except Exception:
                                titulo = cargo
                            try:
                                empresa = driver.find_element(By.CLASS_NAME, "job-details-jobs-unified-top-card__company-name").text.strip()
                            except Exception:
                                empresa = "Empresa"

                            stats["total_mapeadas"] += 1
                            result = self.process_and_filter_job(
                                driver=driver,
                                title=titulo,
                                company=empresa,
                                location=local,
                                job_url=link_vaga
                            )

                            if result.get("action") == "isolated_external":
                                stats["links_externos_isolados"] += 1
                            elif result.get("action") == "available_easy_apply":
                                stats["easy_apply_detectadas"] += 1
                            elif result.get("action") == "verified_applied":
                                stats["ja_aplicadas"] += 1

                        except Exception as e:
                            print(f"   ⚠️ Erro ao classificar item {i+1}: {e}")
                            continue

                        time.sleep(1)

                except Exception as e:
                    print(f"   ⚠️ Erro na listagem de busca: {e}")

                time.sleep(2)

        print("\n📊 Resumo da Varredura e Classificação:")
        print(f"   • Total Mapeadas: {stats['total_mapeadas']}")
        print(f"   • Links Externos Isolados: {stats['links_externos_isolados']} (status: LINK_EXTERNO_NAO_CADASTRADO)")
        print(f"   • Vagas Easy Apply Disponíveis: {stats['easy_apply_detectadas']}")
        print(f"   • Vagas Já Aplicadas: {stats['ja_aplicadas']}")
        return stats


def run_verifier_flow():
    """Fluxo principal do script de verificação."""
    print("=" * 60)
    print("🤖 MÓDULO DE VERIFICAÇÃO DE ESTADO & CLASSIFICAÇÃO DE VAGAS")
    print("=" * 60)

    # 1. Remove resíduos de CSVs legados antes da execução.
    db_manager.purge_csv_files()
    run_id = db_manager.record_bot_run_start()

    driver = None
    total_encontradas = 0
    status_final = "completed"
    try:
        # 2. Carrega credenciais e preferências
        with open("data_folder/secrets.yaml", "r", encoding="utf-8") as f:
            secrets_data = yaml.safe_load(f)
        with open("data_folder/work_preferences.yaml", "r", encoding="utf-8") as f:
            prefs_data = yaml.safe_load(f)

        email = secrets_data.get("linkedin_username")
        password = secrets_data.get("linkedin_password")
        positions = prefs_data.get("positions", ["Java Developer"])
        locations = prefs_data.get("locations", ["Brazil"])

        driver = init_browser()
        # Login
        print("--- 🔑 FAZENDO LOGIN PARA VERIFICAÇÃO ---")
        driver.get("https://www.linkedin.com/login")
        time.sleep(3)

        # Login automatizado básico
        try:
            user_field = driver.find_element(By.ID, "username")
            pass_field = driver.find_element(By.ID, "password")
            user_field.send_keys(email)
            pass_field.send_keys(password)
            driver.find_element(By.XPATH, "//button[@type='submit']").click()
        except Exception:
            pass

        print("\n" + "="*50 + "\n✋ PAUSA: Resolva Captcha se necessário e vá para o FEED.\n👉 Aperte ENTER aqui para continuar...\n" + "="*50)
        input()

        verifier = StatusVerifier(db=db_manager)

        # Fase A: Revalidar candidaturas já existentes
        res_verif = verifier.verify_registered_applications(driver, limit=20)

        # Fase B: Varredura de novas vagas, isolando links externos
        res_scan = verifier.scan_and_classify_search(driver, positions, locations)
        total_encontradas = res_verif["verificadas"] + res_scan["total_mapeadas"]

    except KeyboardInterrupt:
        print("\n🛑 Verificação interrompida pelo usuário.")
        status_final = "interrupted"
    except Exception as e:
        print(f"\n🚨 Erro durante a verificação: {e}")
        status_final = "error"
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass

        # Expurgo final de CSVs e registro do término
        db_manager.purge_csv_files()
        db_manager.record_bot_run_finish(
            run_id=run_id,
            vagas=total_encontradas,
            enviadas=0,  # Modo de verificação não realiza candidaturas!
            status=status_final,
            log_output=(
                "Verificação concluída. Links externos isolados diretamente no banco SQLite."
                if status_final == "completed"
                else f"Verificação finalizada com status: {status_final}."
            )
        )
        print(f"\n✅ Processo de verificação finalizado ({status_final}). Dados no SQLite (kiwibot.db).")

if __name__ == "__main__":
    run_verifier_flow()
