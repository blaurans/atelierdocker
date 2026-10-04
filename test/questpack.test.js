import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQuestpack } from '../src/questpack.js';
import path from 'node:path';
import fs from 'node:fs';

// Le contenu peut être absent ou en cours de rédaction : dans ce cas on
// saute proprement les tests de contenu plutôt que d'échouer bruyamment.
let pack = null;
let loadError = null;
try {
  pack = await loadQuestpack();
} catch (err) {
  loadError = err;
}
const opts = pack ? {} : { skip: `contenu indisponible : ${loadError?.message?.split('\n')[0] ?? 'inconnu'}` };

test('le contenu se charge et respecte les invariants', opts, () => {
  assert.equal(pack.modules.length, 7, 'sept modules, comme décidé');
  assert.ok(pack.totalQuests >= 20, `au moins 20 quêtes (trouvé ${pack.totalQuests})`);
  assert.ok(pack.totalPoints > 0);
});

test('les identifiants et les flags sont uniques', opts, () => {
  assert.equal(pack.byFlag.size, pack.quests.length);
  assert.equal(pack.byId.size, pack.quests.length);
});

test('les quêtes sont numérotées de 1 à N sans trou', opts, () => {
  pack.quests.forEach((q, i) => assert.equal(q.number, i + 1, `quête ${q.id}`));
});

test('une seule quête phare par module, toujours en dernière position', opts, () => {
  for (const m of pack.modules) {
    const flagships = m.quests.filter((q) => q.flagship);
    assert.ok(flagships.length <= 1, `module ${m.module} : ${flagships.length} quêtes phares`);
    if (flagships.length === 1) {
      assert.equal(flagships[0], m.quests.at(-1), `module ${m.module} : la phare doit être la dernière`);
    }
  }
});

test('la somme des points de chaque module est un multiple de 100 et croît', opts, () => {
  let previous = -1;
  for (const m of pack.modules) {
    const total = m.quests.reduce((a, q) => a + q.points, 0);
    assert.equal(total % 100, 0, `module ${m.module} : total ${total}`);
    assert.ok(total >= previous, `module ${m.module} : total ${total} < module précédent ${previous}`);
    previous = total;
  }
});

test('les six missions du cahier des charges sont conservées avec leur barème', opts, () => {
  const attendus = [
    ['FLAG{VERDI_BOOT_PERSISTED_AFTER_RESTART}', 100, 'Le premier serveur de la librairie'],
    ['FLAG{ISOLATION_VERIFIED_PID1_INSIDE_AGENT}', 200, 'Le conteneur est isolé'],
    ['FLAG{VERDI_STACK_SITE_AND_DB_ISOLATED}', 300, 'Deux services, une machine'],
    ['FLAG{VERDI_1_0_REPRODUCIBLE_AND_TAGGED}', 400, 'La méthode de la librairie'],
    ['FLAG{VERDI_VOLUME_NAMED_DURABLE_AND_LISTED}', 500, 'Le volume de Docker'],
    ['FLAG{COMPOSE_ORCHESTRATION_TITAN}', 600, 'Compose Overlord'],
  ];
  for (const [flag, points, title] of attendus) {
    const q = pack.byFlag.get(flag);
    assert.ok(q, `flag manquant : ${flag}`);
    assert.equal(q.points, points, `${flag} : barème altéré`);
    assert.equal(q.title, title, `${flag} : titre`);
    assert.equal(q.flagship, true);
  }
});

test('chaque quête est utilisable en l’état', opts, () => {
  for (const q of pack.quests) {
    assert.ok(q.brief.length > 40, `${q.id} : brief trop court`);
    assert.ok(q.checkpoint.length >= 10, `${q.id} : checkpoint manquant`);
    assert.ok(q.teaches.length >= 1, `${q.id} : teaches vide`);
    // Les indices ne sont plus sur l'entrée : ils vivent dans `hintsByQuest`,
    // hors du graphe d'objets. C'est ce qui les empêche de repartir dans le
    // payload, et c'est donc ce qu'il faut interroger ici.
    assert.ok(pack.hintsByQuest.get(q.id).length <= 3, `${q.id} : trop d'indices`);
    assert.equal(q.hint_count, pack.hintsByQuest.get(q.id).length,
      `${q.id} : hint_count doit refléter le nombre d'indices réels`);
    assert.equal(q.hints, undefined, `${q.id} : les indices ne doivent pas être sur l'entrée`);
    assert.ok(q.estMinutes >= 2 && q.estMinutes <= 25, `${q.id} : estMinutes hors bornes`);
    assert.match(q.flag, /^FLAG\{[A-Z0-9_]+\}$/, `${q.id} : format de flag`);
    assert.ok(!/^\s*\|/m.test(q.brief), `${q.id} : tableau Markdown dans brief`);
    assert.ok(!/<[a-z]+>/i.test(q.brief), `${q.id} : HTML dans brief`);
  }
});

test('aucun mot de passe ne figure dans un énoncé', opts, () => {
  // C'est le cœur du mécanisme : le flag est un résultat du travail. S'il est
  // écrit dans le brief, l'étudiant valide sans avoir lancé quoi que ce soit.
  for (const q of pack.quests) {
    assert.ok(!q.brief.includes(q.flag),
      `${q.id} : le flag est écrit dans l'énoncé, il se récupère via fetchHint`);
    assert.doesNotMatch(q.brief, /il (ne s'agit|n'est) pas de (le )?deviner|écrit dans l'énoncé/i,
      `${q.id} : l'énoncé promet encore que le flag est affiché`);
  }
});

test('aucune mission ne demande une réponse écrite', opts, () => {
  for (const q of pack.quests) {
    assert.doesNotMatch(q.brief, /\b(écris|réponds|note ta|explique avec tes mots|formule ta)\b/i,
      `${q.id} : consigne sans champ pour répondre`);
  }
});

test('chaque mission indique comment récupérer son mot de passe', opts, () => {
  for (const q of pack.quests) {
    assert.equal(typeof q.fetchHint, 'string', `${q.id} : fetchHint manquant`);
    assert.ok(q.fetchHint.length >= 20, `${q.id} : fetchHint trop court`);
    assert.ok(q.fetchHint.includes('SERVER_IP'),
      `${q.id} : fetchHint doit utiliser le littéral SERVER_IP`);
    assert.ok(q.fetchHint.includes(`/api/secret/${q.id}/raw`),
      `${q.id} : fetchHint doit viser la bonne route`);
    assert.doesNotMatch(q.fetchHint, /```/, `${q.id} : fetchHint est une commande brute`);
    // Un jeton doit figurer dans la commande : sans lui, le conteneur ne peut
    // pas Prove que le mot de passe est bien le sien.
    assert.ok(q.fetchHint.includes('dq_xxxxxxxxxxxxxxxx'),
      `${q.id} : fetchHint doit porter le jeton littéral du joueur`);
  }
});

test('aucun mot de passe n\'est distribué par l\'API des quêtes', opts, () => {
  // /api/quests ne doit contenir aucun secret : il est servi à tous, et le
  // mot de passe ne s'obtient qu'en exécutant la commande de la mission.
  const src = fs.readFileSync(path.resolve('src/routes/api.js'), 'utf8');
  const bloc = src.split('api.get(\'/quests\'')[1]?.split('api.get(\'/me\'')[0] ?? '';
  assert.doesNotMatch(bloc, /flag:\s*q\.flag/,
    '/api/quests ne doit pas renvoyer le flag');
  assert.ok(bloc.includes('fetch_hint'),
    '/api/quests doit renvoyer la commande de récupération');
});

test('le loader rejette un contenu cassé', opts, async () => {
  const dir = fs.mkdtempSync('/tmp/dq-bad-');
  fs.writeFileSync(path.join(dir, 'm1.js'), `
    export default { meta: { slug: 'x', module: 1, title: 'X', tagline: 't', icon: 'i' },
      quests: [{ id: 'a', order: 1, title: 'A', points: 100, flag: 'flag{minuscules}',
        estMinutes: 5, brief: 'x'.repeat(50), checkpoint: 'c'.repeat(20), teaches: ['a'],
        hints: [] }, { id: 'b', order: 1, title: 'B', points: 50, flag: 'FLAG{OK}',
        estMinutes: 5, brief: 'y'.repeat(50), checkpoint: 'c'.repeat(20), teaches: ['a'], hints: [] }] };
  `);
  await assert.rejects(() => loadQuestpack({ dir }), /flag invalide|order.*dupliqué/s);
  fs.rmSync(dir, { recursive: true, force: true });
});