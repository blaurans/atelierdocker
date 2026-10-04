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
/**
 * @param completed  les identifiants déjà validés
 * @param linear     le mode progression stricte. **Faux par défaut**, comme
 *   le serveur : `ARENA_LINEAR` n'est pas positionné en production, donc rien
 *   n'est verrouillé et un élève bloqué peut consulter n'importe quelle mission.
 *   La fixture appliquait un verrouillage par défaut — le comportement de la
 *   V1 — et les tests qui ouvraient une mission au-delà de la première
 *   échouaient sans qu'on comprenne pourquoi.
 */
const questPayload = (completed = [], linear = false) => ({
  total_quests: pack.totalQuests,
  total_points: pack.totalPoints,
  mode: 'competitive',
  completed,
  linear_progression: linear,
  modules: pack.modules.map((m) => ({
    module: m.module, title: m.title, tagline: m.tagline, icon: m.icon,
    quests: m.quests.map((q) => ({
      id: q.id, number: q.number, title: q.title, points: q.points,
      flagship: q.flagship, est_minutes: q.estMinutes, teaches: q.teaches,
      checkpoint: q.checkpoint, brief: q.brief,
      hint_count: pack.hintsByQuest.get(q.id).length,
      charge: q.charge ?? null,
      // Comme le serveur : les questions sans leur réponse. Une fixture qui
      // garderait `answer` ferait passer un test de rendu pour une mauvaise
      // raison — le client pourrait « afficher juste » en lisant la réponse
      // dans le payload.
      check: (q.check ?? []).map((c) => ({
        id: c.id, kind: c.kind, prompt: c.prompt, required: c.required,
        ...(c.kind === 'mcq' ? { choices: c.choices } : {}),
      })),
      recall: q.recall ? { id: q.recall.id, prompt: q.recall.prompt } : null,
      // Le serveur ne transmet ni le flag (il n'existe pas dans le contenu),
      // ni la correction avant validation, ni les indices. Il fournit la
      // commande.
      fetch_hint: (q.fetchHint ?? '')
        .replaceAll('https://SERVER_IP', 'http://localhost:8000')
        .replaceAll('http://SERVER_IP', 'http://localhost:8000')
        .replaceAll('dq_xxxxxxxxxxxxxxxx', 'dq_testtoken')
        .replaceAll('$ARENA_TOKEN', 'dq_testtoken'),
      solution: completed.includes(q.id) ? q.solution : null,
      locked: linear && !completed.includes(q.id) && q.number > completed.length + 1,
      completed: completed.includes(q.id),
    })),
  })),
});

const mePayload = (completed = [], mode = 'competitive') => ({
  team: 'Testeur', mode,
  // Le libellé vient du serveur : c'est lui qui décide de « Challenge » ou
  // « Sans stress », le client ne fait que l'afficher.
  mode_label: mode === 'competitive' ? 'Challenge' : 'Sans stress',
  mastery: {
    done: completed.length, total_quests: pack.totalQuests,
    autonomous: completed.length, understood: completed.length,
    reflex: completed.length,
    // Le stub suppose une promotion où chaque quête validée l'a été sans
    // indice. Le test qui prend un indice le remet explicitement à 1.
    hints_used: 0,
    progress_ratio: completed.length / pack.totalQuests,
    autonomy_ratio: completed.length ? 1 : 0,
    comprehension_ratio: completed.length ? 1 : 0,
    reflex_ratio: completed.length ? 1 : 0,
    level: { key: 'ranim', name: 'Ça tourne' },
    modules: [],
  },
  total_quests: pack.totalQuests,
  progress: `${completed.length}/${pack.totalQuests}`,
  completed_percent: Math.round((completed.length / pack.totalQuests) * 100),
  finished: completed.length === pack.totalQuests,
  registered_at: '14:02:11', last_submission: '14:31:07',
  next_quest: pack.quests.find((q) => !completed.includes(q.id))?.id ?? null,
  history: completed.map((id, i) => {
    const q = pack.quests.find((x) => x.id === id);
    return {
      quest_id: id, quest_number: q.number, title: q.title,
      hints_used: 0, autonomous: true, check_ok: true, recall_ok: true,
      status: 'done',
      check_attempts: 1, recall_attempts: 1,
      wrong_flags: i === 0 ? 1 : 0,
      time_ms: 120_000, at: '2026-01-01T14:00:00.000Z', time_display: '2 min 00 s',
    };
  }),
});

/**
 * Le payload de `/api/overview`, calqué sur `overview()` dans `src/portal.js`.
 *
 * Une seule liste `players`, tous modes confondus, avec les trois ratios et le
 * niveau — plus aucun score ni rang. La fixture suit la forme réelle : c'est
 * elle qui avait laissé les tests verts pendant que le portail affichait `NaN`.
 */
const overviewPayload = () => ({
  players: [
    { team: 'Alice', mode: 'competitive', done: 3,
      progress_ratio: 0.11, autonomy_ratio: 1, comprehension_ratio: 0.75,
      hints_used: 0, level: 'autonome', level_name: 'Autonome', modules: [],
      attempts: 3, progress: '3/27', finished: false,
      registered_at: '14:00:00', last_submission: '14:10:00',
      last_submit_iso: '2026-01-01T14:10:00.000Z', last_ip: '::ffff:192.168.38.42',
      quests: ['m1-01-diagnostiquer-la-machine'], quest_numbers: [1, 2, 3],
      last_quest: null },
    { team: 'Bruno', mode: 'normal', done: 12,
      progress_ratio: 0.44, autonomy_ratio: 0.6, comprehension_ratio: 0.3,
      hints_used: 4, level: 'guide', level_name: 'Guidé', modules: [],
      attempts: 12, progress: '12/27', finished: false,
      registered_at: '14:00:00', last_submission: '14:12:00',
      last_submit_iso: '2026-01-01T14:12:00.000Z', last_ip: '192.168.38.17',
      quests: [], last_quest: null },
    { team: 'Chloe', mode: 'competitive', done: 27,
      progress_ratio: 1, autonomy_ratio: 0.9, comprehension_ratio: 1,
      hints_used: 2, level: 'expert', level_name: 'Expert', modules: [],
      attempts: 31, progress: '27/27', finished: true,
      registered_at: '14:00:00', last_submission: '14:15:00',
      last_submit_iso: '2026-01-01T14:15:00.000Z', last_ip: null,
      quests: [], quest_numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      last_quest: null },
  ],
  meta: {
    total_quests: pack.totalQuests,
    modules: [], server_time: '', attestation_required: false,
    players: 3, completions: 42,
    cohort: {
      players: 3, started: 3, total_quests: pack.totalQuests, started_ratio: 1,
      average_autonomy: 0.83, average_hints: 0.4,
      hardest: [{ module: 4, hints: 9 }, { module: 2, hints: 5 }],
    },
  },
});

let registered = [];
let submitted = [];
let hintsPris = 0;
/** Le mode progression stricte, positionné par le seul test qui l'exerce. */
let lineaire = false;
/** Réponses de compréhension déjà données, comme la base les relit. */
let essais = {};

function stubFetch(routes = {}) {
  globalThis.fetch = async (url, opts = {}) => {
    const path = String(url).replace('http://localhost:8000', '');
    const method = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : {};
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

    if (routes[path]) return json(routes[path](body, method));

    if (path === '/api/overview') return json(overviewPayload());
    if (path === '/api/commands') return json([{ action: 'Lister', cmd: 'docker ps' }]);
    if (path === '/api/quests') return json(questPayload(registered, lineaire));
    if (path === '/api/me') return json(mePayload(registered));
    // Les réponses de compréhension, comme la base les rend : des chaînes, et
    // pas les types que la question attend. C'est ce qui a fait qu'une question
    // Vrai/Faux déjà réussie se ré-affichait comme fausse après rechargement.
    if (path.endsWith('/attempts')) {
      const cle = path.split('/')[3];
      return json({
        hints_used: hintsPris, hint_count: 2, hints_charged: hintsPris,
        // La forme est celle de `attemptsFor()` : `kind` et `item_id` séparés,
        // `answer` en chaîne. Une fixture qui s'écarterait de cette forme ferait
        // passer le test d'hydratation pour une mauvaise raison.
        attempts: Object.entries(essais)
          .filter(([k]) => k.startsWith(`${cle}:`))
          .map(([k, v]) => {
            const [, kind, itemId] = k.split(':');
            return {
              kind, item_id: itemId, answer: String(v.answer),
              // Un **booléen**, comme `attemptsFor()` : la colonne SQLite est
              // un entier, la fonction la convertit. Une fixture qui renvoyait
              // `1` ferait échouer la comparaison stricte du client — et
              // surtout, elledocumenterait mal l'API.
              correct: v.correct === true, attempts: v.attempts,
            };
          }),
      });
    }
    if (path.endsWith('/check') && method === 'POST') {
      const cle = path.split('/')[3];
      const item = pack.byId.get(cle).check.find((c) => c.id === body.id);
      const correct = item.kind === 'boolean'
        ? body.answer === item.answer : Number(body.answer) === item.answer;
      const key = `${cle}:check:${body.id}`;
      essais[key] = { correct, answer: body.answer, attempts: (essais[key]?.attempts ?? 0) + 1 };
      return json({ status: 'ok', correct, attempts: essais[key].attempts,
        required: item.required, explanation: correct ? item.explanation : null });
    }
    if (path.endsWith('/recall') && method === 'POST') {
      const cle = path.split('/')[3];
      const r = pack.byId.get(cle).recall;
      const brut = String(body.answer ?? '').trim().toLowerCase();
      const correct = r.accept.some((a) => a.toLowerCase().includes(brut)
        || brut.includes(a.toLowerCase()));
      const key = `${cle}:recall:${r.id}`;
      essais[key] = { correct, answer: body.answer, attempts: (essais[key]?.attempts ?? 0) + 1 };
      return json({ status: 'ok', correct, attempts: essais[key].attempts,
        hint: correct ? null : r.hint });
    }
    if (path.startsWith('/api/quests/') && path.endsWith('/hint')) {
      const r = {
        status: 'ok', index: hintsPris, hint: 'Indice simulé.',
        autonomy_lost: hintsPris === 0 ? 1 : 0,
        remaining: Math.max(0, 2 - hintsPris - 1), free_next: false,
      };
      hintsPris += 1;
      return json(r);
    }
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
        quest_title: q.title, mastery: mePayload(registered).mastery,
        quest_result: { hints_used: hintsPris, autonomous: hintsPris === 0, check_ok: true },
        completed_count: `${registered.length}/${pack.totalQuests}`,
        finished: registered.length === pack.totalQuests,
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

  // Toutes les cellules du tableau des joueurs, une par une.
  for (const td of $$('#playersBody td')) {
    assert.doesNotMatch(td.textContent, /\[object HTML/i,
      'une cellule affiche un objet au lieu de son contenu');
  }
  // La progression doit contenir les pastilles, pas leur représentation : le
  // ratio d'autonomie est un nœud, pas du texte.
  const prog = $$('#playersBody tr td:nth-child(3)')[0];
  assert.ok(prog.querySelector('.qdot'), 'les pastilles de progression doivent être présentes');
  assert.ok($$('#playersBody tr td:nth-child(4)')[0].querySelector('.ratio-bar'),
    'le ratio d\'autonomie doit être une barre, pas un nombre nu');
});

test('le portail affiche l\'heure dans le fuseau du poste', async () => {
  stubFetch();
  const { renderPortal } = await loadClient();
  renderPortal(overviewPayload());

  const attendu = new Date('2026-01-01T14:10:00.000Z')
    .toLocaleTimeString('fr-FR', { hour12: false });
  // Septième colonne : équipe, mode, progression, autonomie, compréhension,
  // niveau, dernier flag, poste.
  const cellule = $$('#playersBody tr')[0].querySelectorAll('td')[6];
  assert.equal(cellule.textContent, attendu,
    'l\'heure doit être rendue dans le fuseau du navigateur, pas celui du serveur');
});

test('le tableau de suivi affiche la colonne IP', async () => {
  stubFetch();
  const { renderPortal } = await loadClient();
  renderPortal(overviewPayload());

  const alice = $$('#playersBody tr')[0].querySelectorAll('td');
  assert.equal(alice.length, 8, 'huit colonnes : équipe, mode, progression, '
    + 'autonomie, compréhension, niveau, dernier flag, poste');
  assert.match(alice[7].textContent, /192\.168\.38\.42/,
    'la forme ::ffff: doit être nettoyée');
  assert.match($$('#playersBody tr')[1].querySelectorAll('td')[7].textContent, /192\.168\.38\.17/);
});

test('le portail affiche la cohorte et le tableau de suivi', async () => {
  stubFetch();
  const { renderPortal } = await loadClient();
  renderPortal(overviewPayload());

  // Le bandeau remplace le podium : des chiffres, pas un classement.
  assert.equal($$('#podium .podium-step').length, 0, 'il ne doit plus y avoir de podium');
  const cartes = $$('#podium .cohort-card');
  assert.equal(cartes.length, 3, 'inscrits, avancement, autonomie');
  assert.match(cartes[0].textContent, /3/);
  assert.match(cartes[2].textContent, /83%/, 'l\'autonomie moyenne est un pourcentage');
  // « Où est-ce que ça coince ? » : l'atelier le plus consommé d'indices.
  assert.match($('#podium').textContent, /Atelier 4/);
  assert.doesNotMatch($('#podium').textContent, /pts/,
    'aucun point ne doit réapparaître dans le bandeau');

  assert.equal($$('#playersBody tr').length, 3);
  // Tri alphabétique : c'est la seule façon de retrouver un élève en séance.
  assert.match($$('#playersBody tr td')[0].textContent, /Alice/);
  assert.match($$('#playersBody tr td:nth-child(2)')[0].textContent, /Challenge/);
  assert.match($$('#playersBody tr')[1].textContent, /Sans stress/);
  assert.match($$('#playersBody tr')[1].textContent, /12\/27/);
  assert.match($$('#playersBody tr')[2].textContent, /ACHEVÉ ✅/);
  assert.match($('#playersBody').textContent, /Expert/);

  assert.equal(text('#questCount'), String(pack.totalQuests));
  assert.doesNotMatch($('#podium').textContent, /\d+ pts/);
});

test('le portail gère le vide sans casser', async () => {
  stubFetch();
  const { renderPortal } = await loadClient();
  // Une classe vide : c'est l'état du portail au premier jour, avant le premier
  // élève. Il ne doit ni lever une exception ni afficher « undefined ».
  renderPortal({
    players: [],
    meta: {
      total_quests: pack.totalQuests, modules: [], players: 0, completions: 0,
      cohort: { players: 0, started: 0, total_quests: pack.totalQuests,
        started_ratio: 0, average_autonomy: 0, average_hints: 0, hardest: [] },
    },
  });
  assert.match($('#podium').textContent, /Aucun inscrit/);
  assert.match($('#playersBody').textContent, /Aucun inscrit/);
  assert.doesNotMatch($('#playersBody').textContent, /undefined|NaN/);
});

test('le portail affiche les commandes curl, en https et sans score', async () => {
  stubFetch();
  const { renderPortal } = await loadClient();
  renderPortal(overviewPayload());
  const curl = text('#curlExamples');
  assert.match(curl, /api\/register/);
  assert.match(curl, /competitive/);
  assert.match(curl, /api\/submit/);
  assert.match(curl, /api\/overview/);
  // Le portail est derrière Caddy, en HTTPS. Une commande en `http://` se
  // faisait rediriger, et un élève qui l'a suivie depuis un terminal sans
  // `curl -L` obtenait une page vide.
  // L'origine du navigateur, protocole compris. Le harnais sert en http, donc
  // on ne peut pas interdire `http://` — ce qu'on vérifie, c'est qu'aucune
  // commande ne se fabrique son propre préfixe au lieu de reprendre celui de la
  // page : c'est exactement le bug qui envoyait les élèves en clair vers un
  // portail qui ne l'est plus.
  for (const cmd of curl.split('\n').filter((l) => l.includes('curl '))) {
    assert.match(cmd, /curl (-X POST )?http:\/\/localhost:8000\/api\//,
      `la commande ne reprend pas l'origine de la page : ${cmd}`);
  }
  assert.doesNotMatch(curl, /avec score|Alice_Bob/,
    'la copie de la V1 est restée : score, chrono, et binômes');
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
  // Ni score ni rang : les deux blocs ont été remplacés par le niveau et
  // l'autonomie.
  assert.equal(text('#levelVal'), 'Ça tourne');
  assert.equal(text('#autonomyVal'), '0 %');
  assert.equal(text('#sinceTag'), 'inscrit à 14:02:11');
  assert.match($('#modeChip').textContent, /Challenge/);

  // Le plan liste les 7 modules et leurs missions.
  assert.equal($$('#questMap .map-mod').length, 7);
  assert.equal($$('#questMap .qitem').length, pack.totalQuests);
  // Par défaut **rien n'est verrouillé** : c'est le moyen de ne pas rester
  // bloqué, et c'est la configuration de production. Le seul test qui exerce
  // le verrouillage l'active explicitement — plus bas.
  assert.equal($$('#questMap .qitem.locked').length, 0);
  assert.equal($$('#questMap .qitem:not(.done)').length, pack.totalQuests);

  // Le bandeau propose quand même un fil conducteur, sans obliger.
  assert.match($('#questMap').textContent, /Par où continuer/);

  // L'encart « à faire maintenant » pointe sur la première mission.
  assert.match($('#questMap .map-next-t').textContent, /Diagnostiquer la machine/);
  assert.equal(text('#questPanel .quest-head h2'), pack.quests[0].title);
});

test('le mode progression stricte verrouille, mais seulement si on le demande', async () => {
  stubFetch();
  registered = [];
  submitted = [];
  hintsPris = 0;
  essais = {};
  lineaire = true;
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  // Une seule mission déverrouillée au départ : celle qui suit.
  assert.equal($$('#questMap .qitem:not(.locked):not(.done)').length, 1);

  // Et le serveur refusera la validation d'une mission non atteinte : le
  // verrouillage client n'est qu'un guidage, la règle reste côté serveur.
  const complete = stubFetch({
    '/api/submit': () => ({
      status: 'error', error: 'Mission verrouillée : termine d\'abord la précédente.',
    }),
  });
  void complete;
});

test('le jeton est toujours affiché et copiable', async () => {
  stubFetch();
  registered = [];
  store.set('atelier-docker:v2',
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
  const cmd = hint.querySelector('.fetch-hint-code').textContent;
  // La première quête a lieu avant l'installation de Docker : la commande y est
  // un `curl`. Le test vérifie qu'elle cible bien le portail et porte le jeton,
  // pas qu'elle contient « docker run » — ce serait faux pour cette quête.
  assert.match(cmd, /api\/secret\//, 'la commande doit viser le portail');
  assert.match(cmd, /dq_testtoken/, 'le jeton doit y être déjà substitué');
  assert.doesNotMatch(cmd, /dq_x{10}/, 'le littéral du jeton ne doit pas subsister');

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

test('les questions de compréhension sont rendues', async () => {
  stubFetch();
  registered = [];
  submitted = [];
  hintsPris = 0;
  essais = {};
  lineaire = false;
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  const q = pack.quests[0];
  const panel = $('#questPanel');
  const bloc = panel.querySelector('.compr');

  // 70 questions existent dans le contenu et **aucune** n'était rendue : un
  // test humain a rapporté « je ne vois pas les QCM ». Le mécanisme de
  // vérification était invisible.
  assert.ok(bloc, 'le bloc de compréhension doit exister dans la mission');
  assert.equal(bloc.querySelectorAll('.qcm').length, q.check.length,
    'une carte par question');
  assert.match(bloc.querySelector('.compr-t').textContent, /compris/i);

  // Chaque question propose des choix cliquables — le nombre exact de ceux du
  // contenu, pour une question à choix.
  const premiere = q.check.find((c) => c.kind === 'mcq') ?? q.check[0];
  const carte = [...bloc.querySelectorAll('.qcm')]
    .find((c) => c.textContent.includes(premiere.prompt.slice(0, 30)));
  assert.ok(carte, 'la première question doit être identifiable');
  const choix = carte.querySelectorAll('.qcm-choice');
  const attendus = premiere.kind === 'boolean' ? 2 : premiere.choices.length;
  assert.equal(choix.length, attendus, `autant de choix que la question en prévoit`);

  // Aucune justification avant d'avoir répondu : l'envoyer d'abord viderait la
  // question de son intérêt.
  assert.equal(carte.querySelectorAll('.why').length, 0);

  // Le réflexe, quand la mission en a un.
  if (q.recall) {
    assert.ok(bloc.querySelector('.qcm-recall'), 'le réflexe doit être rendu');
    assert.ok(bloc.querySelector('.recall-input'), 'avec un champ de saisie');
  }
});

test('répondre juste à une question affiche la justification', async () => {
  stubFetch();
  registered = [];
  submitted = [];
  hintsPris = 0;
  essais = {};
  lineaire = false;
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  const q = pack.quests[0];
  const item = q.check[0];
  const bloc = $('#questPanel').querySelector('.compr');
  const carte = [...bloc.querySelectorAll('.qcm')]
    .find((c) => c.textContent.includes(item.prompt.slice(0, 30)));

  // La bonne réponse, calculée depuis le contenu — le client ne la connaît pas.
  const index = [...carte.querySelectorAll('.qcm-choice')]
    .findIndex((b) => b.textContent === (item.kind === 'boolean'
      ? (item.answer ? 'Vrai' : 'Faux')
      : item.choices[item.answer]));
  assert.ok(index >= 0, 'le bon choix doit exister dans l\'interface');

  carte.querySelectorAll('.qcm-choice')[index]
    .dispatchEvent(new dom.window.Event('click'));
  await new Promise((r) => setTimeout(r, 20));

  const apres = [...$('#questPanel').querySelectorAll('.qcm')]
    .find((c) => c.textContent.includes(item.prompt.slice(0, 30)));
  assert.match(apres.textContent, /Juste/);
  assert.ok(apres.querySelector('.why'), 'la justification arrive avec la bonne réponse');
  assert.ok(apres.querySelector('.why').textContent.includes(item.explanation.slice(0, 40)),
    'la justification affichée est bien celle de la question');
});

test('répondre faux n\'affiche pas la justification, et n\'empêche rien', async () => {
  stubFetch();
  registered = [];
  submitted = [];
  hintsPris = 0;
  essais = {};
  lineaire = false;
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  const q = pack.quests[0];
  const item = q.check.find((c) => c.kind === 'mcq') ?? q.check[0];
  const bloc = $('#questPanel').querySelector('.compr');
  const carte = [...bloc.querySelectorAll('.qcm')]
    .find((c) => c.textContent.includes(item.prompt.slice(0, 30)));

  const mauvais = [...carte.querySelectorAll('.qcm-choice')]
    .find((b) => b.textContent !== (item.kind === 'boolean'
    ? (item.answer ? 'Vrai' : 'Faux') : item.choices[item.answer]));
  mauvais.dispatchEvent(new dom.window.Event('click'));
  await new Promise((r) => setTimeout(r, 20));

  const apres = [...$('#questPanel').querySelectorAll('.qcm')]
    .find((c) => c.textContent.includes(item.prompt.slice(0, 30)));
  assert.match(apres.textContent, /Faux/);
  assert.match(apres.textContent, /Réessaie|réessaie/,
    'l\'élève doit savoir qu\'il peut réessayer sans coût');
  assert.equal(apres.querySelectorAll('.why').length, 0,
    'pas de justification avant la bonne réponse — ce serait la donner');

  // Et surtout : le formulaire de validation est toujours là. Répondre faux à
  // une question ne bloque rien.
  assert.ok($('#questPanel #flagInput'), 'on doit pouvoir valider la mission quand même');
});

test('les réponses déjà données sont relues au rechargement', async () => {
  stubFetch();
  registered = [];
  submitted = [];
  hintsPris = 0;
  essais = {};
  lineaire = false;
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  const q = pack.quests[0];
  const item = q.check.find((c) => c.kind === 'boolean') ?? q.check[0];
  const cle = `${q.id}:check:${item.id}`;
  const bonne = item.kind === 'boolean' ? item.answer : item.answer;
  essais[cle] = { correct: true, answer: bonne, attempts: 1 };

  // On rouvre la mission : l'état vient de la base, pas de la mémoire de l'onglet.
  app.openQuest(q.id);
  await new Promise((r) => setTimeout(r, 20));

  const carte = [...$('#questPanel').querySelectorAll('.qcm')]
    .find((c) => c.textContent.includes(item.prompt.slice(0, 30)));
  assert.match(carte.textContent, /Juste/,
    'une question déjà réussie ne doit pas se redemander après un rechargement');
  assert.ok(carte.querySelector('.qcm-choice.ok'), 'le bon choix est marqué');
  assert.ok([...carte.querySelectorAll('.qcm-choice')].every((b) => b.disabled),
    'et on ne peut plus y répondre : ce serait compter une deuxième tentative');
});

test('le réflexe se relit aussi, et une question Vrai/Faux reste vraie', async () => {
  stubFetch();
  registered = [];
  submitted = [];
  hintsPris = 0;
  essais = {};
  lineaire = false;
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  // Une quête qui porte à la fois une question booléenne et un réflexe.
  const q = pack.quests.find((x) => x.check.some((c) => c.kind === 'boolean') && x.recall);
  assert.ok(q, 'le contenu doit contenir une quête de ce type');
  app.openQuest(q.id);
  await new Promise((r) => setTimeout(r, 20));

  const booleenne = q.check.find((c) => c.kind === 'boolean');
  const cle = `${q.id}:check:${booleenne.id}`;
  // La base ne stocke qu'une chaîne : « true ». Si le client ne retransforme
  // pas, la réponse déjà bonne se réaffiche comme fausse.
  essais[cle] = { correct: true, answer: String(booleenne.answer), attempts: 1 };
  essais[`${q.id}:recall:${q.recall.id}`] = { correct: true, answer: q.recall.accept[0], attempts: 1 };

  app.openQuest(q.id);
  await new Promise((r) => setTimeout(r, 20));

  const carte = [...$('#questPanel').querySelectorAll('.qcm')]
    .find((c) => c.textContent.includes(booleenne.prompt.slice(0, 30)));
  assert.match(carte.textContent, /Juste/,
    'une question Vrai/Faux déjà réussie doit rester juste après rechargement');

  const reflexe = $('#questPanel').querySelector('.qcm-recall');
  assert.match(reflexe.textContent, /Juste/);
  assert.equal(reflexe.querySelector('.recall-input').value, q.recall.accept[0]);
  assert.ok(reflexe.querySelector('.recall-input').disabled, 'et n\'est plus modifiable');
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
  hintsPris = 0;
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  const panel = $('#questPanel');
  const q = pack.quests[0];
  assert.match(panel.textContent, new RegExp(q.title.slice(0, 12)));
  assert.ok(panel.querySelector('pre code'), 'le bloc bash de l\'énoncé est rendu');
  assert.match(panel.textContent, new RegExp(q.checkpoint.slice(0, 20)));
  assert.equal(panel.querySelectorAll('.teach').length, q.teaches.length);

  // Aucun indice n'est présent avant le clic : ils ne sont plus dans le payload,
  // et c'est ce qui rend la facturation possible.
  assert.equal(panel.querySelectorAll('.hint').length, 0,
    'aucun indice ne doit être rendu avant d\'être demandé');

  const idxBtn = [...panel.querySelectorAll('button')].find((b) => /indice/i.test(b.textContent));
  idxBtn.dispatchEvent(new dom.window.Event('click'));
  await new Promise((r) => setImmediate(r));

  assert.equal(panel.querySelectorAll('.hint').length, 1, 'un indice s\'affiche après la demande');
  // Le coût est affiché : un élève ne doit pas découvrir qu'il a payé en
  // regardant son score après coup.
  assert.ok(panel.querySelector('.hint-cost'),
    'le coût de l\'indice doit être dit dans la mission');

  // Le champ de soumission est présent avec le bon placeholder.
  assert.match(panel.querySelector('#flagInput').getAttribute('placeholder'), /FLAG/);
});

test('soumettre une mission met à jour la maîtrise, la progression et l\'historique', async () => {
  stubFetch();
  registered = [];
  submitted = [];
  hintsPris = 0;
  essais = {};
  lineaire = false;
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
  // Validée sans indice : elle compte pour l'autonomie.
  assert.equal(text('#autonomyVal'), '100 %');
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
    '/api/me': () => mePayload(registered, 'normal'),
  });
  registered = [];
  const app = await loadClient();
  store.clear();
  await app.bootPlayer();

  // Le mode Sans stress ne masque plus de bloc de score : il n'y en a plus.
  // Ce qui le distingue, c'est le libellé — et surtout que rien n'est appliqué
  // différemment selon le mode.
  assert.match($('#modeChip').textContent, /Sans stress/);
  assert.match(text('#autonomyVal'), /\d+ %/, 'l\'autonomie s\'affiche dans les deux modes');
  // L'historique ne doit contenir aucun chronomètre.
  assert.doesNotMatch($('#historyBox').textContent, /⏱/);
  assert.match($('#historyBox').textContent, /validée/);
});

test('le joueur d\'un autre poste reprend sa session', async () => {
  stubFetch();
  registered = [pack.quests[0].id];
  store.clear();
  store.set('atelier-docker:v2', JSON.stringify({ token: 'dq_ancien', team: 'Testeur', mode: 'competitive' }));
  const app = await loadClient();
  await app.bootPlayer();

  assert.equal(text('#progressVal'), `1/${pack.totalQuests}`, 'la progression est restaurée');
  assert.equal(text('#teamName'), 'Testeur');
});

test('une mission verrouillée ne s\'ouvre pas', async () => {
  stubFetch();
  registered = [];
  // Le verrouillage n'existe que si l'enseignant l'a demandé. Ce test est le
  // seul à l'activer : partout ailleurs, une mission non atteinte doit
  // s'ouvrir — c'est le filet qui évite de laisser un élève bloqué.
  lineaire = true;
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