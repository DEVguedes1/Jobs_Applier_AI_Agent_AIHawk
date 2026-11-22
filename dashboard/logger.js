const fs = require('fs');
const path = require('path');

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
const SECRET_PATTERNS = [
  /(authorization\s*[:=]\s*bearer)\s+[^\s,;]+/gi,
  /(kiwi_session=)[^;\s]+/gi,
  /(password|passwd|token|cookie|secret)\s*([:=])\s*([^\s,;&]+)/gi,
  /([?&](?:token|password|session|secret|key)=)[^&#\s]+/gi
];

function redact(value) {
  let text = String(value);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (_match, a, b) => {
      if (b === undefined) return `${a} [REDACTED]`;
      return `${a}${b}[REDACTED]`;
    });
  }
  return text;
}

function createLogger({ logDir = path.join(__dirname, 'logs'), level = process.env.ATF_LOG_LEVEL || 'INFO', stdout = process.stdout } = {}) {
  const threshold = LEVELS[String(level).toUpperCase()] || LEVELS.INFO;
  const retentionDays = 14;
  fs.mkdirSync(logDir, { recursive: true });
  let activeDate = '';
  let activePath = '';

  function cleanupOldLogs() {
    const oldestAllowed = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(logDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/^atf-\d{4}-\d{2}-\d{2}\.log$/.test(entry.name)) continue;
      const filePath = path.join(logDir, entry.name);
      try {
        if (fs.statSync(filePath).mtimeMs < oldestAllowed) fs.unlinkSync(filePath);
      } catch (_) {
        // A concurrent process may rotate or remove a file while cleanup runs.
      }
    }
  }

  function write(levelName, origin, message, fields = {}) {
    const severity = String(levelName || 'INFO').toUpperCase();
    if ((LEVELS[severity] || LEVELS.INFO) < threshold) return null;
    const timestamp = new Date().toISOString();
    const date = timestamp.slice(0, 10);
    if (activeDate !== date) {
      activeDate = date;
      activePath = path.join(logDir, `atf-${date}.log`);
      cleanupOldLogs();
    }

    const record = {
      timestamp,
      level: severity,
      origin: String(origin || 'SERVER'),
      message: redact(message),
      ...fields
    };
    const line = JSON.stringify(record);
    stdout.write(`${line}\n`);
    fs.appendFile(activePath, `${line}\n`, error => {
      if (error) stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: 'ERROR', origin: 'LOGGER', message: `Não foi possível gravar arquivo de log: ${redact(error.message)}` })}\n`);
    });
    return record;
  }

  return {
    debug: (origin, message, fields) => write('DEBUG', origin, message, fields),
    info: (origin, message, fields) => write('INFO', origin, message, fields),
    warn: (origin, message, fields) => write('WARN', origin, message, fields),
    error: (origin, message, fields) => write('ERROR', origin, message, fields),
    retentionDays
  };
}

const logger = createLogger();

module.exports = { createLogger, logger, redact };
