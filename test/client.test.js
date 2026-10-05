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
  const manquants = ids.filter((id) => !new RegExp(`id="${id}"`).test(html));
  assert.deepEqual(manquants, [], `ids absents de index.html : ${manquants.join(', ')}`);

  // Le seuil qu'il y avait ici — « plus de 25 sélecteurs, sinon le fichier a été
  // tronqué » — était calibré sur une version d'`app.js` qui contenait encore le
  // portail. Il est devenu faux du jour où le portail est parti, et il
  //Quiconque le relirait ne le saurait pas : c'est un nombre qui ne veut rien dire.
  //
  // Ce qui vérifie vraiment une troncature, c'est que les fonctions de rendu
  // existent encore. C'est structurel, et ça ne se périme pas au prochain
  // commit.
  for (const fn of [
    'showGate', 'showPlay', 'bootPlayer', 'openQuest', 'paintQuest',
    'renderHeader', 'renderMap', 'renderHistory', 'renderCurrent',
    'buildComprehension', 'buildSubmitBox', 'buildSuccess', 'buildSolution',
    'refresh',
  ]) {
    assert.match(clientJs, new RegExp(`function ${fn}\\(`),
      `app.js ne définit plus ${fn}() : le fichier a été tronqué ?`);
  }
  assert.ok(ids.length > 15, `seulement ${ids.length} sélecteurs — encore plausible ?`);
});

test('la page d\'accueil EST le jeu', () => {
  // `/` et `/#/` mènent tous deux au jeu. Le portail enseignant est parti dans
  // `/admin`, derrière un mot de passe.
  //
  // La raison n'est pas seulement la sécurité : le tableau de classe du portail
  // dépendait de `/api/overview`, fermée le jour où l'administration a été
  // verrouillée. La page d'accueil affichait donc un toast d'erreur à quiconque
  // la chargeait — c'est-à-dire à chaque élève, à chaque séance.
  assert.doesNotMatch(html, /id="portal"/,
    'le portail ne doit plus exister dans la page du jeu');

  // Et le jeu ne doit pas démarrer masqué : il n'y a plus rien derrière lui.
  assert.match(html, /<div id="game" class="screen">/,
    '`#game` ne doit pas porter `hidden` : `[hidden]` l\'emporterait sur tout `display`');

  // Le routeur ne doit plus consulter le hash pour choisir une vue. Le hash
  // reste accepté — `/#/` est l'adresse que l'enseignant distribue — mais il
  // ne décide de rien.
  assert.doesNotMatch(clientJs, /location\.hash\.startsWith/,
    'plus de dispatch sur le hash : il n\'y a qu\'une vue');
  // Le mot `/api/overview` apparaît encore — dans un commentaire, pour
  // expliquer pourquoi la vue a été déplacée. Chercher la chaîne entière
  // confondrait ce commentaire avec un appel, et c'est exactement l'erreur que
  // ce fichier commet quand il ne regarde pas. On cherche donc un **appel** :
  // `api('/api/overview'…`.
  assert.doesNotMatch(clientJs, /api\('\/api\/overview'/,
    'le client ne lit plus la vue de classe : elle est dans `/admin`');
  assert.doesNotMatch(clientJs, /api\('\/api\/live'/,
    'ni le flux de la vue de classe');

  // Le pied de page du portail — « espace joueur » — n'a plus de page à
  // renvoyer vers.
  assert.doesNotMatch(html, /espace joueur/);
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

test('le client lit les champs que l\'API renvoie réellement', () => {
  // On compare les champs que le client consomme à ce que /api/me renvoie
  // réellement, et non à un exemple inventé : une dérive des deux côté se voit
  // ici. `mode_label` est volontairement exclu, c'est une commodité d'API que
  // le client recalcule pour pouvoir afficher un libellé localisé.
  const exemple = {
    team: 'X', mode: 'competitive', mode_label: 'Challenge',
    mastery: { progress_ratio: 0.04, autonomy_ratio: 1, comprehension_ratio: 0.5,
      level: { key: 'debut', name: 'Débutant' } },
    // `finished` et `last_submission` ne sont plus lus par ce client : ils
    // servaient au portail, parti dans `/admin`. L'API les sert toujours — le
    // tableau de suivi de l'administrateur en a besoin.
    total_quests: 27, progress: '1/27',
    registered_at: '10:00:00', next_quest: 'x',
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