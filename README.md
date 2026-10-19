# 🤖 Automação de Candidaturas LinkedIn (AIHawk Custom)

> Bot em Python com automação de candidaturas Easy Apply, verificação passiva de status e acompanhamento das oportunidades em um dashboard SQLite.

![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![Selenium](https://img.shields.io/badge/Selenium-Automation-green)

## 📋 Sobre o Projeto

Este projeto foi desenvolvido como parte do meu portfólio em **Análise e Desenvolvimento de Sistemas**. O objetivo é aplicar conceitos de automação (RPA) para otimizar a busca por oportunidades de emprego.

Diferente de bots comuns, este projeto permite intervenção manual em momentos críticos (CAPTCHA) e registra as oportunidades e atividades diretamente no banco SQLite, consultado pelo dashboard.

### ✨ Funcionalidades Principais

* **Login Semiautomático:** O robô preenche as credenciais, mas pausa para que o usuário resolva verificações de segurança (2FA/Captcha), evitando bloqueios.
* **Busca Personalizada:** Filtra vagas por cargo e localização definidos em arquivo de configuração.
* **Captura Inteligente:** Extrai o link direto da vaga e o nome da empresa.
* **Candidatura Simplificada:**
    * Identifica vagas "Easy Apply".
    * Clica e tenta enviar a candidatura.
    * Detecta formulários complexos e os pula automaticamente.
* **Verificação de Estado:** Confere candidaturas já registradas e classifica vagas sem enviar novas candidaturas.
* **Triagem de Links Externos:** Isola no banco vagas com candidatura externa não cadastrada, sem abrir ou enviar candidatura no site externo.
* **Dashboard:** Consulta e gerencia oportunidades persistidas em `dashboard/kiwibot.db`.
* **Sem relatórios em arquivo ou e-mail:** O acompanhamento é feito pelo dashboard; resíduos CSV legados são expurgados ao iniciar e finalizar uma execução.

---

## 🛠️ Tecnologias Utilizadas

* **Linguagem:** Python 3.x
* **Automação Web:** Selenium WebDriver
* **Gestão de Configuração:** PyYAML
* **Persistência:** SQLite local em desenvolvimento ou API central autenticada

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
# Busca e candidatura Easy Apply
python main.py

# Verificação passiva de status e triagem de links externos
python verificar_candidaturas.py
```

### 7. Abra o Dashboard em modo local
Para desenvolvimento em uma única máquina, na pasta `dashboard`, instale as dependências do Node uma vez e inicie o servidor:

```bash
cd dashboard
npm install
npm start
```

O painel ficará disponível em `http://localhost:3000`. Por padrão, o Dashboard e o bot usam o SQLite local em `dashboard/kiwibot.db`. Esse modo não sincroniza dados com outras máquinas.

### 8. Configurar o Dashboard centralizado

Para sincronizar máquinas diferentes, hospede **uma única instância** do Dashboard/API em um servidor acessível por todas elas. Configure `KIWI_DB_PATH` para um arquivo SQLite em volume persistente; não use armazenamento efêmero, serverless ou múltiplas instâncias independentes. O diretório do banco deve existir e ser gravável pelo processo Node.

```bash
cd dashboard
KIWI_DB_PATH=/srv/kiwi/data/kiwibot.db PORT=3000 npm start
```

Disponibilize o servidor por HTTPS (por exemplo, atrás de um proxy reverso) e use esse mesmo endereço no navegador e nos bots remotos. Cadastre a conta pela tela de autenticação do Dashboard. Faça backup do volume persistente regularmente.

Para executar o bot em outra máquina, instale neste host o Python, as dependências do projeto e o Chrome/driver necessários. Configure `KIWI_API_URL` com a URL HTTPS do Dashboard e `KIWI_SESSION_TOKEN` com um token de sessão obtido pelo login na API. O token é uma credencial: injete-o por um gerenciador de segredos ou variável de ambiente protegida; não o comite nem o compartilhe. O bot iniciado pelo próprio Dashboard já recebe a URL e a sessão do usuário autenticado.

Exemplo de configuração do processo remoto (injete o token fora do código-fonte):

```bash
export KIWI_API_URL="https://dashboard.example.com"
export KIWI_SESSION_TOKEN="<token-de-sessao>"
python main.py
```

### 9. Migrar os dados locais

Faça a migração uma vez para cada conta de destino. O script lê o banco de origem em modo somente leitura, envia oportunidades e atividades em lotes para a conta autenticada e preserva o arquivo local. Por padrão, a origem é `dashboard/kiwibot.db`; informe `KIWI_SOURCE_DB` para usar outro caminho.

```bash
cd dashboard
KIWI_API_URL="https://dashboard.example.com" \
KIWI_SESSION_TOKEN="<token-de-sessao>" \
KIWI_SOURCE_DB="/caminho/para/kiwibot.db" \
node migrate_local_data.js
```

A importação é idempotente: repetir a migração não duplica os registros importados. Antes de migrar, faça backup da origem e confirme que a URL e o token correspondem à conta que deve receber os dados.

### 10. Verificar a instalação

Com o servidor iniciado, abra a URL no navegador, crie ou acesse a conta e confirme que o Dashboard carrega. Para testar entre máquinas, crie/atualize uma oportunidade e confira que ela aparece ao atualizar o Dashboard em outro dispositivo conectado ao mesmo servidor. O teste de verificação de candidaturas deve atualizar o estado sem enviar novas candidaturas; links externos não cadastrados devem aparecer como pendências para análise.

Verificações locais de sintaxe:

```bash
node --check dashboard/server.js
node --check dashboard/db.js
python3 -m compileall -q main.py verificar_candidaturas.py src
```

Os arquivos SQLite, JSON de runtime/cache e dependências instaladas são dados locais; não os versione nem use Git para sincronizar estado operacional.

## 📐 Diagramas da Arquitetura

Os diagramas SVG do sistema estão em [`docs/diagrams/`](docs/diagrams/):

* [Arquitetura do sistema](docs/diagrams/1_arquitetura_sistema.svg)
* [Modelo ER do banco de dados](docs/diagrams/2_erd_banco_de_dados.svg)
* [Sequência e fluxo de execução](docs/diagrams/3_uml_sequencia_fluxo.svg)
* [Classes e componentes](docs/diagrams/4_uml_classes_componentes.svg)

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
*Projeto desenvolvido para portfólio de Análise e Desenvolvimento de Sistemas.*# bot_de_vaga
