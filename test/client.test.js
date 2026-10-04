import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import fs from 'node:fs';
import path from 'node:path';
import { quests } from '../src/questpack.js';

/**
 * Vérifie que le client web reste cohérent avec la page HTML et avec les
 * données que le serveur renvoie. Ces tests attrapent le type d'erreur qui ne
 * se voit pas en lisant le code : un `#id` supprimé du HTML, une divergence de
 * forme entre l'API et ce que le client attend.
 */

const html = fs.readFileSync(path.resolve('public/index.html'), 'utf8');
const clientJs = fs.readFileSync(path.resolve('public/app.js'), 'utf8');

const pack = quests();

test('tout #id utilisé par app.js existe dans index.html', () => {
  const ids = [...new Set([...clientJs.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]))];
  assert.ok(ids.length > 25, `seulement ${ids.length} sélecteurs : le fichier a été tronqué ?`);
  const manquants = ids.filter((id) => !new RegExp(`id="${id}"`).test(html));
  assert.deepEqual(manquants, [], `ids absents de index.html : ${manquants.join(', ')}`);
});

test('le client importe bien le renderer Markdown', () => {
  assert.match(clientJs, /import\s*\{\s*renderMarkdown\s*\}\s*from\s*'\/md\.js'/);
});

test('app.js est chargé en module', () => {
  assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script src="\/app\.js">/);
});

test('la page déclare les deux modes', () => {
  assert.match(html, /data-mode="competitive"/);
  assert.match(html, /data-mode="normal"/);
  // Les deux modes doivent être présentés avant le choix, pas après.
  assert.ok(html.indexOf('data-mode="competitive"') < html.indexOf('id="gateForm"'));
});

test('le portail suit la classe, tous modes confondus', () => {
  // Un seul tableau, pas un par mode. Les deux modes jouent le même contenu :
  // les séparer en deux tableauxavait de comparer un mode à l'autre, ce qui
  // n'a aucun sens puisque ce n'est pas une course.
  assert.match(html, /id="playersBody"/);
  assert.doesNotMatch(html, /id="compBody"/, 'le tableau par mode a disparu');
  assert.doesNotMatch(html, /id="normBody"/);
  assert.doesNotMatch(html, /Ligue Compétitive/i, 'la copie de la V1 est restée');
  assert.doesNotMatch(html, /Classé au score/, 'la promesse du score est restée');
  // Le bandeau remplace le podium : mêmes colonnes, pas de classement.
  for (const h of ['Autonomie', 'Compréhension', 'Niveau']) {
    assert.ok(html.includes(h), `colonne manquante : ${h}`);
  }
  assert.doesNotMatch(html, /<th[^>]*>Score<\/th>/);
});

test('le client lit les champs que l\'API renvoie réellement', () => {
  // On compare les champs que le client consomme à ce que /api/me renvoie
  // réellement, et non à un exemple inventé : une dérive des deux côté se voit
  // ici. `mode_label` est volontairement exclu, c'est une commodité d'API que
  // le client recalcule pour pouvoir afficher un libellé localisé.
  const exemple = {
    team: 'X', mode: 'competitive', mode_label: 'Challenge',
    mastery: { progress_ratio: 0.04, autonomy_ratio: 1, comprehension_ratio: 0.5,
      level: { key: 'debut', name: 'Débutant' } },
    total_quests: 27, progress: '1/27', finished: false,
    registered_at: '10:00:00', last_submission: '10:01:00', next_quest: 'x',
    history: [{ quest_id: 'a', quest_number: 1, title: 'T', hints_used: 0,
      autonomous: true, check_ok: true, recall_ok: true, wrong_flags: 0, time_ms: 1000 }],
  };
  const inutilises = Object.keys(exemple).filter((c) => !clientJs.includes(c));
  assert.deepEqual(inutilises, [], `app.js n'utilise pas : ${inutilises.join(', ')}`);
  // Et l'inverse : aucun champ de score ne doit être **lu**, parce qu'il
  // n'existe plus dans l'API. C'est ainsi qu'on a obtenu « NaN pts » et
  // « undefined pts » à l'écran.
  //
  // On cherche une lecture (`${x.score}`), pas la simple présence du mot : les
  // commentaires du client nomment ces champs pour expliquer pourquoi ils ont
  // disparu, et une recherche par sous-chaîne les prennent pour des usages.
  // Un test qui oblige à ne même plus nommer le score dans une phrase est un
  // test qui casse au prochain commentaire.
  for (const lecture of ['${row.score}', '${me.score}', '${res.points_earned}',
    '${res.score_total}', '${res.rank}', '${state.pack.total_points}']) {
    assert.ok(!clientJs.includes(lecture),
      `le client lit ${lecture}, un champ qui n'existe plus dans l'API`);
  }
});

test('le client gère les trois réponses de submit', () => {
  for (const statut of ['success', 'already_submitted', 'pending']) {
    assert.ok(clientJs.includes(`'${statut}'`), `app.js ne traite pas status: ${statut}`);
  }
  // Le récapitulatif parle maîtrise, pas score. La V1 lisait
  // `res.breakdown` et `res.points_earned`, que l'API ne renvoie plus :
  // l'écran affichait « Total : undefined pts ».
  assert.doesNotMatch(clientJs, /if \(res\.breakdown\)/,
    'le breakdown n\'existe plus dans l\'API : le test le lisait et affichait « undefined »');
  assert.doesNotMatch(clientJs, /res\.(points_earned|score_total|rank)\b/);
  assert.match(clientJs, /res\.mastery/, 'le bilan doit lire la maîtrise');

  // Le bilan d'une validation est transmis par `state.lastSuccess`, pas écrit
  // dans le champ de message du formulaire : pour une quête validée, ce
  // formulaire est remplacé par un encart « Mission déjà validée », sans champ
  // de message. Le bilan partait donc dans le vide et l'élève ne voyait rien
  // se passer.
  assert.match(clientJs, /state\.lastSuccess = res;[\s\S]*?await refresh\(\)/,
    'le bilan doit être mis en attente AVANT le repeint, pas écrit dedans');
  assert.match(clientJs, /state\.lastSuccess\?\.quest_validated === q\.number/,
    'et lu par paintQuest au passage');
  assert.doesNotMatch(clientJs, /renderValidationReport\(\$\('#questPanel \.submit-msg'\)/,
    'écrire dans le champ de message ne peut pas fonctionner : il n\'existe plus');
});

test('le verrouillage n\'est qu\'un guidage, activé par l\'enseignant', () => {
  // Par défaut le serveur n'envoie `locked: false`, donc le client n'affiche
  // ni cadenas ni bouton désactivé : toutes les missions sont atteignables.
  assert.match(clientJs, /q\.locked && !isDone/,
    'le client respecte le verrou, mais seulement si le serveur l\'envoie');
  assert.match(clientJs, /Verrouillage d'affichage/,
    'le code doit rappeler que c\'est un guidage, pas une contrainte');
  assert.match(clientJs, /Le serveur accepte la validation dans les deux cas/,
    'il ne faut pas laisser croire à une porte serveur');
  assert.match(clientJs, /open\.length === 1 \? 'Dernière mission' : 'Par où continuer'/,
    'le bandeau doit proposer, pas obliger');
});

test('le plan de progression reste cohérent avec le contenu', () => {
  // Le client compte les modules et les quêtes à partir de la réponse serveur.
  assert.match(clientJs, /state\.pack\.modules/, 'le client doit parcourir modules');
  assert.match(clientJs, /modules\.flatMap\(\(m\) => m\.quests\)/,
    'le client doit aplatir modules → quêtes');
});

test('le client ne fige aucun nombre de modules ni de quêtes', () => {
  // Un `7` ou un `26` écrit en dur dans le client devient faux dès qu'on ajoute
  // un atelier — et le bug est invisible jusqu'au premier cours. Le compte
  // vient toujours de la réponse serveur ; ce test verrouille qu'il n'y a pas
  // de constanteEquivalent.
  const client = clientJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const interdits = [
    [/\b7\s*ateliers?\b/i, 'un nombre d\'ateliers en dur'],
    [/\b7\s*modules?\b/i, 'un nombre de modules en dur'],
    [/\b26\s*qu[eê]tes?\b/i, 'un nombre de quêtes en dur'],
    [/\b2800\b/, 'un total de points en dur'],
  ];
  for (const [motif, quoi] of interdits) {
    assert.doesNotMatch(client, motif, `${quoi} ne doit pas figurer dans le client`);
  }
});

test('le score et le rang ont disparu, pas seulement masqués', () => {
  // Masquer un bloc de score le laisserait dans le HTML : un élève qui lit la
  // page verrait « Score » dans le code, et un ancien client le chercherait.
  // Les deux blocs sont remplacés par le niveau et l'autonomie.
  for (const [src, quoi] of [[clientJs, 'le client'], [html, 'le HTML']]) {
    for (const id of ['statScore', 'statRank', 'scoreVal', 'rankVal']) {
      assert.doesNotMatch(src, new RegExp(id), `${quoi} ne doit plus mentionner ${id}`);
    }
  }
  assert.match(html, /id="statLevel"/, 'le niveau prend la place du score');
  assert.match(html, /id="statAutonomy"/, 'l\'autonomie prend la place du rang');
  assert.match(clientJs, /#levelVal/, 'le client doit remplir le niveau');
  assert.match(clientJs, /#autonomyVal/, 'le client doit remplir l\'autonomie');
});

test('le portail se reconnecte au flux SSE si la coupure passe', () => {
  assert.match(clientJs, /new EventSource\('\/api\/live'\)/);
  assert.match(clientJs, /es\.onerror/, 'une coupure doit être signalée');
  assert.match(clientJs, /stopPortalStream\(\)/, 'l\'ancien flux doit être fermé');
});

test('le flux SSE est fermé dans les deux vues', () => {
  // Sans cela, chaque aller-retour portail → jeu laissait une connexion
  // orpheline et le poste épuisait son quota serveur.
  const route = clientJs.split('async function route()')[1].split('window.addEventListener')[0];
  const brancheJeu = route.split('const saved = store.read()')[1] ?? '';
  const avantPortail = route.split('if (!wantsGame)')[0];
  assert.ok(avantPortail.includes('stopPortalStream()'),
    'la fermeture doit avoir lieu avant de choisir la vue, pas seulement dans la branche portail');
  assert.doesNotMatch(brancheJeu, /startPortalStream\(\)/,
    'le jeu ne doit pas rouvrir un flux dont il n\'a pas besoin');
});

test('la reconnexion SSE espace les tentatives', () => {
  // EventSource se reconnecte seul toutes les ~3 s ; sans backoff, une coupure
  // prolongée épuise le quota du serveur et l'indicateur reste bloqué.
  assert.match(clientJs, /state\.retries/);
  assert.match(clientJs, /2 \*\* \(state\.retries - 1\)/, 'le recul doit être exponentiel');
  assert.match(clientJs, /Math\.min\(30_000/, 'le recul doit être borné');
  assert.match(clientJs, /es\.close\(\)/, 'la source doit être fermée avant la relance manuelle');
});

test('l\'animation du témoin ne tourne que si la connexion est vivante', () => {
  const css = fs.readFileSync(path.resolve('public/style.css'), 'utf8');
  const bloc = css.slice(css.indexOf('.live-dot i'));
  assert.match(bloc.slice(0, 200), /animation: pulse/);
  assert.match(bloc, /\.live-dot\.off i \{[^}]*animation: none/,
    'l\'état déconnecté ne doit plus clignoter');
  assert.match(clientJs, /dot\.dataset\.state = etat/,
    'le client doit piloter l\'état visuel');
});

test('le HTML est en français et en UTF-8', () => {
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /name="viewport"/);
});

test('aucune ressource externe : le jeu marche hors ligne', () => {
  const sourcesExternes = html.match(/(?:src|href)="https?:\/\/[^"]+/g) ?? [];
  assert.equal(sourcesExternes.length, 0,
    `ressources externes trouvées : ${sourcesExternes.join(', ')}`);
});

test('le token est conservé localement et jamais affiché dans l\'URL', () => {
  assert.match(clientJs, /localStorage\.setItem/);
  assert.doesNotMatch(clientJs, /location\.search|\?token=/,
    'le token ne doit pas fuiter dans une URL');
});