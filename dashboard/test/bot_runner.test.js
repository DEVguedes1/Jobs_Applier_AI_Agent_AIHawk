const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createBotRunner } = require('../bot_runner');

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { writes: [], write(value) { this.writes.push(value); } };
  child.kill = () => true;
  return child;
}

test('dashboard continue resumes the same paused Python process', () => {
  const child = fakeChild();
  let spawnCount = 0;
  const runner = createBotRunner({
    rootDir: process.cwd(),
    spawnProcess: () => { spawnCount += 1; return child; }
  });
  const context = { userId: 'test-user', sessionToken: 'test-session', apiUrl: 'http://localhost' };

  assert.equal(runner.start('apply', context).success, true);
  assert.equal(runner.start('apply', context).success, false);
  assert.equal(spawnCount, 1);

  child.stdout.emit('data', Buffer.from('PAUSA: conclua o login no navegador\n'));
  assert.equal(runner.getStatus(context.userId).status, 'waiting_captcha');
  assert.equal(runner.continue(context.userId).success, true);
  assert.deepEqual(child.stdin.writes, ['\n']);
  assert.equal(runner.getStatus(context.userId).status, 'running');
});
