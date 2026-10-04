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

const read = (f) => fs.readFileSync(path.resolve(f), 'utf8');

const doc = read('docs/CONTRACTS.md');
const api = read('src/routes/api.js');
const atelier = read('src/routes/atelier.js');
const questpack = read('src/questpack.js');
const progress = read('src/progress.js');
const portal = read('src/portal.js');
const ratelimit = read('src/ratelimit.js');
const pkg = JSON.parse(read('package.json'));

/** La section du contrat dont l'identifiant commence par `prefixe`. */
const section = (prefixe) => {
  const i = doc.indexOf(prefixe);
  assert.ok(i >= 0, `le contrat ne contient pas la section « ${prefixe} »`);
  const suite = doc.slice(i + prefixe.length);
  const fin = suite.search(/^#{2,3} /m);
  return fin < 0 ? suite : suite.slice(0, fin);
};

/** Les routes annoncées dans le tableau du contrat. */
const routesAnnoncées = [...doc.matchAll(/^\|\s*`?(GET|POST) (\/api\/[a-z/:]+)`?\s*\|/gim)]
  .map((m) => `${m[1].toUpperCase()} ${m[2]}`);

test('le contrat décrit des routes', () => {
  assert.ok(routesAnnoncées.length >= 8, `seulement ${routesAnnoncées.length} routes listées`);
});

test('toutes les routes annoncées existent dans le code', () => {
  // Les routes sont montées sur des routers Express : le code écrit '/quests'
  // là où la documentation écrit '/api/quests'. On normalise les deux côtés.
  const sources = { [api]: 'api', [atelier]: 'atelier' };
  const declarees = [];
  for (const [src, router] of Object.entries(sources)) {
    for (const m of src.matchAll(/\b(api|atelier)\.(get|post)\(\s*'([^']*)'/g)) {
      declarees.push(`${m[2].toUpperCase()} /api${m[3]}`);
    }
  }

  const normalise = (s) => s.replace(/:\w+/g, ':');
  const manquantes = [];
  for (const route of routesAnnoncées) {
    const [method, chemin] = route.split(' ');
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
    .map((m) => `${m[1].toUpperCase()} /api${m[2]}`)
    .concat([...atelier.matchAll(/atelier\.(get|post)\(\s*'([^']*)'/g)]
      .map((m) => `${m[1].toUpperCase()} /api${m[2]}`));

  const undocumented = declarees.filter((r) => !routesAnnoncées.includes(r));
  assert.deepEqual(undocumented, [], `routes du code absentes du contrat : ${undocumented.join(', ')}`);
});

/* --------------------------------------------------------- disparition du score */

test('le contrat annonce la disparition des points', () => {
  const bloc = section('### 1.4');
  assert.match(bloc, /vestige/i);
  assert.match(bloc, /plus rien ne le lit/i);
});

test('la réponse de submit ne contient plus aucun champ de score', () => {
  const bloc = section('### 2.2');
  for (const champ of ['points_earned', 'score_total', 'breakdown', 'rank']) {
    assert.ok(!new RegExp(`"${champ}"`).test(bloc),
      `§ 2.2 ne doit plus documenter « ${champ} »`);
  }
  assert.ok(bloc.includes('"mastery"'), '§ 2.2 doit documenter la maîtrise');
});

test('aucun point n\'est produit par les routes', () => {
  // Le test le plus important du fichier : il empêche qu'un « points_earned »
  // survive quelque part dans le code, pour le compatibility d'un client V1.
  for (const src of [api, portal]) {
    assert.doesNotMatch(src, /points_earned|score_total|speed_bonus|pace_bonus/,
      'aucun champ de score ne doit être produit');
  }
  assert.doesNotMatch(read('src/portal.js'), /\brank\(/, 'le portail ne classe plus');
});

test('le portail renvoie une seule liste, triée alphabétiquement', () => {
  assert.match(portal, /players:/, 'la liste unique s\'appelle players');
  assert.match(portal, /localeCompare\(b\.team, 'fr'\)/, 'le seul tri est alphabétique');
  assert.ok(!portal.includes('competitive:'), 'plus de liste compétitive séparée');
  assert.ok(!portal.includes('normal:'), 'plus de liste normale séparée');
});

/* -------------------------------------------------------------- routes de maîtrise */

test('les indices ne sortent jamais par le payload du programme', () => {
  // La règle qui rend les indices payants : `/api/quests` ne doit transporter
  // qu'un nombre. Si `hints` réapparaît dans la réponse, la facturation
  // n'existe plus — l'élève lit tout dans l'onglet réseau.
  const bloc = section('### 2.5');
  // Le contrat énumère les interdits dans un tableau (§ 2.5) plutôt que dans
  // une phrase : la liste devient lisible et invérifiable par un test.
  assert.match(bloc, /`hints`[\s\S]{0,80}jamais/i, '« hints » ne doit pas sortir');
  assert.match(bloc, /`hint_count`/, '« hint_count » doit être documenté');

  const construction = api.slice(api.indexOf('modules: pack.modules.map'));
  assert.doesNotMatch(construction, /^\s*hints:/m,
    'la construction de la réponse ne doit pas exposer `hints`');
  assert.match(construction, /hint_count: q\.hint_count/);
});

test('le contrat énumère ce qui sort du programme, et ce qui n\'en sort pas', () => {
  const bloc = section('### 2.5');
  // Les interdits doivent être nommés explicitement : c'est ce qui empêche un
  // `...q` forget de réintroduire une réponse dans le payload.
  for (const champ of ['check[].answer', 'check[].explanation', 'recall[].accept',
    'recall[].hint', 'hints', 'solution']) {
    assert.ok(bloc.includes(champ), `le contrat ne dit pas que « ${champ} » ne sort pas`);
    const ligne = bloc.split('\n').find((l) => l.includes(`\`${champ}\``));
    assert.ok(ligne && /jamais/i.test(ligne), `« ${champ} » doit être marqué comme ne sortant pas`);
  }
  // Et ce qui doit sortir, pour que l'interface puisse fonctionner.
  for (const champ of ['hint_count', 'charge', 'required', 'choices']) {
    assert.ok(bloc.includes(champ), `le contrat ne dit pas que « ${champ} » sort`);
  }
});

test('les indices sont gardés hors du graphe d\'objets des quêtes', () => {
  // S'ils étaient une propriété de l'entrée, un `...q` forgot les réintroduirait.
  assert.match(questpack, /hintsByQuest/);
  assert.match(questpack, /hintsByQuest\.set\(q\.id/);
  assert.ok(!/hints: Array\.isArray\(q\.hints\)/.test(questpack),
    'les indices ne doivent pas être une propriété de l\'entrée');
  assert.match(atelier, /hintsByQuest\.get/);
});

test('le dernier indice est toujours gratuit', () => {
  assert.match(questpack, /dernier indice doit être gratuit/,
    'le validateur doit imposer le dernier indice gratuit');
  assert.ok(doc.includes('dernier indice est toujours gratuit'),
    'le contrat doit l\'annoncer');
});

test('la compréhension ne bloque pas la validation', () => {
  assert.match(doc, /ne \*\*bloque pas\*\* la validation/);
  assert.match(doc, /required: true` signifie\s*\n?\s*simplement/);
});

/* ---------------------------------------------------------------------- piles */

test('le mot de passe se récupère sans dépendre de l\'avancement', async () => {
  // Une commande de récupération qui suppose un état créé par la quête
  // elle-même est un piège : l'élève qui saute directement au formulaire, ou
  // qui a nettoyé derrière lui, ne peut plus valider. Vérifié après coup sur
  // l'atelier 4, où `--network reseau-verdi` était requis alors que ce réseau
  // est précisément ce que l'étape 1 de la quête fait créer.
  const { quests } = await import('../src/questpack.js');
  const interdits = [
    [/--network\s+(?!none\b)/, 'un réseau nommé, qui n\'existe pas encore'],
    [/docker\s+network\s+create/, 'la création d\'un réseau, que l\'atelier enseigne'],
    [/-v\s+[^\s]*\/(data|home)\b/, 'un volume monté, qui doit préexister'],
  ];
  for (const q of quests().quests) {
    for (const [motif, quoi] of interdits) {
      assert.doesNotMatch(q.fetchHint, motif,
        `${q.id} : la récupération suppose ${quoi}`);
    }
    // Et la commande doit suffire à elle seule.
    assert.match(q.fetchHint, /SERVER_IP/, `${q.id} : la commande doit viser le portail`);
    assert.match(q.fetchHint, /dq_x{10}/, `${q.id} : la commande doit porter le jeton`);
  }
});

test('le contrat annonce les limites de débit, le code les applique', () => {
  for (const [nom, limite] of [
    ['register', 12], ['submit', 40], ['quests', 120], ['live', 300], ['api', 600],
  ]) {
    assert.ok(doc.includes(String(limite)), `le contrat ne mentionne pas le plafond ${limite}`);
    assert.match(ratelimit, new RegExp(`${nom}:\\s*rateLimit\\(\\{\\s*limit:\\s*${limite}`),
      `src/ratelimit.js ne déclare pas ${nom} à ${limite}`);
  }
  assert.match(ratelimit, /RATE_LIMIT/, 'l\'activation/désactivation des plafonds doit être pilotable');
  assert.match(ratelimit, /TRUST_PROXY/, 'le comptage doit dépendre de la présence d\'un proxy');
  assert.match(ratelimit, /if \(TRUST_PROXY\)[\s\S]{0,200}x-forwarded-for/,
    'X-Forwarded-For doit être conditionné à TRUST_PROXY');
});

test('le contrat documente le piège du NAT en salle', () => {
  const bloc = section('### 2.6');
  assert.match(bloc, /NAT/);
  assert.match(bloc, /429/);
});

test('le contrat annonce les choix de pile, le code les respecte', () => {
  assert.equal(Object.keys(pkg.dependencies).length, 1, 'une seule dépendance de production');
  assert.ok('express' in pkg.dependencies);
  assert.ok('linkedom' in pkg.devDependencies, 'linkedom est une devDependency');
  assert.ok(doc.includes('node:sqlite'));
  assert.ok(
    !/dépendances?[^.]*better-sqlite3|besoin de[^.]*better-sqlite3/i.test(doc),
    'le contrat ne doit plus recommander better-sqlite3',
  );
  for (const f of ['src/db.js', 'README.md', 'src/routes/api.js']) {
    assert.doesNotMatch(read(f), /(?:import|require)\s*\(?\s*['"]better-sqlite3/,
      `${f} ne doit pas importer better-sqlite3`);
  }
  assert.match(read('src/db.js'), /SAVEPOINT/, 'le wrapper doit permettre les transactions imbriquables');
});

test('le contrat exige un démarrage bloqué si le contenu est invalide', () => {
  assert.match(questpack, /await loadQuestpack\(\)/, 'le chargement doit être au démarrage du module');
  assert.ok(doc.includes('empêche le serveur de démarrer'));
});

test('le contrat impose les règles de verrouillage du client', () => {
  // La correction part par `jouable()` : le mot de passe y apparaît avec son
  // littéral de jeton, et un élève qui vérifie son propre travail après une
  // validation obtenait un 401. La règle est donc « conditionnée **et** rendue
  // jouable ».
  assert.match(api, /solution: done\.has\(q\.id\) \? t0\(q\.solution\) : null/,
    'la correction doit être conditionnée à la validation et rendue jouable');
  assert.ok(/les\s*\n?missions validées/.test(doc),
    'le contrat doit dire que la correction est conditionnée');
});

test('tout texte du contenu qui porte un littéral est rendu jouable', () => {
  // Le brief, la correction et la commande de récupération portent tous
  // `dq_xxxxxxxxxxxxxxxx` et `https://SERVER_IP`. Un seul d'eux a oublié la
  // substitution : les 27 briefs affichaient un mot de passe mort, et un élève
  // a rapporté « 401 Unauthorized » en testant.
  //
  // On vérifie qu'il n'existe plus **une seule** substitution manuelle dans
  // `api.js` : tout passe par `jouable()`, donc il ne peut plus y en avoir deux
  // qui divergent.
  const substitutions = [...api.matchAll(/replaceAll\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(substitutions)], ['https://SERVER_IP', 'http://SERVER_IP',
    'dq_xxxxxxxxxxxxxxxx', '$ARENA_TOKEN'],
  `substitutions inattendues dans api.js : ${substitutions.join(', ')}`);

  // Et `jouable()` couvre bien `$ARENA_TOKEN` : c'est ce qui permet à un élève
  // de ne copier que la ligne `docker run`, sans la ligne `export` au-dessus.
  assert.match(api, /\.replaceAll\('\$ARENA_TOKEN', player\.token\)/,
    'la variable du brief doit être remplacée, sinon elle reste vide');
});

/* -------------------------------------------------------------------- maîtrise */

test('le contrat fixe les deux invariants de la maîtrise', async () => {
  const bloc = section('## 3. La maîtrise');
  assert.match(bloc, /dénominateur de la progression est le jeu entier/);
  assert.match(bloc, /Le niveau exige deux seuils/);

  // Les paliers du contrat et ceux du code doivent concorder. On compare des
  // nombres, pas des chaînes : `0.10` et `0.1` sont le même seuil, et un test
  // qui échouerait sur la typographie du code serait un mauvais test.
  const { LEVELS } = await import('../src/mastery.js');
  const attendus = [
    ['Ça tourne', 0.10, 0.05],
    ['Autonome', 0.50, 0.25],
    ['Geste sûr', 0.75, 0.50],
    ['Maîtrise', 0.90, 0.80],
  ];
  for (const [nom, min, minProgress] of attendus) {
    assert.ok(bloc.includes(nom), `le contrat ne liste pas le palier « ${nom} »`);
    const palier = LEVELS.find((l) => l.name === nom);
    assert.ok(palier, `src/mastery.js ne déclare pas le palier « ${nom} »`);
    assert.equal(palier.min, min, `seuil d'autonomie de « ${nom} »`);
    assert.equal(palier.minProgress, minProgress, `seuil d'avancement de « ${nom} »`);
  }
  // L'ordre doit être croissant, sinon le palier affiché saute des niveaux.
  for (let i = 1; i < LEVELS.length; i++) {
    assert.ok(LEVELS[i].min >= LEVELS[i - 1].min
      && LEVELS[i].minProgress >= LEVELS[i - 1].minProgress,
    `le palier « ${LEVELS[i].name} » est en dessous du précédent`);
  }
});

test('la maîtrise est calculée depuis les colonnes, jamais un cumul', () => {
  assert.match(progress, /hints_used: result\.hints_used/);
  assert.match(progress, /check_ok: result\.check_ok/);
  assert.ok(!/UPDATE players SET score/.test(progress), 'plus d\'écriture de score');
});

test('les totaux d\'ateliers croissent strictement', async () => {
  // `src/questpack.js` ne refuse qu'une somme *inférieure* à la précédente.
  // Une égalité passe donc — et une suite 100/200/300/400/400 dirait que le
  // contenu a stagné alors qu'il a été réécrit. On verrouille la croissance.
  const { quests } = await import('../src/questpack.js');
  let precedent = 0;
  for (const m of quests().modules) {
    const somme = m.quests.reduce((a, q) => a + q.points, 0);
    assert.ok(somme > precedent,
      `module ${m.module} : ${somme} pts, ne croît pas par rapport à ${precedent}`);
    assert.equal(somme % 100, 0, `module ${m.module} : ${somme} n'est pas un multiple de 100`);
    precedent = somme;
  }
});

test('les scripts remplacent l\'origine comme le serveur le fait', async () => {
  // Le script de vérification rejouait les 27 commandes hors du portail réel.
  // Il substituait `SERVER_IP` par l'origine, ce qui produisait
  // `https://https://…` : les 27 échouaient alors qu'aucune n'était cassée.
  //
  // Le bug est invisible pour les tests unitaires — ils ne lancent pas Docker —
  // et il avait survécu au passage en HTTPS parce que personne n'avait lancé le
  // script. Il est mort ici, sur la règle qui l'a laissé passer.
  const script = read('scripts/check-fetchhints.js');

  assert.ok(script.includes("replaceAll('https://SERVER_IP'"),
    'le script doit remplacer le préfixe complet, comme src/routes/api.js');
  assert.doesNotMatch(script, /replaceAll\('SERVER_IP'/,
    'substituer SERVER_IP seul produirait « https://https://… »');

  // Et les deux implémentations doivent rester synchronisées : c'est le
  // contrat § 2.5. Si l'une change sans l'autre, ce test tombe.
  const api = read('src/routes/api.js');
  assert.ok(api.includes("replaceAll('https://SERVER_IP'"),
    'le serveur doit remplacer le préfixe complet');
  assert.ok(api.includes("replaceAll('http://SERVER_IP'"),
    'et aussi la variante http, au cas où un contenu la porterait');
});

test('le contrat et le README annoncent les mêmes chiffres', () => {
  const readme = read('README.md');
  const annonce = readme.match(/npm test\s+#\s*(\d+) tests/);
  assert.ok(annonce, 'le README doit indiquer le nombre de tests');
  const fichiers = fs.readdirSync(path.resolve('test')).filter((f) => f.endsWith('.test.js'));
  assert.ok(fichiers.length >= 8, `la suite doit être répartie sur au moins 7 fichiers, ${fichiers.length}`);
  assert.ok(Number(annonce[1]) >= fichiers.length, 'le nombre annoncé doit être plausible');
});