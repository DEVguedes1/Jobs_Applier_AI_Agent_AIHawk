#!/usr/bin/env python3
"""
Entrypoint: Verificação de Estado de Candidaturas e Classificação de Links Externos
Executa o fluxo de checagem passiva e isolamento de links externos sem candidatar.
100% gravado no banco SQLite kiwibot.db.
"""

import sys
import os

# Adiciona diretório raiz ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.status_verifier import run_verifier_flow

if __name__ == "__main__":
    run_verifier_flow()
