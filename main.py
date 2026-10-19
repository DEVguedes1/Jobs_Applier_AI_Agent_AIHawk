import time
import random
import os
import sys

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

    print("\n" + "="*50 + "\n✋ PAUSA: Resolva Captcha e vá para o FEED.\n👉 Aperte ENTER aqui para continuar...\n" + "="*50)
    input()

def tentar_aplicar_sozinho(driver):
    try:
        time.sleep(2)
        # Procura botões de Enviar/Submit
        botoes_enviar = driver.find_elements(By.CSS_SELECTOR, "button[aria-label='Enviar candidatura'], button[aria-label='Submit application']")
        
        if botoes_enviar:
            botoes_enviar[0].click()
            time.sleep(2)
            try:
                driver.find_element(By.CSS_SELECTOR, "button[aria-label='Fechar'], button[aria-label='Dismiss']").click()
            except Exception:
                pass
            return "Candidatura Enviada com Sucesso! ✅"
        else:
            # Se não achou enviar, fecha e marca como pendente
            try:
                driver.find_element(By.CSS_SELECTOR, "button[aria-label='Fechar'], button[aria-label='Dismiss']").click()
                time.sleep(1)
                driver.find_element(By.CSS_SELECTOR, "button[data-control-name='discard_application_confirm_btn']").click()
            except Exception:
                pass
            return "Formulário complexo (Manual Necessário) ⚠️"
    except Exception as e:
        return f"Erro ao aplicar: {str(e)[:30]}"

def search_jobs(driver, positions, locations):
    print("--- 🔎 BUSCANDO E APLICANDO ---")
    total_encontradas = 0
    total_enviadas = 0
    status_verifier = StatusVerifier(db=db_manager)
    
    for cargo in positions:
        for local in locations:
            print(f"\n📍 Pesquisando: {cargo} em {local}")
            url = f"https://www.linkedin.com/jobs/search/?keywords={cargo}&location={local}&f_AL=true"
            driver.get(url)
            time.sleep(5)
            
            try:
                try:
                    driver.find_element(By.CSS_SELECTOR, "button[aria-label='Fechar'], button[aria-label='Dismiss']").click()
                except Exception:
                    pass

                job_cards = driver.find_elements(By.CSS_SELECTOR, ".job-card-container")
                print(f"   Encontrei {len(job_cards)} vagas nesta busca.")
                
                for i, card in enumerate(job_cards):
                    try:
                        driver.execute_script("arguments[0].scrollIntoView();", card)
                        
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
                            
                        # Procura o botão de aplicar
                        botoes = driver.find_elements(By.CLASS_NAME, "jobs-apply-button--top-card")
                        if not botoes:
                            botoes = driver.find_elements(By.CSS_SELECTOR, "button.jobs-apply-button")

                        status = "Botão de candidatura não identificado"
                        is_success = False
                        external_apply_url = None

                        if botoes:
                            texto = botoes[0].text.lower()
                            if "candidatura simplificada" in texto or "easy apply" in texto:
                                print(f"   👆 Tentando aplicar em: {titulo}")
                                botoes[0].click()
                                status = tentar_aplicar_sozinho(driver)
                                is_success = ("Sucesso" in status or "Enviada" in status)
                                if is_success:
                                    total_enviadas += 1
                            else:
                                status = "Link Externo (Não clicado)"
                                external_apply_url = status_verifier.get_external_apply_url(driver, botoes[0])

                        # ============================================================
                        # FASE 2: FILTRO DE LINKS EXTERNOS
                        # Se for link externo E NÃO estiver previamente cadastrado,
                        # separa o registro como 'LINK_EXTERNO_NAO_CADASTRADO'
                        # ============================================================
                        if external_apply_url or "Link Externo" in status or is_external_url(link_vaga):
                            external_url = external_apply_url or link_vaga
                            already_in_db = db_manager.is_job_registered(external_url)
                            if not already_in_db:
                                print(f"   📦 [FILTRO EXTERNO] Separando vaga externa não cadastrada: {titulo} @ {empresa}")
                                db_manager.isolate_external_unregistered(
                                    title=titulo,
                                    company=empresa,
                                    location=local,
                                    url=external_url
                                )
                                total_encontradas += 1
                                continue
                            print(f"   ℹ️ [FILTRO EXTERNO] Link já cadastrado; vaga mantida sem novo processamento: {titulo} @ {empresa}")
                            continue

                        # PERSISTÊNCIA DIRETA NO SQLITE (Substitui CSV)
                        db_manager.save_or_update_opportunity(
                            title=titulo,
                            company=empresa,
                            location=local,
                            url=link_vaga,
                            status_msg=status,
                            is_success=is_success
                        )

                        agora = datetime.now().strftime("%d/%m/%Y %H:%M")
                        print(f"   📝 {i+1}. {titulo} -> {status} [Salvo no Banco SQLite]")
                        historico_vagas.append([agora, titulo, empresa, local, status, link_vaga])
                        total_encontradas += 1
                        
                    except Exception as e:
                        continue
                    
                    time.sleep(1)
                
            except Exception as e:
                print(f"   Erro na lista: {e}")
            
            time.sleep(3)

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

    try:
        secrets = load_secrets()
        prefs = load_preferences()
        email = secrets.get("linkedin_username")
        password = secrets.get("linkedin_password")
        positions = prefs.get("positions", ["Java Developer"])
        locations = prefs.get("locations", ["Brazil"])

        driver = init_browser()
        login_linkedin(driver, email, password)
        total_encontradas, total_enviadas = search_jobs(driver, positions, locations)
    except KeyboardInterrupt:
        print("\n🛑 Parado pelo usuário.")
        status_final = "interrupted"
    except Exception as e:
        print(f"🚨 Erro: {e}")
        status_final = "error"
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
            log_output=f"Execução finalizada com {total_encontradas} vagas processadas e {total_enviadas} candidaturas enviadas."
        )
        print(f"\n💾 Todas as informações foram gravadas DIRETAMENTE no banco SQLite (kiwibot.db).")
        print("Fechando em 10 segundos...")
        time.sleep(10)

if __name__ == "__main__":
    main()