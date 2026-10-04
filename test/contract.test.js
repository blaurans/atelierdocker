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
const admin = read('src/routes/admin.js');
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
  // Le routeur d'administration est le troisième : ses routes sont documentées
  // dans le contrat comme celles du jeu, et elles vivent dans leur propre
  // fichier. Les oublier ici laisserait le contrat décrire des routes que
  // personne ne vérifie.
  const sources = { [api]: 'api', [atelier]: 'atelier', [admin]: 'admin' };
  const declarees = [];
  for (const [src, router] of Object.entries(sources)) {
    for (const m of src.matchAll(new RegExp(`\\b${router}\\.(get|post|delete)\\(\\s*'([^']*)'`, 'g'))) {
      declarees.push(`${m[1].toUpperCase()} /api${m[2]}`);
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

test('le ménage des joueurs de vérification est exact et exhaustif', () => {
  // Deux défauts trouvés en regardant `/api/overview` en production : le script
  // de vérification visait « Verif » et le job de CI visait « Verif_000000 ».
  // Aucun des deux ne supprimait quoi que ce soit — chaque exécution laissait
  // un joueur de plus dans le menu de suivi de l'enseignant.
  const verif = read('scripts/check-fetchhints.js');
  assert.match(verif, /const equipe = `Verif_/, 'le nom tiré au sort doit être retenu');
  assert.match(verif, /admin\/delete\/\$\{equipe\}/,
    'le ménage doit viser ce nom, pas un nom deviné');
  // Et dans les deux cas — une vérification en échec laisse justement la trace
  // qu'on ne veut pas voir, parce que c'est celle qu'on relance en boucle.
  const sortie = verif.indexOf('process.exit(echecs.length ? 1 : 0)');
  const menage = verif.indexOf('await menage()');
  assert.ok(menage !== -1 && menage < sortie,
    'le ménage doit précéder la sortie, sinon un échec laisse un joueur');

  const filet = read('scripts/nettoie-verif.js');
  // Un filtre par préfixe large attraperait un élève qui s'appellerait
  // « Verif-exemple », et c'est sa progression qui disparaîtrait.
  assert.match(filet, /startsWith\(PREV\) && t\.length > PREV\.length/,
    'le filtre doit exiger le suffixe, pas seulement le préfixe');
  assert.doesNotMatch(filet, /includes\('Verif'\)/,
    '"includes" attraperait « Verif-exemple » et supprimerait sa progression');

  // Et le job de CI appelle le script, pas un `grep` fragile.
  const ci = read('.github/workflows/verifications.yml');
  assert.match(ci, /npm run nettoie-verif/);
  assert.doesNotMatch(ci, /grep -o '\"team/);
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

test('les libellés de mode sont les mêmes partout', async () => {
  // « Challenge » et « Sans stress » sont affichés à trois endroits : la
  // configuration serveur, la page HTML (les deux cartes de choix de mode), et
  // le tableau de suivi. Une divergence ne casse rien — elle se contente de
  // nommer le même mode de trois façons différentes, ce qu'un enseignant voit
  // immédiatement et un élève jamais.
  const { MODE_LABELS } = await import('../src/config.js');
  assert.deepEqual(MODE_LABELS, { competitive: 'Challenge', normal: 'Sans stress' });

  const client = read('public/app.js');
  const html = read('public/index.html');
  // Le client duplique la table — une page sans build ne peut pas importer un
  // module Node — donc les deux listes doivent être identiques, libellé par
  // libellé.
  for (const [mode, label] of Object.entries(MODE_LABELS)) {
    assert.ok(client.includes(`${mode}: '${label}'`),
      `app.js doit porter « ${mode}: '${label}' »`);
    assert.ok(new RegExp(`<span class="mode-badge">${label}</span>`).test(html)
      || new RegExp(`>${label}<`).test(html),
    `index.html doit afficher « ${label} » pour le mode ${mode}`);
  }

  // Et plus aucune trace de l'ancienne nomenclature.
  assert.doesNotMatch(html, /COMPÉTITIF|NORMAL(?! )/, 'les badges de la V1 sont restés');
  assert.doesNotMatch(html, /Score</, 'la carte de mode promet encore un score');
  assert.doesNotMatch(html, /Podium en direct/, 'et un podium : il n\'y en a plus');
});

test('le contrat décrit la fermeture de l\'administration', () => {
  // Une règle de sécurité qui vit dans le code mais pas dans le contrat est une
  // règle qu'on ne relit pas au moment d'en avoir besoin.
  const bloc = section('### 2.7');
  assert.match(bloc, /HttpOnly/, 'le cookie doit être documenté et pourquoi');
  assert.match(bloc, /SameSite=Strict/);
  assert.match(bloc, /refuse de démarrer/, 'et le refus de démarrer sans mot de passe');

  // Le README doit dire la même chose.
  assert.match(read('README.md'), /ATELIER_ADMIN_KEY.*mot de passe/s,
    'le README doit présenter la variable comme un mot de passe');
  assert.match(read('README.md'), /\/admin/,
    'et dire où se trouve l\'écran');

  // Le compose doit refuser une valeur vide.
  assert.match(read('docker-compose.yml'), /ATELIER_ADMIN_KEY:\?/,
    'le compose doit interpolationner la variable sans valeur par défaut');

  // Et le code ne doit contenir aucun vestige du « lab ouvert ».
  for (const f of ['src/auth.js', 'src/routes/api.js']) {
    assert.doesNotMatch(read(f), /lab ouvert/i,
      `${f} : l\'ancien « lab ouvert » est une règle d'accès à ne plus avoir`);
  }
});

test('check-fetchhints dit ce qui s\'est mal passé, et réessaie', () => {
  // Pendant un redéploiement, Caddy renvoie une 502 au corps vide. La V1 faisait
  // `await (await fetch(...)).json()` : le `JSON.parse` levait « Unexpected end
  // of JSON input » et le rapport accusait un bug de JSON, alors que le vrai
  // sujet était « le serveur était indisponible pendant trente secondes ».
  const script = read('scripts/check-fetchhints.js');

  assert.match(script, /async function api\(/,
    'un seul point d\'appel JSON, qui sait dire ce qui a échoué');
  assert.match(script, /r\.status >= 500 && essai < tentatives/,
    'une 5xx est transitoire : le portail redémarre');
  assert.match(script, /ne répond pas/,
    'et un refus réseau doit le dire comme tel, pas « réponse illisible »');
  assert.doesNotMatch(script, /await \(await fetch\(`\$\{B\}\/api\/register`/,
    'plus de .json() direct sur une réponse dont on ignore le statut');

  // Le repli est borné : un portail réellement mort doit terminer, pas boucler.
  const tentatives = script.match(/tentatives = (\d+)/);
  assert.ok(tentatives, 'le nombre de tentatives doit être explicite');
  assert.ok(Number(tentatives[1]) <= 5,
    'au-delà de cinq essais, ce n\'est plus transitoire');
});

test('le contrat et le README annoncent les mêmes chiffres', () => {
  const readme = read('README.md');
  const annonce = readme.match(/npm test\s+#\s*(\d+) tests/);
  assert.ok(annonce, 'le README doit indiquer le nombre de tests');
  const fichiers = fs.readdirSync(path.resolve('test')).filter((f) => f.endsWith('.test.js'));
  assert.ok(fichiers.length >= 8, `la suite doit être répartie sur au moins 7 fichiers, ${fichiers.length}`);
  assert.ok(Number(annonce[1]) >= fichiers.length, 'le nombre annoncé doit être plausible');
});