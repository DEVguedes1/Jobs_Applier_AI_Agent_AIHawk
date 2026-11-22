"""Convert graceful termination requests into normal Python cleanup paths."""

import signal


def install_graceful_termination_handler():
    """Let SIGTERM run the active flow's finally block and close its browser."""
    def handle_sigterm(_signum, _frame):
        raise KeyboardInterrupt("SIGTERM recebido; encerrando automação com limpeza")

    signal.signal(signal.SIGTERM, handle_sigterm)
