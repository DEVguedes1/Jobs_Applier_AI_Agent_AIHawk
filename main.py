import time
import random
import os
import sys
import yaml
import csv
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from src.utils.chrome_utils import init_browser

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

def enviar_relatorio_email(secrets):
    print("\n📧 PREPARANDO ENVIO DE EMAIL...")
    remetente = secrets.get("gmail_user")
    senha = secrets.get("gmail_app_password")
    destinatario = secrets.get("linkedin_username")
    
    if not remetente or not senha:
        print("⚠️ Email não configurado. Pulando.")
        return

    arquivos_para_enviar = ["vagas_sucesso.csv", "vagas_pendentes.csv"]
    arquivos_existentes = [f for f in arquivos_para_enviar if os.path.isfile(f)]
    
    if not arquivos_existentes:
        return

    msg = MIMEMultipart()
    msg['From'] = remetente
    msg['To'] = destinatario
    msg['Subject'] = f"🤖 Relatório LinkedIn - {datetime.now().strftime('%d/%m')}"
    
    msg.attach(MIMEText("Segue em anexo o relatório das vagas processadas hoje.", 'plain'))

    for arquivo in arquivos_existentes:
        try:
            with open(arquivo, "rb") as attachment:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(attachment.read())
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f"attachment; filename= {arquivo}")
            msg.attach(part)
        except Exception: pass

    try:
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(remetente, senha)
        server.sendmail(remetente, destinatario, msg.as_string())
        server.quit()
        print(f"✅ Email enviado com sucesso!")
    except Exception as e:
        print(f"❌ Erro no email: {e}")

def salvar_csv_seguro(nome_arquivo, dados):
    if not dados: return 
    cabecalho = ["Data/Hora", "Cargo", "Empresa", "Local", "Status", "Link da Vaga"]
    arquivo_existe = os.path.isfile(nome_arquivo)
    try:
        with open(nome_arquivo, mode='a', newline='', encoding='utf-8-sig') as f:
            escritor = csv.writer(f, delimiter=';')
            if not arquivo_existe: escritor.writerow(cabecalho)
            escritor.writerows(dados)
        print(f"✅ Salvo em: {nome_arquivo}")
    except PermissionError:
        print(f"❌ ERRO: Feche o arquivo {nome_arquivo}!")
    except Exception: pass

def processar_e_salvar_relatorios(secrets):
    print("\n💾 SALVANDO ARQUIVOS...")
    lista_sucesso = []
    lista_pendentes = []
    
    for vaga in historico_vagas:
        status = vaga[4]
        if "Sucesso" in status or "Enviada" in status:
            lista_sucesso.append(vaga)
        else:
            lista_pendentes.append(vaga)
            
    if lista_sucesso: salvar_csv_seguro("vagas_sucesso.csv", lista_sucesso)
    if lista_pendentes: salvar_csv_seguro("vagas_pendentes.csv", lista_pendentes)
    
    enviar_relatorio_email(secrets)

def login_linkedin(driver, username, password):
    print("--- 🔑 FAZENDO LOGIN ---")
    driver.get("https://www.linkedin.com/login")
    time.sleep(3)
    try:
        driver.find_element(By.ID, "username").send_keys(username)
        driver.find_element(By.ID, "password").send_keys(password)
        driver.find_element(By.XPATH, "//button[@type='submit']").click()
        print("✅ Dados enviados.")
        print("\n" + "="*50 + "\n✋ PAUSA: Resolva Captcha e vá para o FEED.\n👉 Aperte ENTER aqui para continuar...\n" + "="*50)
        input()
    except Exception as e:
        print(f"❌ Erro no login: {e}")

def tentar_aplicar_sozinho(driver):
    try:
        time.sleep(2)
        # Procura botões de Enviar/Submit
        botoes_enviar = driver.find_elements(By.CSS_SELECTOR, "button[aria-label='Enviar candidatura'], button[aria-label='Submit application']")
        
        if botoes_enviar:
            botoes_enviar[0].click()
            time.sleep(2)
            try: driver.find_element(By.CSS_SELECTOR, "button[aria-label='Fechar'], button[aria-label='Dismiss']").click()
            except: pass
            return "Candidatura Enviada com Sucesso! ✅"
        else:
            # Se não achou enviar, fecha e marca como pendente
            try:
                driver.find_element(By.CSS_SELECTOR, "button[aria-label='Fechar'], button[aria-label='Dismiss']").click()
                time.sleep(1)
                driver.find_element(By.CSS_SELECTOR, "button[data-control-name='discard_application_confirm_btn']").click()
            except: pass
            return "Formulário complexo (Manual Necessário) ⚠️"
    except Exception as e:
        return f"Erro ao aplicar: {str(e)[:30]}"

def search_jobs(driver, positions, locations):
    print("--- 🔎 BUSCANDO E APLICANDO ---")
    
    for cargo in positions:
        for local in locations:
            print(f"\n📍 Pesquisando: {cargo} em {local}")
            url = f"https://www.linkedin.com/jobs/search/?keywords={cargo}&location={local}&f_AL=true"
            driver.get(url)
            time.sleep(5)
            
            try:
                try: driver.find_element(By.CSS_SELECTOR, "button[aria-label='Fechar']").click()
                except: pass

                # Pega a lista de cartões de vagas
                job_cards = driver.find_elements(By.CSS_SELECTOR, ".job-card-container")
                print(f"   Encontrei {len(job_cards)} vagas.")
                
                for i, card in enumerate(job_cards):
                    try:
                        # Rola até a vaga para ela ficar visível
                        driver.execute_script("arguments[0].scrollIntoView();", card)
                        
                        # --- CORREÇÃO AQUI: PEGA O LINK ANTES DE CLICAR ---
                        try:
                            # Procura o link dentro do cartão da vaga
                            link_elem = card.find_element(By.CSS_SELECTOR, "a.job-card-container__link")
                            link_vaga = link_elem.get_attribute("href").split("?")[0] # Limpa o link
                        except:
                            # Se falhar, usa o link atual como fallback (mas o de cima deve funcionar)
                            link_vaga = driver.current_url

                        # Agora sim, clica para abrir os detalhes na direita
                        card.click()
                        time.sleep(2) 
                        
                        try: titulo = driver.find_element(By.CLASS_NAME, "job-details-jobs-unified-top-card__job-title").text.strip()
                        except: titulo = cargo
                        try: empresa = driver.find_element(By.CLASS_NAME, "job-details-jobs-unified-top-card__company-name").text.strip()
                        except: empresa = "Empresa X"
                            
                        status = "Link Externo"
                        
                        # Procura o botão de aplicar
                        botoes = driver.find_elements(By.CLASS_NAME, "jobs-apply-button--top-card")
                        
                        if botoes:
                            texto = botoes[0].text.lower()
                            if "candidatura simplificada" in texto or "easy apply" in texto:
                                print(f"   👆 Tentando aplicar em: {titulo}")
                                botoes[0].click()
                                status = tentar_aplicar_sozinho(driver)
                            else:
                                status = "Link Externo (Não clicado)"
                        
                        agora = datetime.now().strftime("%d/%m/%Y %H:%M")
                        print(f"   📝 {i+1}. {titulo} -> {status}")
                        historico_vagas.append([agora, titulo, empresa, local, status, link_vaga])
                        
                    except Exception as e:
                        # Se der erro numa vaga, pula pra próxima
                        continue
                    
                    time.sleep(1) # Respira antes da próxima vaga
                
            except Exception as e:
                print(f"   Erro na lista: {e}")
            
            time.sleep(3)

def main():
    print("--- 🤖 ROBÔ FINAL CORRIGIDO ---")
    secrets = load_secrets()
    prefs = load_preferences()
    email = secrets.get("linkedin_username")
    password = secrets.get("linkedin_password")
    positions = prefs.get("positions", ["Java Developer"])
    locations = prefs.get("locations", ["Brazil"])

    try:
        driver = init_browser()
        login_linkedin(driver, email, password)
        search_jobs(driver, positions, locations)
    except KeyboardInterrupt:
        print("\n🛑 Parado pelo usuário.")
    except Exception as e:
        print(f"🚨 Erro: {e}")
    finally:
        processar_e_salvar_relatorios(secrets)
        print("\nFechando em 10 segundos...")
        time.sleep(10)

if __name__ == "__main__":
    main()