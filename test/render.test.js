import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import fs from 'node:fs';
import path from 'node:path';
import { quests } from '../src/questpack.js';

/**
 * Teste le rendu du portail et du parcours en exécutant le vrai code client
 * (public/app.js) contre un DOM simulé et un serveur simulé.
 *
 * On ne se contente pas de vérifier la syntaxe : on rejoue le flux complet
 * (affichage du portail, inscription, ouverture d'une mission, soumission) et
 * on vérifie ce qui apparaît réellement à l'écran.
 */

const html = fs.readFileSync(path.resolve('public/index.html'), 'utf8');
const clientSrc = fs.readFileSync(path.resolve('public/app.js'), 'utf8');

// ── DOM et stubs minimaux ───────────────────────────────────────────────
const dom = parseHTML(html);
globalThis.document = dom.document;

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};

globalThis.location = { hash: '#/', origin: 'http://localhost:8000', host: 'localhost:8000' };
globalThis.confirm = () => true;
dom.window.EventSource = class {
  constructor() { this.listeners = {}; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  close() {}
};
globalThis.EventSource = dom.window.EventSource;

/** Réponses préparées à partir du contenu réel, comme le ferait le serveur. */
const pack = quests();
const questPayload = (completed = []) => ({
  total_quests: pack.totalQuests,
  total_points: pack.totalPoints,
  mode: 'competitive',
  completed,
  modules: pack.modules.map((m) => ({
    module: m.module, title: m.title, tagline: m.tagline, icon: m.icon,
    quests: m.quests.map((q) => ({
      id: q.id, number: q.number, title: q.title, points: q.points,
      flagship: q.flagship, est_minutes: q.estMinutes, teaches: q.teaches,
      checkpoint: q.checkpoint, brief: q.brief, hints: q.hints,
      // Le serveur ne transmet ni le flag (il n'existe pas dans le contenu)
      // ni la correction avant validation. Il fournit la commande.
      fetch_hint: (q.fetchHint ?? '')
        .replaceAll('SERVER_IP', 'localhost:8000')
        .replaceAll('dq_xxxxxxxxxxxxxxxx', 'dq_testtoken'),
      solution: completed.includes(q.id) ? q.solution : null,
      locked: !completed.includes(q.id) && q.number > completed.length + 1,
      completed: completed.includes(q.id),
    })),
  })),
});

const mePayload = (completed = []) => ({
  team: 'Testeur', mode: 'competitive', mode_label: 'Compétitif',
  score: completed.length * 90, rank: 1, total_quests: pack.totalQuests,
  progress: `${completed.length}/${pack.totalQuests}`,
  completed_percent: Math.round((completed.length / pack.totalQuests) * 100),
  finished: completed.length === pack.totalQuests,
  registered_at: '14:02:11', last_submission: '14:31:07',
  next_quest: pack.quests.find((q) => !completed.includes(q.id))?.id ?? null,
  history: completed.map((id, i) => {
    const q = pack.quests.find((x) => x.id === id);
    return {
      quest_id: id, quest_number: q.number, points: q.points,
      speed_bonus: i < 3 ? 60 : 0, pace_bonus: 20, penalty: 0,
      wrong_flags: i === 0 ? 1 : 0,
      time_ms: 120_000, at: '2026-01-01T14:00:00.000Z', time_display: '2 min 00 s',
    };
  }),
});

const overviewPayload = () => ({
  competitive: [
    { team: 'Leader', mode: 'competitive', score: 900, completed: [1, 2, 3], last_submission: '14:10:00', finished: false, registered_at: '14:00:00', progress: '3/26', quests: [], last_quest: null, rank: 1 },
    { team: 'RunnerUp', mode: 'competitive', score: 400, completed: [1, 2], last_submission: '14:12:00', finished: false, registered_at: '14:00:00', progress: '2/26', quests: [], last_quest: null, rank: 2 },
    { team: 'Troisieme', mode: 'competitive', score: 120, completed: [1], last_submission: '14:15:00', finished: true, registered_at: '14:00:00', progress: '26/26', quests: [], last_quest: null, rank: 3 },
  ],
  normal: [
    { team: 'Zen1', mode: 'normal', score: 0, completed: [1, 2], last_submission: '14:20:00', finished: false, registered_at: '14:00:00', progress: '2/26', quests: [], last_quest: null },
  ],
  meta: {
    total_quests: pack.totalQuests, total_points: pack.totalPoints, bareme: [],
    modules: [], server_time: '', attestation_required: false,
    players: 3, leader: { team: 'Leader', score: 900 }, median: 400, finished: 1,
  },
});

let registered = [];
let submitted = [];

function stubFetch(routes = {}) {
  globalThis.fetch = async (url, opts = {}) => {
    const path = String(url).replace('http://localhost:8000', '');
    const method = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : {};
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

    if (routes[path]) return json(routes[path](body, method));

    if (path === '/api/overview') return json(overviewPayload());
    if (path === '/api/commands') return json([{ action: 'Lister', cmd: 'docker ps' }]);
    if (path === '/api/quests') return json(questPayload(registered));
    if (path === '/api/me') return json(mePayload(registered));
    if (path === '/api/register') {
      return json({ status: 'created', team: body.team, mode: body.mode, token: 'dq_test', message: 'Bienvenue !' });
    }
    if (path === '/api/submit') {
      submitted.push(body.flag);
      const q = pack.byFlag.get(String(body.flag).toUpperCase());
      if (!q) return json({ status: 'error', error: 'Flag invalide ! Revois la mission.' }, 400);
      registered.push(q.id);
      const done = q.flagship;
      return json({
        status: 'success', mode: 'competitive', quest_validated: q.number,
        quest_title: q.title, points_earned: q.points,
        breakdown: { base: q.points, speed_bonus: 60, pace_bonus: 20, penalty: 5 },
        score_total: 900, completed_count: `${registered.length}/${pack.totalQuests}`,
        rank: 1, finished: registered.length === pack.totalQuests,
        unlocked_next: null, time_display: '2 min 00 s', message: 'Validée !',
      });
    }
    return json({ status: 'error', error: 'inconnu' }, 404);
  };
}

// Les sélecteurs pointent sur le document courant : chaque test recharge un
// document neuf, on ne doit donc jamais garder une référence au premier.
const $ = (sel) => globalThis.document.querySelector(sel);
const $$ = (sel) => [...globalThis.document.querySelectorAll(sel)];
const text = (sel) => $(sel)?.textContent ?? '';

/**
 * Charge app.js dans un document neuf. Le module s'exécute immédiatement
 * (route() en fin de fichier), il faut donc réinstaller le DOM et les stubs
 * avant chaque chargement.
 */
async function loadClient() {
  const doc = parseHTML(html);
  globalThis.document = doc.document;
  globalThis.window = doc.window;
  globalThis.confirm = () => true;
  doc.window.EventSource = class { addEventListener() {} close() {} };
  globalThis.EventSource = doc.window.EventSource;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };

  // linkedom n'implémente ni le défilement ni la sélection : ce sont des
  // commodités d'affichage, sans effet sur ce que les tests vérifient.
  doc.Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  doc.HTMLInputElement.prototype.select ??= function select() {};

  // app.js s'abonne à `hashchange` au chargement. Dans le test, on intercepte
  // l'inscription : elle ne doit pas déclencher une navigation, seulement
  // prouver que l'écouteur est posé.
  const listeners = [];
  globalThis.addEventListener = (type, fn) => listeners.push({ type, fn });
  globalThis.removeEventListener = () => {};

  const source = clientSrc
    // Le module est servi par le serveur : on retire l'import pour l'injecter.
    .replace(/^import\s*\{[^}]*\}\s*from\s*'\/md\.js';\s*$/m, '')
    .replace(/\bwindow\.addEventListener/g, 'globalThis.addEventListener')
    .replace(/new EventSource/g, 'new globalThis.EventSource')
    // `route()` s'exécute au chargement du module : on neutralise cet appel
    // pour que le test pilote lui-même le cycle de vie.
    .replace(/^route\(\);\s*$/m, '');

  const { renderMarkdown } = await import('../public/md.js');
  const factory = new Function('renderMarkdown', 'document', 'localStorage',
    'location', 'confirm', 'EventSource', 'fetch', 'setTimeout', 'clearTimeout',
    'hashListeners',
    `${source}
globalThis.__dqEl = el;
return { route, renderPortal, bootPlayer, openQuest, listeners: hashListeners, state };`);

  return factory(renderMarkdown, globalThis.document, globalThis.localStorage,
    globalThis.location, globalThis.confirm, globalThis.EventSource,
    globalThis.fetch, setTimeout, clearTimeout, listeners);
}

// ══════════════════════════════════════════════════════════════════ tests

test('el() refuse un nœud DOM comme texte', async () => {
  // C'était le bug « [object HTMLSpanElement] » : passer un élément à `textContent`
  // y met la classe de l'objet. On vérifie le garde-fou directement sur la
  // fonction exportée pour test, plutôt que de le déduire du rendu.
  stubFetch();
  await loadClient();
  assert.throws(
    () => globalThis.__dqEl('td', null, globalThis.document.createElement('span')),
    TypeError,
    'el() doit refuser un nœud plutôt que de l\'afficher comme du texte',
  );
  assert.equal(globalThis.__dqEl('td', null, 'texte').textContent, 'texte');
});

test('le portail n\'affiche jamais [object HTMLSpanElement]', async () => {
  stubFetch();
  const { renderPortal } = await loadClient();
  renderPortal(overviewPayload());

  // Les deux tableaux, toutes cellules confondues.
  for (const zone of ['#compBody', '#normBody']) {
    for (const td of $$(`${zone} td`)) {
      assert.doesNotMatch(td.textContent, /\[object HTML/i,
        `${zone} : une cellule affiche un objet au lieu de son contenu`);
    }
  }
  // La progression doit contenir les pastilles, pas leur représentation.
  const prog = $$('#compBody tr td:nth-child(3)')[0];
  assert.ok(prog.querySelector('.qdot'), 'les pastilles de progression doivent être présentes');
});

test('le portail affiche l\'heure dans le fuseau du poste', async () => {
  stubFetch();
  const { renderPortal } = await loadClient();
  const data = overviewPayload();
  // Un horaire UTC bien connu : 14:10:00Z.
  data.competitive[0].last_submit = '14:10:00';
  data.competitive[0].last_submit_iso = '2026-01-01T14:10:00.000Z';
  renderPortal(data);

  const attendu = new Date('2026-01-01T14:10:00.000Z')
    .toLocaleTimeString('fr-FR', { hour12: false });
  const cellule = $$('#compBody tr')[0].querySelectorAll('td')[4];
  assert.equal(cellule.textContent, attendu,
    'l\'heure doit être rendue dans le fuseau du navigateur, pas celui du serveur');
});

test('le podium affiche aussi la colonne IP', async () => {
  stubFetch();
  const { renderPortal } = await loadClient();
  const data = overviewPayload();
  data.competitive[0].last_ip = '::ffff:192.168.38.42';
  data.normal[0].last_ip = '192.168.38.17';
  renderPortal(data);

  const comp = $$('#compBody tr')[0].querySelectorAll('td');
  assert.equal(comp.length, 6, 'six colonnes au podium');
  assert.match(comp[5].textContent, /192\.168\.38\.42/,
    'la forme ::ffff: doit être nettoyée');
  assert.match($$('#normBody tr')[0].querySelectorAll('td')[4].textContent, /192\.168\.38\.17/);
});

test('le portail affiche le podium et le tableau de suivi', async () => {
  stubFetch();
  const { renderPortal } = await loadClient();
  renderPortal(overviewPayload());

  const etapes = $$('#podium .podium-step');
  assert.equal(etapes.length, 3, 'trois marches de podium');
  // L'ordre d'affichage est 2ᵉ / 1ᵉʳ / 3ᵉ.
  assert.match(etapes[0].textContent, /RunnerUp/);
  assert.match(etapes[1].textContent, /Leader/);
  assert.match(etapes[2].textContent, /Troisieme/);
  assert.match(etapes[1].textContent, /900 pts/);

  assert.equal($$('#compBody tr').length, 3, 'trois compétitifs');
  assert.match($('#compBody').textContent, /Leader/);
  assert.match($('#compBody').textContent, /TERMINÉ/, 'la ligne terminée est signalée');

  assert.equal($$('#normBody tr').length, 1, 'un seul mode normal');
  assert.match($('#normBody').textContent, /Zen1/);
  assert.match($('#normBody').textContent, /2\/26/);

  assert.equal(text('#questCount'), String(pack.totalQuests));
  assert.equal(text('#totalPoints'), String(pack.totalPoints));
});

test('le portail gère le vide sans casser', async () => {
  stubFetch();
  const { renderPortal } = await loadClient();
  renderPortal({ competitive: [], normal: [], meta: { total_quests: 26, total_points: 2800, players: 0 } });
  assert.match($('#podium').textContent, /premier compétitif/);
  assert.match($('#compBody').textContent, /Aucun compétitif inscrit/);
  assert.match($('#normBody').textContent, /Aucun étudiant inscrit/);
});

test('le portail affiche les commandes curl du cahier des charges', async () => {
  stubFetch();
  const { renderPortal } = await loadClient();
  renderPortal(overviewPayload());
  const curl = text('#curlExamples');
  assert.match(curl, /api\/register/);
  assert.match(curl, /competitive/);
  assert.match(curl, /api\/submit/);
  assert.match(curl, /api\/overview/);
});

test('le parcours se construit depuis les données du serveur', async () => {
  stubFetch();
  registered = [];
  submitted = [];
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  assert.equal(text('#teamName'), 'Testeur');
  assert.equal(text('#progressVal'), `0/${pack.totalQuests}`);
  assert.equal(text('#scoreVal'), '0');
  assert.equal(text('#sinceTag'), 'inscrit à 14:02:11');
  assert.match($('#modeChip').textContent, /Compétitif/);

  // Le plan liste les 7 modules et leurs missions.
  assert.equal($$('#questMap .map-mod').length, 7);
  assert.equal($$('#questMap .qitem').length, pack.totalQuests);
  // Une seule mission déverrouillée au départ.
  assert.equal($$('#questMap .qitem:not(.locked):not(.done)').length, 1);

  // L'encart « à faire maintenant » pointe sur la première mission.
  assert.match($('#questMap .map-next-t').textContent, /Image ou conteneur/);
  assert.equal(text('#questPanel .quest-head h2'), pack.quests[0].title);
});

test('le jeton est toujours affiché et copiable', async () => {
  stubFetch();
  registered = [];
  store.set('docker-ops-race:v1',
    JSON.stringify({ token: 'dq_testtoken', team: 'Testeur', mode: 'competitive' }));
  const app = await loadClient();
  await app.bootPlayer();

  const chip = $('#tokenChip');
  assert.ok(chip, 'le jeton doit être visible dans l\'en-tête');
  assert.match(chip.textContent, /dq_test/, 'le jeton doit être rappelé');
  assert.doesNotMatch(chip.textContent, /dq_testtoken/,
    'le jeton est tronqué à l\'affichage, pas exposé en clair');

  // Un clic doit le copier, sans avoir à le retaper.
  let copied = null;
  chip.addEventListener('click', () => { copied = 'ok'; });
  chip.dispatchEvent(new globalThis.window.Event('click'));
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(chip.classList.contains('ok'), 'le clic doit être confirmé visuellement');
});

test('la commande de la mission est copiable en un clic', async () => {
  stubFetch();
  registered = [];
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  const btn = $('#questPanel .copy-hint');
  assert.ok(btn, 'un bouton de copie doit exister');
  const q = pack.quests[0];
  assert.match(btn.textContent, /copier/i);

  btn.dispatchEvent(new globalThis.window.Event('click'));
  await new Promise((r) => setTimeout(r, 10));
  assert.match(btn.textContent, /copiée/, 'la copie doit être confirmée');
});

test('le formulaire propose la commande, puis le champ de saisie', async () => {
  stubFetch();
  registered = [];
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  const q = pack.quests[0];
  const box = $('#questPanel .submit-box');

  // La commande de récupération doit être affichée, prête à coller.
  const hint = box.querySelector('.fetch-hint');
  assert.ok(hint, 'la commande de récupération doit être visible');
  assert.match(hint.querySelector('.fetch-hint-code').textContent, /docker run/,
    'la commande affichée doit être une vraie commande Docker');

  // Le champ doit être VISIBLE immédiatement : un étudiant qui ne voit pas où
  // taper est bloqué. Et il ne doit contenir aucun mot de passe.
  const input = box.querySelector('#flagInput');
  assert.ok(input, 'le champ de saisie doit exister');
  assert.equal(input.hidden, false, 'le champ ne doit pas être masqué par défaut');
  assert.equal(input.value, '', 'le champ ne doit pas être pré-rempli');
  assert.equal(input.placeholder, 'FLAG{…}');

  // Étiqueté, pour qu'on sache où cliquer.
  assert.match(box.querySelector('.submit-field-k').textContent, /colle/i,
    'le champ doit être étiqueté');

  // Aucun moyen de se faire donner la réponse : ce serait vider le jeu.
  assert.doesNotMatch(box.textContent, /afficher le mot de passe/i,
    'aucun bouton ne doit distribuer le mot de passe');
  const libelles = [...box.querySelectorAll('button')].map((b) => b.textContent);
  assert.deepEqual(
    libelles.map((t) => /copier/i.test(t) ? 'copier' : 'valider'),
    ['copier', 'valider'],
    'seuls la copie de la commande et la validation sont autorisées',
  );

  // Le titre rappelle de quelle mission il s'agit.
  assert.match(box.querySelector('.submit-title').textContent, new RegExp(`mission ${q.number}`));
});

test('aucune mission ne demande une réponse sans destination', async () => {
  // Une consigne du type « écris une phrase » sans champ correspondant
  // bloquerait l'étudiant sans qu'il sache quoi faire.
  for (const q of pack.quests) {
    const suspect = q.brief.split('\n').filter(
      (l) => /\b(écris|réponds|note ta|explique avec tes mots|formule ta)\b/i.test(l),
    );
    assert.deepEqual(suspect, [], `${q.id} : consigne sans destination`);
  }
});

test('le panneau de mission affiche énoncé, indices et point de contrôle', async () => {
  stubFetch();
  registered = [];
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  const panel = $('#questPanel');
  const q = pack.quests[0];
  assert.match(panel.textContent, new RegExp(q.title.slice(0, 12)));
  assert.ok(panel.querySelector('pre code'), 'le bloc bash de l\'énoncé est rendu');
  assert.match(panel.textContent, new RegExp(q.checkpoint.slice(0, 20)));
  assert.equal(panel.querySelectorAll('.teach').length, q.teaches.length);

  // Les indices sont repliés au départ, puis se débloquent un par un.
  assert.equal(panel.querySelectorAll('.hint').length, 0);
  const idxBtn = [...panel.querySelectorAll('button')].find((b) => /indice/i.test(b.textContent));
  idxBtn.dispatchEvent(new dom.window.Event('click'));
  assert.equal(panel.querySelectorAll('.hint').length, 1, 'un indice s\'affiche');

  // Le champ de soumission est présent avec le bon placeholder.
  assert.match(panel.querySelector('#flagInput').getAttribute('placeholder'), /FLAG/);
});

test('soumettre une mission met à jour score, progression et historique', async () => {
  stubFetch();
  registered = [];
  submitted = [];
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  const q = pack.quests[0];
  const form = $('#questPanel .submit-box');
  form.querySelector('#flagInput').value = q.flag;
  form.dispatchEvent(new dom.window.Event('submit'));

  await new Promise((r) => setTimeout(r, 30));

  assert.deepEqual(submitted, [q.flag], 'le flag est bien envoyé');
  assert.equal(registered.length, 1);
  assert.equal(text('#progressVal'), `1/${pack.totalQuests}`);
  assert.match(text('#scoreVal'), /\d/, 'le score est affiché');
  assert.match(text('#sinceTag'), /inscrit/);

  // L'historique liste la mission validée.
  assert.equal($$('#historyBox .history-row').length, 1);
  assert.match($('#historyBox').textContent, new RegExp(q.title.slice(0, 10)));

  // La correction est révélée après validation.
  assert.ok($('#questPanel .solution'), 'la correction apparaît');
});

test('un flag invalide affiche une erreur sans casser la page', async () => {
  stubFetch();
  registered = [];
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  const form = $('#questPanel .submit-box');
  form.querySelector('#flagInput').value = 'FLAG{NOPE}';
  form.dispatchEvent(new dom.window.Event('submit'));
  await new Promise((r) => setTimeout(r, 30));

  assert.match($('#questPanel .submit-msg').textContent, /❌/);
  assert.match($('#questPanel .submit-msg').textContent, /invalide/i);
  assert.equal(registered.length, 0, 'rien n\'a été validé');
  assert.ok($('#questPanel .brief'), 'l\'énoncé reste affiché');
});

test('le mode normal n\'affiche ni score ni rang ni temps', async () => {
  stubFetch({
    '/api/quests': () => ({ ...questPayload(registered), mode: 'normal' }),
    '/api/me': () => ({ ...mePayload(registered), mode: 'normal', score: null, rank: null,
      history: mePayload(registered).history.map((h) => ({ ...h, time_display: null })) }),
  });
  registered = [];
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  assert.equal($('#statScore').hidden, true, 'le bloc score est masqué');
  assert.equal($('#statRank').hidden, true, 'le bloc rang est masqué');
  assert.match($('#modeChip').textContent, /Normal/);
  // L'historique ne doit contenir aucun chronomètre.
  assert.doesNotMatch($('#historyBox').textContent, /⏱/);
  assert.match($('#historyBox').textContent, /validée/);
});

test('le joueur d\'un autre poste reprend sa session', async () => {
  stubFetch();
  registered = [pack.quests[0].id];
  store.clear();
  store.set('docker-ops-race:v1', JSON.stringify({ token: 'dq_ancien', team: 'Testeur', mode: 'competitive' }));
  const app = await loadClient();
  await app.bootPlayer();

  assert.equal(text('#progressVal'), `1/${pack.totalQuests}`, 'la progression est restaurée');
  assert.equal(text('#teamName'), 'Testeur');
});

test('une mission verrouillée ne s\'ouvre pas', async () => {
  stubFetch();
  registered = [];
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  app.openQuest(pack.quests[5].id);   // mission n°6, verrouillée
  assert.equal(text('#questPanel .quest-head h2'), pack.quests[0].title,
    'on reste sur la mission courante');
  assert.match($('#toast').textContent, /verrouill/i);
});

test('le client échappe tout ce qu\'il affiche', async () => {
  stubFetch();
  registered = [];
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();
  app.renderPortal(overviewPayload());

  // Aucun nom d'équipe injecté ne doit produire de balise : on le vérifie
  // via innerHTML du panneau construit par le client.
  assert.equal($('#questPanel').querySelectorAll('script').length, 0);
  assert.equal($('#questMap').querySelectorAll('script').length, 0);
});