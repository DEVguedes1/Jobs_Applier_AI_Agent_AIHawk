# 🤖 Automação de Candidaturas LinkedIn (AIHawk Custom)

> Bot desenvolvido em Python para automatizar o processo de busca e candidatura a vagas no LinkedIn, gerando relatórios detalhados em Excel e notificações automáticas por e-mail.

![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![Selenium](https://img.shields.io/badge/Selenium-Automation-green)

## 📋 Sobre o Projeto

Este projeto foi desenvolvido como parte do meu portfólio em **Análise e Desenvolvimento de Sistemas**. O objetivo é aplicar conceitos de automação (RPA) para otimizar a busca por oportunidades de emprego.

Diferente de bots comuns, este projeto foca em segurança e organização: ele navega como um humano, permite intervenção manual em momentos críticos (CAPTCHA) e gera um histórico completo das atividades.

### ✨ Funcionalidades Principais

* **Login Semiautomático:** O robô preenche as credenciais, mas pausa para que o usuário resolva verificações de segurança (2FA/Captcha), evitando bloqueios.
* **Busca Personalizada:** Filtra vagas por cargo e localização definidos em arquivo de configuração.
* **Captura Inteligente:** Extrai o link direto da vaga e o nome da empresa, mesmo em listagens dinâmicas.
* **Candidatura Simplificada:**
    * Identifica vagas "Easy Apply".
    * Clica e tenta enviar a candidatura.
    * Detecta formulários complexos e os pula automaticamente.
* **Relatórios Automáticos:** Gera dois arquivos CSV (`vagas_sucesso.csv` e `vagas_pendentes.csv`) para controle.
* **Notificação por E-mail:** Envia os relatórios para o e-mail do usuário ao finalizar a execução.

---

## 🛠️ Tecnologias Utilizadas

* **Linguagem:** Python 3.x
* **Automação Web:** Selenium WebDriver
* **Gestão de Configuração:** PyYAML
* **Manipulação de Dados:** CSV (Nativo)
* **Envio de E-mails:** SMTPLib (Nativo)

---

## ⚙️ Pré-requisitos

* Python instalado (versão 3.10 ou superior).
* Google Chrome instalado.
* Git instalado.

---

## 🚀 Instalação e Execução

### 1. Clone o repositório
```bash
git clone https://github.com/SEU-USUARIO/NOME-DO-REPO.git
cd NOME-DO-REPO
```

### 2. Crie o ambiente virtual
```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

### 3. Instale as dependências
```bash
pip install -r requirements.txt
```

### 4. Configure as credenciais
Crie um arquivo chamado `secrets.yaml` dentro da pasta `data_folder` com o seguinte conteúdo:

```yaml
linkedin_username: "SEU_EMAIL_LINKEDIN"
linkedin_password: "SUA_SENHA_LINKEDIN"

# Configurações de Email (Necessário criar Senha de App no Google)
gmail_user: "EMAIL_QUE_VAI_ENVIAR@gmail.com"
gmail_app_password: "SENHA_DE_APP_DE_16_DIGITOS"
```

### 5. Configure as preferências
Crie um arquivo chamado `work_preferences.yaml` dentro da pasta `data_folder`:

```yaml
positions:
  - "Estágio em Desenvolvimento"
  - "Java Developer Junior"

locations:
  - "Brasil"
  - "Remoto"
```

### 6. Execute o robô
```bash
python main.py
```

---

## ⚠️ Aviso Legal

Este software foi desenvolvido estritamente para fins educacionais e de aprendizado sobre automação web. O uso de bots automatizados pode infringir os Termos de Serviço do LinkedIn. Utilize com moderação e responsabilidade. O autor não se responsabiliza pelo uso indevido da ferramenta.

---

## 📞 Contato

**Nicolas Guedes**

* [LinkedIn](https://www.linkedin.com/in/nicolas-guedes)
* [GitHub](https://github.com/DEVguedes1)
* E-mail: nicolasguedesguedes081@gmail.com

---
*Projeto desenvolvido para portfólio de Análise e Desenvolvimento de Sistemas.*