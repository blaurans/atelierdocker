#!/usr/bin/env node
/**
 * Vérifie que la commande de récupération de chaque mission fonctionne
 * réellement : on l'exécute telle quelle, dans un conteneur jetable, contre un
 * portail de test.
 *
 *   node scripts/check-fetchhints.js [http://IP:8000]
 *
 * Prérequis : un serveur qui tourne et un jeton. Le script s'inscrit tout seul
 * (« VerifSecrets ») et récupère son jeton.
 */
import { spawn } from 'node:child_process';

const B = process.argv[2] ?? 'http://127.0.0.1:8000';
// SERVER_IP désigne l'hôte SANS port : les commandes portent déjà « :8000 ».
const HOSTNAME = new URL(B).hostname;

const { quests } = await import('../src/questpack.js');
const pack = quests();

// ── jeton
const reg = await (await fetch(`${B}/api/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ team: `Verif_${Date.now() % 100000}`, mode: 'normal' }),
})).json();
if (!reg.token) {
  console.error('inscription impossible :', reg.error ?? reg);
  process.exit(1);
}
const jeton = reg.token;

// ── exécution Docker
function sh(cmd, timeoutMs = 90_000) {
  return new Promise((res) => {
    const p = spawn('sh', ['-c', cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('close', (code) => { clearTimeout(t); res({ code, out, err }); });
  });
}

const secretOf = (r) => (r.out.match(/FLAG\{[A-Z0-9]+\}/) || [])[0] ?? null;

console.log(`Portail ${B} — vérification des ${pack.totalQuests} commandes\n`);

// Ménage avant de commencer : les missions créent des conteneurs nommés et des
// images. Un essai interrompu laisserait des noms occupés, et l'erreur
// « name already in use » ferait échouer la vérification pour une raison
// étrangère à la commande elle-même.
const NETTOYAGE = [
  'docker ps -aq --filter name=m3- | xargs -r docker rm -f',
  'docker ps -aq --filter name=m4- | xargs -r docker rm -f',
  'docker ps -aq --filter name=arena | xargs -r docker rm -f',
  'docker ps -aq --filter name=pass- | xargs -r docker rm -f',
  'docker images -q "pass-*" | xargs -r docker rmi -f',
  'docker volume ls -q | grep -E "^(m6-|arena|pass)" | xargs -r docker volume rm -f',
  'docker network ls -q | grep -E "^(m7-|arena|pass)" | xargs -r docker network rm -f',
  'rm -rf /tmp/arena*',
].join('; ');
await sh(NETTOYAGE, 60_000);

let ok = 0;
const echecs = [];

for (const q of pack.quests) {
  // Substitution identique à celle du client.
  // Substitution identique à celle du client (src/routes/api.js).
  const cmd = q.fetchHint
    .replaceAll('SERVER_IP', HOSTNAME)
    .replaceAll('PLAYER_TOKEN', jeton)
    .replaceAll('dq_xxxxxxxxxxxxxxxx', jeton);

  const debut = Date.now();
  const r = await sh(cmd);
  const ms = Date.now() - debut;
  const secret = secretOf(r);

  if (secret) {
    ok += 1;
    console.log(`  ✅ n°${String(q.number).padStart(2)} ${q.title.padEnd(30)} ${String(ms).padStart(6)} ms  ${secret}`);
  } else {
    echecs.push(q);
    console.log(`  ❌ n°${String(q.number).padStart(2)} ${q.title.padEnd(30)} ${String(ms).padStart(6)} ms`);
    console.log(`     cmd : ${cmd.replaceAll('\n', ' ⏎ ').slice(0, 150)}`);
    const err = (r.err || '').trim().split('\n').filter(Boolean).slice(-2).join(' | ');
    if (err) console.log(`     err : ${err.slice(0, 150)}`);
  }

  // Ménage après chaque mission : les commandes créent des conteneurs nommés,
  // des volumes et des images. Sans cela, la mission suivante échoue sur un
  // nom déjà pris — et l'échec masque la vraie cause.
  await sh(NETTOYAGE, 60_000);
}

console.log(`\n${ok}/${pack.totalQuests} commandes fonctionnent réellement.`);

if (echecs.length) {
  console.log(`\nÉchecs :`);
  for (const q of echecs) console.log(`  · n°${q.number} ${q.title} (${q.id})`);
  process.exit(1);
}

// Ménage du joueur de vérification
await fetch(`${B}/api/admin/delete/Verif`, { method: 'POST' }).catch(() => {});
process.exit(0);
