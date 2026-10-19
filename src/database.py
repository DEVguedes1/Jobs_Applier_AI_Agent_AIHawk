"""
Database Manager - Camada Central de Persistência SQLite
Elimina 100% o uso de arquivos CSV e e-mails no sistema.
Todas as operações escrevem e leem diretamente do banco de dados SQLite (kiwibot.db).
"""

import os
import glob
import sqlite3
import secrets
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from urllib.parse import urlsplit, urlunsplit
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

class DatabaseManager:
    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            # Encontra a raiz do projeto e aponta para dashboard/kiwibot.db
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            self.db_path = os.path.join(base_dir, "dashboard", "kiwibot.db")
            self.root_dir = base_dir
        else:
            self.db_path = os.path.abspath(db_path)
            self.root_dir = os.path.dirname(os.path.dirname(self.db_path))

        # Garante diretório
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self.init_db()

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    def init_db(self) -> None:
        """Cria as tabelas e índices se não existirem."""
        conn = self.get_connection()
        cur = conn.cursor()
        cur.executescript("""
            CREATE TABLE IF NOT EXISTS companies (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                website TEXT DEFAULT '',
                linkedin TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS opportunities (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                company_id TEXT,
                company_name TEXT NOT NULL,
                location TEXT DEFAULT 'Brasil',
                work_mode TEXT DEFAULT 'Remoto',
                stage TEXT NOT NULL DEFAULT 'pending',
                url TEXT DEFAULT '',
                date_added TEXT NOT NULL,
                date_applied TEXT,
                source TEXT DEFAULT 'LinkedIn Bot (Easy Apply)',
                notes TEXT DEFAULT '',
                salary TEXT DEFAULT '',
                original_status TEXT DEFAULT '',
                status TEXT DEFAULT 'active',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS activities (
                id TEXT PRIMARY KEY,
                opportunity_id TEXT,
                event_type TEXT NOT NULL,
                prev_value TEXT DEFAULT '',
                new_value TEXT DEFAULT '',
                description TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS bot_runs (
                id TEXT PRIMARY KEY,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                vagas_encontradas INTEGER DEFAULT 0,
                candidaturas_enviadas INTEGER DEFAULT 0,
                run_status TEXT DEFAULT 'running',
                log_output TEXT DEFAULT ''
            );

            CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
            CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
            CREATE INDEX IF NOT EXISTS idx_opportunities_company_id ON opportunities(company_id);
            CREATE INDEX IF NOT EXISTS idx_opportunities_url ON opportunities(url);
            CREATE INDEX IF NOT EXISTS idx_activities_opportunity_id ON activities(opportunity_id);
            CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);
        """)
        conn.commit()
        conn.close()

    def purge_csv_files(self) -> int:
        """
        Rotina de expurgo de arquivos CSV:
        Apaga quaisquer arquivos CSV residuais ou temporários no diretório do projeto.
        Retorna o total de arquivos apagados.
        """
        removidos = 0
        padroes = [
            os.path.join(self.root_dir, "*.csv"),
            os.path.join(self.root_dir, "dashboard", "*.csv"),
        ]
        for padrao in padroes:
            for filepath in glob.glob(padrao):
                try:
                    os.remove(filepath)
                    removidos += 1
                    print(f"🧹 [Expurgo CSV] Arquivo apagado: {os.path.basename(filepath)}")
                except Exception as e:
                    print(f"⚠️ [Expurgo CSV] Falha ao apagar {filepath}: {e}")
        return removidos

    def upsert_company(self, name: str, website: str = "", linkedin: str = "") -> str:
        """Busca ou cadastra a empresa pelo nome e retorna seu id."""
        if not name or not name.strip():
            name = "Empresa Não Informada"
        clean_name = name.strip()
        now = datetime.now().isoformat()

        conn = self.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM companies WHERE LOWER(name) = LOWER(?)", (clean_name,))
        row = cur.fetchone()
        if row:
            cid = row["id"]
        else:
            cid = secrets.token_hex(6)
            cur.execute("""
                INSERT INTO companies (id, name, website, linkedin, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (cid, clean_name, website, linkedin, now, now))
            conn.commit()
        conn.close()
        return cid

    def is_job_registered(self, url: str) -> bool:
        """
        Verifica se a URL já está cadastrada no banco de dados.
        Limpa parâmetros irrelevantes para comparação precisa.
        """
        if not url:
            return False
        clean_url = self._normalize_url(url)
        if not clean_url:
            return False
        conn = self.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT url FROM opportunities WHERE url IS NOT NULL AND url != ''")
        registered_urls = [row["url"] for row in cur.fetchall()]
        conn.close()
        return any(self._normalize_url(registered_url) == clean_url for registered_url in registered_urls)

    @staticmethod
    def _normalize_url(url: str) -> str:
        try:
            parsed = urlsplit(url.strip())
            if not parsed.scheme or not parsed.netloc:
                return ""
            return urlunsplit((
                parsed.scheme.lower(),
                parsed.netloc.lower(),
                parsed.path.rstrip("/"),
                "",
                ""
            ))
        except ValueError:
            return ""

    def isolate_external_unregistered(self, title: str, company: str, location: str, url: str) -> str:
        """
        FASE 2: Filtro de Links Externos:
        Se for um link externo E NÃO estiver previamente cadastrado no banco,
        o bot separa esse registro salvando com status 'LINK_EXTERNO_NAO_CADASTRADO'
        para análise posterior, sem processar no fluxo padrão de candidatura.
        """
        conn = self.get_connection()
        cur = conn.cursor()
        now_iso = datetime.now().isoformat()
        date_str = datetime.now().strftime("%d/%m/%Y %H:%M")

        cid = self.upsert_company(company)
        opp_id = "ext_" + secrets.token_hex(6)
        work_mode = "Remoto" if "remot" in (title + " " + location).lower() else "Presencial"

        cur.execute("""
            INSERT INTO opportunities
            (id, title, company_id, company_name, location, work_mode, stage, url,
             date_added, date_applied, source, notes, original_status, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            opp_id,
            title,
            cid,
            company,
            location,
            work_mode,
            "pending",
            url,
            date_str,
            None,
            "Link Externo (Não Cadastrado)",
            "Isolado automaticamente para triagem manual/posterior",
            "LINK_EXTERNO_NAO_CADASTRADO",
            "LINK_EXTERNO_NAO_CADASTRADO",
            now_iso,
            now_iso
        ))

        act_id = secrets.token_hex(8)
        act_desc = f"Link externo não-LinkedIn isolado para análise: {title} @ {company}"
        cur.execute("""
            INSERT INTO activities (id, opportunity_id, event_type, prev_value, new_value, description, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (act_id, opp_id, "link_externo_isolado", "", "LINK_EXTERNO_NAO_CADASTRADO", act_desc, now_iso))

        conn.commit()
        conn.close()
        print(f"📦 [Isolamento] Vaga com link externo separada no banco: {title} @ {company} (Status: LINK_EXTERNO_NAO_CADASTRADO)")
        return opp_id

    def save_or_update_opportunity(
        self,
        title: str,
        company: str,
        location: str,
        url: str,
        status_msg: str,
        is_success: bool = False
    ) -> str:
        """
        Salva ou atualiza a vaga diretamente no SQLite (substitui gravação em CSV).
        """
        conn = self.get_connection()
        cur = conn.cursor()
        now_iso = datetime.now().isoformat()
        date_str = datetime.now().strftime("%d/%m/%Y %H:%M")

        cid = self.upsert_company(company)
        stage = "applied" if is_success else "pending"
        work_mode = "Remoto" if "remot" in (title + " " + location).lower() else "Presencial"
        clean_url = url.split("?")[0].strip() if url else ""

        opp_id = None
        if clean_url:
            cur.execute("SELECT id, stage FROM opportunities WHERE url LIKE ? OR url = ?", (f"{clean_url}%", clean_url))
            opp_row = cur.fetchone()
            if opp_row:
                opp_id = opp_row["id"]
                prev_stage = opp_row["stage"]
                cur.execute("""
                    UPDATE opportunities
                    SET stage = ?, original_status = ?, date_applied = COALESCE(date_applied, ?), updated_at = ?
                    WHERE id = ?
                """, (stage, status_msg, date_str if is_success else None, now_iso, opp_id))

                if prev_stage != stage:
                    act_id = secrets.token_hex(8)
                    cur.execute("""
                        INSERT INTO activities (id, opportunity_id, event_type, prev_value, new_value, description, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (act_id, opp_id, "stage_change", prev_stage, stage, f"Estágio atualizado para: {stage}", now_iso))

        if not opp_id:
            opp_id = "bot_" + secrets.token_hex(6)
            cur.execute("""
                INSERT INTO opportunities
                (id, title, company_id, company_name, location, work_mode, stage, url,
                 date_added, date_applied, source, original_status, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                opp_id,
                title,
                cid,
                company,
                location,
                work_mode,
                stage,
                url,
                date_str,
                date_str if is_success else None,
                "LinkedIn Bot (Easy Apply)",
                status_msg,
                "active",
                now_iso,
                now_iso
            ))

            act_id = secrets.token_hex(8)
            act_desc = f"Candidatura enviada via robô: {title} @ {company}" if is_success else f"Vaga mapeada pelo robô: {title} @ {company}"
            cur.execute("""
                INSERT INTO activities (id, opportunity_id, event_type, prev_value, new_value, description, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (act_id, opp_id, "candidatura_enviada" if is_success else "criacao", "", stage, act_desc, now_iso))

        conn.commit()
        conn.close()
        return opp_id

    def get_opportunities_to_verify(self) -> List[Dict[str, Any]]:
        """Retorna oportunidades cadastradas com URL que podem ter status checado."""
        conn = self.get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, title, company_name, location, stage, url, original_status, status
            FROM opportunities
            WHERE url IS NOT NULL AND url != '' AND url LIKE '%linkedin.com/jobs/view%'
            ORDER BY updated_at DESC
        """)
        rows = [dict(row) for row in cur.fetchall()]
        conn.close()
        return rows

    def update_verified_status(self, opp_id: str, new_stage: str, new_status_msg: str, description: str) -> None:
        """Atualiza o status de uma vaga após verificação ativa."""
        conn = self.get_connection()
        cur = conn.cursor()
        now_iso = datetime.now().isoformat()

        cur.execute("SELECT stage, original_status FROM opportunities WHERE id = ?", (opp_id,))
        row = cur.fetchone()
        prev_stage = row["stage"] if row else ""

        cur.execute("""
            UPDATE opportunities
            SET stage = ?, original_status = ?, updated_at = ?
            WHERE id = ?
        """, (new_stage, new_status_msg, now_iso, opp_id))

        act_id = secrets.token_hex(8)
        cur.execute("""
            INSERT INTO activities (id, opportunity_id, event_type, prev_value, new_value, description, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (act_id, opp_id, "status_verificado", prev_stage, new_stage, description, now_iso))

        conn.commit()
        conn.close()

    def record_bot_run_start(self) -> str:
        """Registra o início de uma execução do bot."""
        run_id = secrets.token_hex(8)
        now_iso = datetime.now().isoformat()
        conn = self.get_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bot_runs (id, started_at, run_status)
            VALUES (?, ?, 'running')
        """, (run_id, now_iso))
        conn.commit()
        conn.close()
        return run_id

    def record_bot_run_finish(self, run_id: str, vagas: int, enviadas: int, status: str = "completed", log_output: str = "") -> None:
        """Registra o término da execução do bot."""
        now_iso = datetime.now().isoformat()
        conn = self.get_connection()
        cur = conn.cursor()
        cur.execute("""
            UPDATE bot_runs
            SET finished_at = ?, vagas_encontradas = ?, candidaturas_enviadas = ?, run_status = ?, log_output = ?
            WHERE id = ?
        """, (now_iso, vagas, enviadas, status, log_output, run_id))
        conn.commit()
        conn.close()


class CentralApiDatabaseManager:
    """Persists bot activity through the authenticated central dashboard API."""

    def __init__(self, api_url: str, session_token: str):
        if not api_url or not session_token:
            raise ValueError("KIWI_API_URL e KIWI_SESSION_TOKEN devem ser configurados juntos.")
        self.api_url = api_url.rstrip("/")
        self.session_token = session_token
        self.root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def _request(self, method: str, endpoint: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(
            f"{self.api_url}{endpoint}",
            data=body,
            method=method,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self.session_token}",
                **({"Content-Type": "application/json"} if body is not None else {})
            }
        )
        try:
            with urlopen(request, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"API central respondeu HTTP {error.code}: {detail}") from error
        except URLError as error:
            raise RuntimeError(f"Falha ao conectar à API central: {error.reason}") from error
        if not result.get("success"):
            raise RuntimeError(result.get("error") or "A API central rejeitou a operação.")
        return result

    def purge_csv_files(self) -> int:
        removidos = 0
        for pattern in (
            os.path.join(self.root_dir, "*.csv"),
            os.path.join(self.root_dir, "dashboard", "*.csv")
        ):
            for filepath in glob.glob(pattern):
                try:
                    os.remove(filepath)
                    removidos += 1
                    print(f"🧹 [Expurgo CSV] Arquivo apagado: {os.path.basename(filepath)}")
                except OSError as error:
                    print(f"⚠️ [Expurgo CSV] Falha ao apagar {filepath}: {error}")
        return removidos

    def is_job_registered(self, url: str) -> bool:
        query = urlencode({"url": url})
        return bool(self._request("GET", f"/api/bot/opportunities/exists?{query}").get("registered"))

    def isolate_external_unregistered(self, title: str, company: str, location: str, url: str) -> str:
        result = self._request("POST", "/api/bot/opportunities/external", {
            "title": title, "company": company, "location": location, "url": url
        })
        return result["id"]

    def save_or_update_opportunity(
        self,
        title: str,
        company: str,
        location: str,
        url: str,
        status_msg: str,
        is_success: bool = False
    ) -> str:
        result = self._request("POST", "/api/bot/opportunities", {
            "title": title,
            "company": company,
            "location": location,
            "url": url,
            "status_msg": status_msg,
            "is_success": is_success
        })
        return result["id"]

    def get_opportunities_to_verify(self) -> List[Dict[str, Any]]:
        return self._request("GET", "/api/bot/opportunities/verify").get("opportunities", [])

    def update_verified_status(
        self,
        opp_id: str,
        new_stage: str,
        new_status_msg: str,
        description: str
    ) -> None:
        self._request("PUT", f"/api/bot/opportunities/{opp_id}/status", {
            "stage": new_stage,
            "statusMessage": new_status_msg,
            "description": description
        })

    def record_bot_run_start(self) -> str:
        result = self._request("POST", "/api/bot/runs", {
            "runId": os.environ.get("KIWI_BOT_RUN_ID"),
            "startedAt": datetime.now().isoformat()
        })
        return result["runId"]

    def record_bot_run_finish(
        self,
        run_id: str,
        vagas: int,
        enviadas: int,
        status: str = "completed",
        log_output: str = ""
    ) -> None:
        self._request("PUT", f"/api/bot/runs/{run_id}", {
            "vagas": vagas,
            "enviadas": enviadas,
            "status": status,
            "logOutput": log_output,
            "finishedAt": datetime.now().isoformat()
        })


api_url = os.environ.get("KIWI_API_URL")
session_token = os.environ.get("KIWI_SESSION_TOKEN")
if bool(api_url) != bool(session_token):
    raise RuntimeError("Configure KIWI_API_URL e KIWI_SESSION_TOKEN para sincronizar com a API central.")

db_manager = (
    CentralApiDatabaseManager(api_url, session_token)
    if api_url and session_token
    else DatabaseManager()
)
