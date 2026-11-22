const { execFile } = require('child_process');
const { promisify } = require('util');
const { logger } = require('./logger');
const { resolvePythonCommand } = require('./bot_runner');

const execFileAsync = promisify(execFile);

function isExactVersionMismatch(installed, declared) {
  const expected = String(declared || '').match(/^={1,2}\s*(.+)$/)?.[1];
  return !!expected && installed !== 'not installed' && installed !== expected;
}

async function reportStartupDiagnostics(rootDir) {
  const python = resolvePythonCommand(rootDir);
  logger.info('DIAGNOSTIC.NODE', 'Node runtime detected', {
    version: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
    port: process.env.PORT || '3000',
    rootDir
  });
  logger.info('DIAGNOSTIC.PYTHON', 'Running Python environment diagnostic', { executable: python });

  try {
    const { stdout } = await execFileAsync(python, ['-u', 'scripts/diagnose_environment.py'], {
      cwd: rootDir,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, ATF_NODE_VERSION: process.versions.node }
    });
    const report = JSON.parse(stdout);
    const playwright = report.playwright || {};
    const severity = isExactVersionMismatch(playwright.installed, playwright.declared)
      ? 'warn'
      : 'info';
    logger[severity]('DIAGNOSTIC.ENVIRONMENT', 'Runtime compatibility report', report);
    if (report.browser?.detected === 'not detected') {
      logger.warn('DIAGNOSTIC.BROWSER', 'Selected browser was not detected on this host', { selected: report.browser.selected });
    }
    return report;
  } catch (error) {
    logger.error('DIAGNOSTIC.PYTHON', 'Could not collect Python/browser diagnostic', {
      executable: python,
      error: error.message
    });
    return null;
  }
}

module.exports = { reportStartupDiagnostics, isExactVersionMismatch };
