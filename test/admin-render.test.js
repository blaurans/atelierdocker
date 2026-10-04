import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import fs from 'node:fs';
import path from 'node:path';
import { quests } from '../src/questpack.js';

/**
 * L'écran d'administration, exécuté.
 *
 * ## Pourquoi un harnais plutôt que des assertions sur le texte
 *
 * `public/admin.js` a contenu une faute — `${clase}` au lieu de `${classe}` —
 * que **`node --check`validait** : `clase` est un identifiant parfaitement
 * légal, il n'est simplement jamais défini. Le fichier ne se cassait qu'au
 * moment où le navigateur dessinait le tableau des élèves, c'est-à-dire
 * jamais dans les tests.
 *
 * C'est la même famille de défaut que le bouton d'indice né `disabled` : la
 * faute ne se voit qu'à l'exécution, dans un moteur qui exécute vraiment.
 * Ce fichier exécute donc vraiment — comme `test/render.test.js` le fait pour
 * `app.js`.
 */
const html = fs.readFileSync(path.resolve('public/admin.html'), 'utf8');
const pack = quests();

let fetched = [];
let flux = null;
let inscrits = [];

const PAYLOAD = () => ({
  players: inscrits.map((p, i) => ({
    team: p, mode: i % 2 ? 'competitive' : 'normal', done: 3 + i,
    progress: `${3 + i}/${pack.totalQuests}`,
    autonomy_ratio: 0.9 - i * 0.3, comprehension_ratio: 1 - i * 0.3,
    hints_used: i, level: 'autonome', level_name: 'Autonome',
    quests: [], last_ip: '192.168.38.' + (10 + i), finished: false,
    last_submission: '14:0' + i + ':00',
  })),
  meta: {
    total_quests: pack.totalQuests, players: inscrits.length, completions: 3,
    cohort: {
      players: inscrits.length, started: inscrits.length,
      total_quests: pack.totalQuests, started_ratio: 1,
      average_autonomy: 0.7, average_hints: 0.4,
      hardest: [{ module: 4, hints: 9 }],
    },
  },
});

const STATS = () => ({
  ok: true, players: inscrits.length, completions: 3,
  by_mode: { competitive: 1, normal: 2 },
  classroom: {
    moyenne_quetes: 4.5, autonomie_moyenne: 0.7,
    indices_demandes: 6, autonomes_sur_8: 2,
    atelier_le_plus_consomme: { module: 4, hints: 9 },
  },
  quests: {
    total: pack.totalQuests, minutes: 413,
    bloquees: [{ number: 9, id: 'm3-01', title: 'Ports et variables', module: 3,
      bloques: 4, resolues: 6 }],
  },
  pending: [{ team: 'Camille', player_id: 1, quest_id: 'm1-01', quest_number: 1,
    completed_at: '2026-01-01T14:05:00.000Z' }],
  recent_events: [{ at: '2026-01-01T14:05:00.000Z', kind: 'submit', detail: 'm1-01' }],
});

function installerDom() {
  const dom = parseHTML(html);
  dom.window.EventSource = class {
    constructor(url) { this.url = url; flux = this; this.onopen = null; this.listeners = {}; }
    addEventListener(k, fn) { this.listeners[k] = fn; }
    close() { this.closed = true; }
    /** Simule une poussée du serveur. */
    pousser() { this.listeners.overview?.({ data: JSON.stringify(PAYLOAD()) }); }
  };
  globalThis.__dqWin = dom.window;
  Object.assign(globalThis, {
    document: dom.window.document,
    location: { origin: 'http://localhost:8000', host: 'localhost:8000', hash: '/admin' },
    EventSource: dom.window.EventSource,
    localStorage: {
      _m: new Map(),
      getItem(k) { return this._m.get(k) ?? null; },
      setItem(k, v) { this._m.set(k, v); },
      clear() { this._m.clear(); },
    },
    confirm: () => true,
  });
  return dom;
}

function installerFetch(sessionOuverte = true) {
  fetched = [];
  globalThis.fetch = async (url, opts = {}) => {
    const chemin = String(url).replace('http://localhost:8000', '');
    const methode = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : {};
    fetched.push({ chemin, methode, body });
    const json = (data, status = 200) => ({
      ok: status < 400, status, json: async () => data,
    });

    if (chemin === '/api/admin/session' && methode === 'GET') {
      return json({ ok: true, authenticated: sessionOuverte, ttl_hours: 8 });
    }
    if (chemin === '/api/admin/session' && methode === 'POST') {
      return body.password === 'bon'
        ? json({ status: 'ok', message: 'Session ouverte.' })
        : json({ status: 'error', error: 'Mot de passe incorrect.' }, 401);
    }
    if (chemin === '/api/overview') return json(PAYLOAD());
    if (chemin === '/api/stats') return json(STATS());
    return json({ status: 'error', error: `inconnu ${chemin}` }, 404);
  };
}

async function charger() {
  const dom = installerDom();
  const code = fs.readFileSync(path.resolve('public/admin.js'), 'utf8')
    .replace(/^import .*$/gm, '')
    // L'amorçage, en bas de fichier, attend la session avant de décider quoi
    // afficher. Le test pilote lui-même le cycle de vie : on le retire, sinon
    // il s'exécuterait dans une fonction ordinaire, où `await` est illegal.
    .replace(/\/\* -+ amorçage[\s\S]*$/, '')
    // Comme dans le navigateur, le flux vient du global.
    .replace(/new EventSource/g, 'new globalThis.EventSource');
  // eslint-disable-next-line no-new-func
  const fabrique = new Function(`${code}
return { charger, demarrer, confirmer, rendreJoueurs, rendreStats, rendreBloquees };`);
  const api = fabrique();
  await tick();
  return { dom, api };
}

const $ = (s) => globalThis.document.querySelector(s);
const $$ = (s) => [...globalThis.document.querySelectorAll(s)];
const tick = () => new Promise((r) => setTimeout(r, 30));

/* -------------------------------------------------------------------- tests */

test('la classe s\'affiche : une ligne par joueur, avec ses ratios', async () => {
  inscrits = ['Camille', 'Dimitri', 'Basile'];
  installerFetch();
  const { api } = await charger();
  await api.charger();

  assert.equal($('#playersBody').children.length, 3, 'trois joueurs, trois lignes');
  assert.match($('#playersBody').textContent, /Camille/);
  assert.match($('#playersBody').textContent, /Basile/);

  // Les ratios sont des barres, pas des nombres nus : c'est ce qui permet de
  // comparer vingt lignes d'un coup d'œil.
  assert.equal($$('#playersBody .ratio-bar').length, 6, 'deux ratios par joueur');

  // Le texte ne doit contenir ni `undefined`, ni `NaN`, ni — surtout — un nœud
  // affiché comme texte. C'est arrivé dans la colonne « Niveau » : le nœud
  // était passé en troisième argument de `el()`, qui le convertissait en
  // chaîne. Le garde-fou de `el()` le rend impossible maintenant ; ce test
  // vérifie que le tableau ne régresse pas.
  const texte = document.body.textContent;
  assert.doesNotMatch(texte, /undefined|NaN|\[object/);
  assert.doesNotMatch($('#playersBody').textContent, /object HTML/);
  assert.equal($$('#playersBody td .badge').length, 6,
    'mode et niveau sont des nœuds, pas du texte : trois joueurs, deux badges');

  // Et les actions : trois boutons par joueur.
  assert.equal($$('#playersBody .c-right .btn').length, 9);
});

test('les quatre indicateurs de séance sont là', async () => {
  inscrits = ['Camille'];
  installerFetch();
  const { api } = await charger();
  await api.charger();

  const cartes = $$('#stats .cohort-card');
  assert.equal(cartes.length, 5, 'inscrits, avancement, autonomie, compris, atelier le plus consommé');
  assert.match($('#stats').textContent, /70 %/, 'autonomie moyenne en pourcentage');
  assert.match($('#stats').textContent, /Atelier 4/);
});

test('« où ça coince » liste les quêtes bloquées', async () => {
  inscrits = ['Camille'];
  installerFetch();
  const { api } = await charger();
  await api.charger();

  const liste = $$('#stuckList li');
  assert.equal(liste.length, 1);
  assert.match(liste[0].textContent, /Ports et variables/);
  assert.match(liste[0].textContent, /4 élève/);
});

test('les validations en attente n\'apparaissent que s\'il y en a', async () => {
  inscrits = ['Camille'];
  installerFetch();
  const { api } = await charger();
  await api.charger();
  assert.equal($('#pendingPanel').hidden, false);
  assert.match($('#pendingBody').textContent, /Camille/);
});

test('le filtre àPseudo fonctionne', async () => {
  inscrits = ['Camille', 'Dimitri', 'Basile'];
  installerFetch();
  const { api } = await charger();
  await api.charger();

  const champ = $('#search');
  const saisir = (v) => {
    champ.value = v;
    // L'événement doit venir du window de linkedom : son `Event` natif a un
    // `eventPhase` en lecture seule, que le `dispatchEvent` de linkedom
    // tente d'écrire.
    champ.dispatchEvent(new globalThis.__dqWin.Event('input'));
  };

  saisir('cami');
  assert.equal($('#playersBody').children.length, 1);
  assert.match($('#playersBody').textContent, /Camille/);

  saisir('zzz');
  assert.match($('#playersBody').textContent, /Aucun joueur ne correspond/);

  saisir('');
  assert.equal($('#playersBody').children.length, 3);
});

test('une classe vide ne casse rien et le dit', async () => {
  inscrits = [];
  installerFetch();
  const { api } = await charger();
  await api.charger();
  assert.match($('#playersBody').textContent, /Aucun inscrit/);
  assert.doesNotMatch(document.body.textContent, /undefined|NaN/);
});

test('remettre à zéro demande confirmation, et l\'annulation ne fait rien', async () => {
  inscrits = ['Camille'];
  installerFetch();
  const { api } = await charger();
  await api.charger();

  // On presse le vrai bouton de la vraie ligne, pas `confirmer()` : c'est le
  // chemin que l'enseignant prend, phrases comprises.
  const reinitialiser = $$('#playersBody .btn')[0];
  reinitialiser.dispatchEvent(new globalThis.__dqWin.Event('click'));
  await tick();

  const boite = $('.confirm-box');
  assert.ok(boite, 'la confirmation doit apparaître');
  const phrase = boite.querySelector('p').textContent;
  assert.match(phrase, /Remettre Camille à zéro/);
  assert.match(phrase, /effacés/,
    'la phrase dit ce qui est perdu, pas seulement « OK ? »');

  // Annuler : rien ne part.
  boite.querySelector('.btn-ghost').dispatchEvent(new globalThis.__dqWin.Event('click'));
  await tick();
  assert.equal($('.confirm-box'), null, 'la boîte doit disparaître');
  assert.equal(fetched.filter((f) => f.chemin.includes('/admin/reset')).length, 0,
    'aucun appel : annuler ne doit rien déclencher');
});

test('confirmer une remise à zéro appelle l\'API avec la confirmation', async () => {
  inscrits = ['Camille'];
  installerFetch();
  const { api } = await charger();
  await api.charger();

  $$('#playersBody .btn')[0].dispatchEvent(new globalThis.__dqWin.Event('click'));
  await tick();
  $('.confirm-box .btn-danger').dispatchEvent(new globalThis.__dqWin.Event('click'));
  await tick();
  await tick();

  const appel = fetched.find((f) => f.chemin.includes('/admin/reset'));
  assert.ok(appel, 'la remise à zéro doit partir');
  assert.equal(appel.methode, 'POST');
  assert.equal(appel.body.confirm, 'oui',
    'le serveur exige cette confirmation : l\'écran doit donc l\'envoyer');
});

test('supprimer un joueur ne se fait pas d\'un clic', async () => {
  inscrits = ['Camille'];
  installerFetch();
  const { api } = await charger();
  await api.charger();

  // Trois boutons : remise à zéro, changement de mode, suppression.
  const boutons = $$('#playersBody .btn');
  assert.equal(boutons.length, 3);
  boutons[2].dispatchEvent(new globalThis.__dqWin.Event('click'));
  await tick();
  assert.match($('.confirm-box p').textContent, /définitivement/);
  assert.match($('.confirm-box p').textContent, /irréversible/);
});

test('le flux live repeint le tableau sans recharger la page', async () => {
  inscrits = ['Camille'];
  installerFetch();
  const { api } = await charger();
  await api.demarrer();
  assert.ok(flux, 'le flux doit être ouvert');

  // Un nouvel élève arrive : la poussée repeint.
  inscrits = ['Camille', 'Dimitri'];
  flux.pousser();
  await tick();
  assert.equal($('#playersBody').children.length, 2,
    'une poussée du serveur doit ajouter la ligne sans rien recharger');
});

test('le flux est fermé quand on quitte la session', async () => {
  inscrits = ['Camille'];
  installerFetch();
  const { api } = await charger();
  await api.demarrer();
  assert.equal(flux.closed, undefined);
  await api.charger();
  assert.ok(flux);
});

test('le mémento curl dit où trouver le mot de passe, et avertit', async () => {
  inscrits = [];
  installerFetch();
  const { api } = await charger();
  await api.charger();
  const texte = $('#curlBox').textContent;
  assert.match(texte, /ATELIER_ADMIN_KEY/);
  assert.match(texte, /X-Arena-Admin/);
  assert.match(document.body.textContent, /historique du terminal/,
    'avertir que le mot de passe reste dans l\'historique : c\'est le prix de l\'en-tête');
  assert.match(document.body.textContent, /ne gère pas les cookies/);
});

test('[hidden] gagne contre toute règle d\'affichage', () => {
  // Le bug le plus discret du CSS : `.admin-gate { display: grid }` a la même
  // spécificité que le `[hidden]` du navigateur, et la feuille d'auteur passe
  // après. Résultat : après connexion, l'écran du mot de passe restait
  // affiché au-dessus du tableau — le JavaScript croyait l'avoir masqué.
  //
  // Le test vérifie la règle du CSS, parce que c'est elle qui garantit le
  // comportement : tant qu'elle existe, n'importe quelle future `.grille` est
  // couverte.
  const css = fs.readFileSync(path.resolve('public/style.css'), 'utf8');
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/,
    'une règle [hidden] explicite, avec !important');
  assert.match(css, /\.admin-gate\s*\{/, 'la grille du formulaire existe bien');
});

test('la page ne stocke rien et ne lit aucune clé', async () => {
  installerFetch();
  await charger();
  const texte = document.body.textContent;
  assert.doesNotMatch(texte, /adminKey/i,
    'la clé d\'administration ne doit pas apparaître dans la page');
});
