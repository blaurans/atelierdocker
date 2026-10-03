import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Test des plafonds de débit dans un sous-processus : le module lit
 * `RATE_LIMIT` au chargement, il faut donc un processus neuf pour tester le
 * mode actif et le mode désactivé.
 */

const MODEL = `
process.env.DB_FILE = '/tmp/dq-rl-' + process.pid + '-' + Date.now() + '.sqlite';
process.env.QUIET = '1';
process.env.RATE_LIMIT = process.env.RL_MODE ?? '';
const { createApp } = await import('../src/server.js');
const s = createApp().listen(0);
await new Promise((r) => s.once('listening', r));
const base = 'http://127.0.0.1:' + s.address().port;

const call = async (path, body) => {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.1.2.3' },
    body: JSON.stringify(body),
  });
  return r.status;
};

let codes = [];
for (let i = 0; i < 20; i++) {
  codes.push(await call('/api/register', { team: 'Flood ' + i, mode: 'normal' }));
}
console.log(JSON.stringify(codes));
s.close();
process.exit(0);
`;

async function run(mode) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const path = (await import('node:path')).resolve('test/ratelimit.model.mjs');
  const { writeFile, rm } = await import('node:fs/promises');
  const file = path;
  await writeFile(file, MODEL);
  try {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--no-warnings=ExperimentalWarning', file],
      { env: { ...process.env, RL_MODE: mode } },
    );
    return JSON.parse(stdout.trim().split('\n').at(-1));
  } finally {
    await rm(file, { force: true });
  }
}

test('les inscriptions sont plafonnées', { timeout: 60_000 }, async () => {
  const codes = await run('on');
  const ok = codes.filter((c) => c === 201).length;
  const refuses = codes.filter((c) => c === 429).length;

  assert.ok(ok > 0, 'au moins quelques inscriptions doivent passer');
  assert.ok(refuses > 0, 'la salve doit être refusée au-delà du plafond');
  assert.equal(ok + refuses, codes.length, 'aucun autre statut attendu');
  assert.ok(ok <= 12, `plafond dépassé : ${ok} inscriptions`);
});

test('RATE_LIMIT=off désactive le plafond', { timeout: 60_000 }, async () => {
  const codes = await run('off');
  assert.equal(codes.filter((c) => c === 429).length, 0, 'aucun refus attendu');
  assert.equal(codes.filter((c) => c === 201).length, codes.length);
});