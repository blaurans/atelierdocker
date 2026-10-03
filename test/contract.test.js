import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Vérifie que l'implémentation respecte `docs/CONTRACTS.md`, le document que
 * les fichiers de quêtes et le client sont autorisés à consulter comme source
 * de vérité. Un test qui lit le contrat et le confront au code protège contre
 * la dérive entre les deux.
 *
 * Ces contrôles sont statiques (pas de serveur) : ils échouent au premier
 * écart entre la doc et le code, sans avoir à démarrer quoi que ce soit.
 */
import fs from 'node:fs';
import path from 'node:path';

const doc = fs.readFileSync(path.resolve('docs/CONTRACTS.md'), 'utf8');
const api = fs.readFileSync(path.resolve('src/routes/api.js'), 'utf8');
const scoring = fs.readFileSync(path.resolve('src/scoring.js'), 'utf8');
const progress = fs.readFileSync(path.resolve('src/progress.js'), 'utf8');
const portal = fs.readFileSync(path.resolve('src/portal.js'), 'utf8');
const ratelimit = fs.readFileSync(path.resolve('src/ratelimit.js'), 'utf8');
const server = fs.readFileSync(path.resolve('src/server.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));

/**
 * Les routes annoncées dans le document : celles du tableau §2.4 **et** les
 * trois routes historiques du cahier des charges (§2.1, §2.2, §2.3), qui sont
 * décrites dans leur propre section plutôt que dans le tableau.
 */
const routesAnnoncées = [
  ...[...doc.matchAll(/^\|\s*`?(GET|POST) (\/api\/[a-z/:]+)`?\s*\|/gim)]
    .map((m) => `${m[1].toUpperCase()} ${m[2]}`),
  'POST /api/register',
  'POST /api/submit',
  'GET /api/overview',
  'GET /api/secret/:questId',
  'GET /api/secret/:questId/raw',
];

test('le contrat décrit des routes', () => {
  assert.ok(routesAnnoncées.length >= 10, `seulement ${routesAnnoncées.length} routes listées`);
});

test('toutes les routes annoncées existent dans le code', () => {
  // Les routes sont montées sur un router Express : le code écrit '/quests'
  // là où la documentation écrit '/api/quests'. On normalise les deux côtés.
  const declarees = [...api.matchAll(/api\.(get|post|use)\(\s*'([^']*)'/g)]
    .map((m) => `${m[1].toUpperCase()} /api${m[2]}`.replace(/\/api$/, '/api'));

  const manquantes = [];
  for (const route of routesAnnoncées) {
    const [method, chemin] = route.split(' ');
    // `:param` et `:paramId` sont équivalents pour la comparaison.
    const normalise = (s) => s.replace(/:\w+/g, ':');
    const existe = declarees.some((d) => {
      const [dm, dc] = d.split(' ');
      return dm === method && normalise(dc) === normalise(chemin);
    });
    if (!existe) manquantes.push(route);
  }
  assert.deepEqual(manquantes, [], `routes documentées mais absentes : ${manquantes.join(', ')}`);
});

test('toutes les routes du code sont documentées', () => {
  const declarees = [...api.matchAll(/api\.(get|post)\(\s*'([^']*)'/g)]
    .map((m) => `${m[1].toUpperCase()} /api${m[2]}`);
  const undocumented = declarees.filter((r) => !routesAnnoncées.includes(r));
  assert.deepEqual(undocumented, [], `routes du code absentes du contrat : ${undocumented.join(', ')}`);
});

test('le contrat annonce des limites de débit, le code les applique', () => {
  for (const [nom, limite] of [
    ['register', 12], ['submit', 40], ['quests', 120], ['live', 300], ['api', 600],
  ]) {
    assert.ok(doc.includes(String(limite)), `le contrat ne mentionne pas le plafond ${limite}`);
    assert.match(ratelimit, new RegExp(`${nom}:\\s*rateLimit\\(\\{\\s*limit:\\s*${limite}`),
      `src/ratelimit.js ne déclare pas ${nom} à ${limite}`);
  }
  assert.match(ratelimit, /RATE_LIMIT/, 'l\'activation/désactivation des plafonds doit être pilotable');
  assert.match(ratelimit, /TRUST_PROXY/, 'le comptage doit dépendre de la présence d\'un proxy');
  // Sans cette garde, un X-Forwarded-For forgé réinitialiserait le compteur.
  assert.match(ratelimit, /if \(TRUST_PROXY\)[\s\S]{0,200}x-forwarded-for/,
    'X-Forwarded-For doit être conditionné à TRUST_PROXY');
});

test('le contrat décrit les champs de la réponse de submit', () => {
  const bloc = doc.split('### 2.2')[1].split('### 2.3')[0];
  const champs = [...bloc.matchAll(/^\s*"?(\w+)"?:/gm)].map((m) => m[1]);
  assert.ok(champs.length >= 10, 'la doc doit lister les champs de la réponse');
  for (const champ of champs) {
    assert.ok(api.includes(champ), `src/routes/api.js ne produit jamais « ${champ} »`);
  }
});

test('le contrat décrit les champs de overview attendus par le PDF', () => {
  const bloc = doc.split('### 2.3')[1].split('### 2.4')[0];
  for (const champ of ['team', 'mode', 'score', 'completed', 'last_submission', 'finished', 'rank', 'progress']) {
    assert.ok(bloc.includes(champ), `le contrat ne documente pas « ${champ} »`);
    assert.ok(portal.includes(champ), `src/portal.js ne produit pas « ${champ} »`);
  }
});

test('le barème documenté correspond au code', () => {
  // §3.1 : 60 / 30 / 15, plafond 25 %, malus 5, plancher base/2.
  assert.match(scoring, /SPEED_BONUS = \[60, 30, 15\]/);
  assert.match(scoring, /PENALTY_PER_WRONG_FLAG = 5/);
  assert.match(scoring, /PACE_BONUS_RATIO = 0\.25/);
  assert.match(scoring, /Math\.round\(base \/ 2\)/, 'le plancher à base/2 doit exister');
  assert.ok(doc.includes('base + podium + vitesse − malus'), 'le contrat doit résumer la formule');
});

test('le contrat impose un podium par mission, pas par joueur', () => {
  // §3.1 : le rang est global à la mission parmi les compétitifs.
  const repo = fs.readFileSync(path.resolve('src/repo/arena.js'), 'utf8');
  const bloc = repo.split('rankForQuest')[1]?.slice(0, 600) ?? '';
  assert.match(bloc, /p\.mode = 'competitive'/,
    'le décompte du podium doit exclure le mode normal');
  assert.ok(doc.includes('parmi les compétitifs'), 'le contrat doit le dire');
});

test('le contrat impose un score recalculé, jamais incrémenté', () => {
  assert.match(progress, /export function recomputeScore/);
  // Le score ne doit être écrit que par cette fonction.
  const writes = api.match(/setScore\(|UPDATE players SET score/g) ?? [];
  assert.equal(writes.length, 0, 'aucune écriture directe du score dans les routes');
  assert.ok(doc.includes('jamais incrémenté'));
});

test('le contrat annonce les choix de pile, le code les respecte', () => {
  assert.equal(Object.keys(pkg.dependencies).length, 1, 'une seule dépendance de production');
  assert.ok('express' in pkg.dependencies);
  assert.ok('linkedom' in pkg.devDependencies, 'linkedom est une devDependency');
  assert.ok(doc.includes('node:sqlite'));
  // Le contrat peut mentionner better-sqlite3 uniquement pour expliquer qu'on
  // l'a écarté ; il ne doit plus le recommander.
  assert.ok(
    !/dépendances?[^.]*better-sqlite3|besoin de[^.]*better-sqlite3/i.test(doc),
    'le contrat ne doit plus recommander better-sqlite3',
  );
  assert.ok(!api.includes('better-sqlite3'), 'le code ne doit plus l\'importer');
  // db.js et le README peuvent en parler pour expliquer le choix, jamais
  // l'importer : on vérifie l'absence d'import réel.
  for (const f of ['src/db.js', 'README.md']) {
    const src = fs.readFileSync(path.resolve(f), 'utf8');
    assert.doesNotMatch(src, /(?:import|require)\s*\(?\s*['"]better-sqlite3/,
      `${f} ne doit pas importer better-sqlite3`);
  }
  // SQLite natif, transactions imbriquables.
  assert.match(fs.readFileSync(path.resolve('src/db.js'), 'utf8'), /SAVEPOINT/);
});

test('le contrat exige un démarrage bloqué si le contenu est invalide', () => {
  const questpack = fs.readFileSync(path.resolve('src/questpack.js'), 'utf8');
  assert.match(questpack, /await loadQuestpack\(\)/, 'le chargement doit être au démarrage du module');
  assert.ok(doc.includes('empêche le serveur de démarrer'));
});

test('le contrat impose les règles de verrouillage du client', () => {
  // §2.4 : la correction n'est envoyée que pour une mission validée.
  assert.ok(api.includes('solution: done.has(q.id) ? q.solution : null'),
    'la correction doit être conditionnée à la validation');
  assert.ok(doc.includes('uniquement pour les missions validées'));
});

test('le contrat documente que le temps n\'existe pas en mode normal', () => {
  const bloc = doc.split('### 3.4')[1] ?? '';
  assert.ok(bloc.includes('jamais renvoyé par l\'API'));
  assert.ok(api.includes('time_display: competitive ?'), 'la réponse doit conditionner le temps');
  assert.ok(progress.includes('competitive'), 'le score doit dépendre du mode');
});

test('le contrat et le README annoncent les mêmes chiffres', () => {
  const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');
  // Le README annonce un nombre de tests : il doit exister dans la suite.
  const annonce = readme.match(/npm test\s+#\s*(\d+) tests/);
  assert.ok(annonce, 'le README doit indiquer le nombre de tests');
  const fichiers = fs.readdirSync(path.resolve('test')).filter((f) => f.endsWith('.test.js'));
  assert.ok(fichiers.length >= 6, 'la suite doit être répartie sur plusieurs fichiers');
  assert.ok(Number(annonce[1]) >= fichiers.length, 'le nombre annoncé doit être plausible');
});
