#!/usr/bin/env node
/**
 * Vérifie que la commande de récupération de chaque mission fonctionne
 * réellement : on l'exécute telle quelle, dans un conteneur jetable, contre un
 * portail de test.
 *
 *   node scripts/check-fetchhints.js [https://atelierdocker.laurans.org]
 *
 * Prérequis : un serveur qui tourne et un jeton. Le script s'inscrit tout seul
 * (« VerifSecrets ») et récupère son jeton.
 *
 * ATTENTION : ce script exécute de vraies commandes `docker run` sur la
 * machine où il tourne — des conteneurs jetables, mais il faut Docker, et il
 * faut la permission de lancer des conteneurs. En salle, le lancer depuis le
 * poste de l'enseignant, pas depuis celui d'un élève.
 */
import { spawn } from 'node:child_process';

const B = process.argv[2] ?? 'https://atelierdocker.laurans.org';
// SERVER_IP désigne l'origine complète, protocole compris : le portail est
// derrière Caddy, donc les commandes doivent repartir en https et sans port.
// Avec TRUST_PROXY=1, `req.protocol` vaut https et `req.hostname` ne porte
// pas de port — voir src/routes/api.js, champ fetch_hint.
const ORIGINE = new URL(B).origin;

/**
 * Rend la commande jouable : le contenu porte `https://SERVER_IP`, et il faut
 * le remplacer par l'origine **complète**, préfixe compris.
 *
 * Substituer seulement `SERVER_IP` produirait `https://https://…`, et le script
 * échouerait sur les 27 quêtes sans qu'aucune ne soit réellement cassée — ce
 * qui est arrivé, et a coûté une lecture du rapport d'échec avant de voir que le
 * portail répondait très bien.
 *
 * La même correction est appliquée côté serveur (`src/routes/api.js`, helper
 * `origin()`). Les deux doivent rester synchronisés : c'est le contrat § 2.5.
 */
const jouable = (cmd, jeton) => cmd
  .replaceAll('https://SERVER_IP', ORIGINE)
  .replaceAll('http://SERVER_IP', ORIGINE)
  .replaceAll('PLAYER_TOKEN', jeton)
  .replaceAll('dq_xxxxxxxxxxxxxxxx', jeton);

const { quests } = await import('../src/questpack.js');
const pack = quests();

// ── jeton
//
// Le nom de l'équipe est tiré au sort et **retenu** : le ménage doit viser ce
// nom exact. La V1 du script visait « Verif » et la CI visait « Verif_000000 »,
// donc aucune des deux ne supprimait quoi que ce soit — chaque exécution laissait
// un joueur de plus sur le portail de production. Le menu « Suivi de la classe
// » affichait des élèves qui n'en étaient pas.
const equipe = `Verif_${Date.now() % 100000}`;

const reg = await (await fetch(`${B}/api/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ team: equipe, mode: 'normal' }),
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
  const cmd = jouable(q.fetchHint, jeton);

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
}

// Le ménage passe **avant** la sortie, et dans les deux cas. Le joueur de
// vérification n'a rien à faire dans les données de production, et une
// exécution en échec est précisément celle dont on ne veut pas laisser de
// trace : c'est elle qu'on relance en boucle.
await menage();

process.exit(echecs.length ? 1 : 0);

/**
 * Supprime le joueur de vérification.
 *
 * Silencieux : sans clé d'administration — ou si le portail est en local, où il
 * n'y a rien à nettoyer — l'échec du ménage ne doit pas faire échouer la
 * vérification. Le joueur fantôme est inoffensif, la vérification ne l'est pas.
 */
async function menage() {
  try {
    const r = await fetch(`${B}/api/admin/delete/${equipe}`, { method: 'POST' });
    console.log(r.ok
      ? `\nJoueur de vérification ${equipe} supprimé.`
      : `\nJoueur ${equipe} non supprimé (HTTP ${r.status}) — à nettoyer à la main.`);
  } catch (e) {
    console.log(`\nMénage impossible : ${e.message}`);
  }
}
