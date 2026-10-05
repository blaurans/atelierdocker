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

/**
 * Un appel JSON au portail, qui **recommence** si le serveur ne répond pas
 * proprement.
 *
 * La V1 faisait `await (await fetch(...)).json()`. Pendant un redéploiement,
 * Caddy renvoie une 502 au corps vide : le `JSON.parse` levait
 * « Unexpected end of JSON input », et le rapport disait un bug de JSON alors
 * que le vrai sujet était « le serveur était indisponible pendant trente
 * secondes ». Un diagnostic qui accuse le mauvais subsystem coûte plus cher
 * qu'un diagnostic muet.
 *
 * Le repli est justifié ici et seulement ici : ce script vise un portail
 * déployé, que l'on redémarre à côté. Les tests unitaires, eux, ne doivent
 * jamais réessayer — un test qui passe au deuxième essai ne teste rien.
 */
async function api(chemin, init, tentatives = 3) {
  for (let essai = 1; ; essai += 1) {
    let r;
    let texte = '';
    try {
      r = await fetch(`${B}${chemin}`, init);
      texte = await r.text();
    } catch (e) {
      if (essai >= tentatives) {
        throw new Error(`${chemin} : le portail ${B} ne répond pas (${e.message})`);
      }
      console.warn(`  … ${chemin} : ${e.message} — nouvel essai dans 5 s`);
      await new Promise((s) => setTimeout(s, 5000));
      continue;
    }
    if (!r.ok) {
      if (r.status >= 500 && essai < tentatives) {
        // 502/503 : le portail est en train de redémarrer. C'est transitoire.
        console.warn(`  … ${chemin} : HTTP ${r.status} — nouvel essai dans 5 s`);
        await new Promise((s) => setTimeout(s, 5000));
        continue;
      }
      throw new Error(`${chemin} : HTTP ${r.status} — ${texte.slice(0, 200)}`);
    }
    try {
      return JSON.parse(texte);
    } catch (e) {
      if (essai < tentatives) {
        console.warn(`  … ${chemin} : réponse illisible — nouvel essai dans 5 s`);
        await new Promise((s) => setTimeout(s, 5000));
        continue;
      }
      throw new Error(`${chemin} : réponse illisible — ${texte.slice(0, 200)}`);
    }
  }
}

const reg = await api('/api/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ team: equipe, mode: 'normal' }),
});
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

/**
 * Le portail était-il momentanément indisponible ?
 *
 * Une commande qui sort en `502 Bad Gateway` n'a pas échoué : elle n'a pas pu
 * être servie. La CI a fait passer un redéploiement pour vingt-et-une quêtes
 * cassées, parce que le script ne regardait que le statut du shell — qui était
 * zéro, la commande ayant bel et bien tourné.
 *
 * C'est la troisième fois que ce script accuse le contenu d'un incident qui
 * venait d'ailleurs, après le `https://https://` du tout premier commit et le
 * « portail injoignable » de `nettoie-verif.js`. Le motif est clair : un
 * diagnostic doit dire **quelle** chose a cassé, sinon il envoie chercher au
 * mauvais endroit pendant qu'il n'y a rien à voir.
 */
const TRANSITOIRE = /\b(502|503|504)\b|Bad Gateway|Service Unavailable|Gateway Time-?out|Connection refused|Connection reset|temporary failure in name resolution/i;

const indisponible = (r) => TRANSITOIRE.test(`${r.err ?? ''}\n${r.out ?? ''}`);

/**
 * Pourquoi le portail semblait indisponible, en une ligne.
 *
 * `curl -sS` sans `-f` sort en 0 sur une 502 et n'écrit rien sur stderr : le
 * statut ne se lit que dans le corps de la réponse. Lire `err` seul donnait
 * « portail indisponible () » — un diagnostic qui ne dit rien, donc un
 * diagnostic qui ne fait pas gagner de temps.
 */
const raison = (r) => {
  const texte = `${r.err ?? ''}\n${r.out ?? ''}`;
  const m = texte.match(TRANSITOIRE);
  if (!m) return '';
  // La ligne entière autour du motif, nettoyée : « 502 Bad Gateway » vaut
  // mieux qu'un code HTTP nu.
  const ligne = texte.split('\n').map((l) => l.trim()).find((l) => TRANSITOIRE.test(l));
  return (ligne ?? m[0]).replace(/\s+/g, ' ').slice(0, 70);
};

/** Une pause, courte : un redéploiement dure quelques secondes, pas une minute. */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const numero = String(q.number).padStart(2);
  const titre = q.title.padEnd(30);

  // Une commande est « réussie » quand elle rend un mot de passe. Si elle
  // échoue alors que le portail était manifestement indisponible, on réessaie
  // : le redéploiement est une chose normale à côté d'un portail déployé, et
  // elle ne doit pas se déguiser en quête cassée.
  let r = null;
  let secret = null;
  let ms = 0;
  for (let essai = 1; ; essai += 1) {
    const debut = Date.now();
    r = await sh(cmd);
    ms = Date.now() - debut;
    secret = secretOf(r);
    if (secret || !indisponible(r) || essai >= 3) break;
    console.log(`  … n°${numero} ${titre} portail indisponible — ${raison(r) || 'raison inconnue'}`
      + ` — nouvel essai dans 10 s`);
    await pause(10_000);
    // Les commandes créent des conteneurs nommés : un essai interrompu peut
    // avoir laissé un nom pris, qui ferait échouer le suivant pour une raison
    // qui n'a rien à voir avec la commande.
    await sh(NETTOYAGE, 60_000);
  }

  if (secret) {
    ok += 1;
    console.log(`  ✅ n°${numero} ${titre} ${String(ms).padStart(6)} ms  ${secret}`);
  } else {
    echecs.push(q);
    const cause = indisponible(r)
      ? `le portail est resté indisponible (${raison(r)}) — ce n'est pas la commande`
      : null;
    console.log(`  ❌ n°${numero} ${titre} ${String(ms).padStart(6)} ms${cause ? `  (${cause})` : ''}`);
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
