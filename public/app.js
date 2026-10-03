/**
 * Docker Ops Race — client.
 *
 * Deux vues dans une page :
 *   #portal  projection pour l'enseignant (podium + suivi), alimentée en SSE
 *   #game    le parcours de l'étudiant, après inscription
 *
 * Le token d'API est stocké en localStorage : il identifie l'équipe d'un
 * poste à l'autre sans mot de passe (voir README § Sécurité).
 */

import { renderMarkdown } from '/md.js';

const STORE_KEY = 'docker-ops-race:v1';

const state = {
  token: null,
  team: null,
  mode: null,
  pack: null,     // programme complet
  me: null,       // état du joueur
  current: null,  // id de la quête affichée
  source: null,   // EventSource
  retries: 0,     // échecs de connexion successifs (backoff)
};

/* ══════════════════════════════════════════════════════════════ utilitaires */

const $ = (sel) => document.querySelector(sel);

/**
 * Crée un élément.
 *
 * `texte` n'accepte qu'une chaîne ou un nombre. On refuse explicitement les
 * nœuds DOM : `textContent = <span>` affiche littéralement
 * « [object HTMLSpanElement] », ce qui est exactement le bug que cela évite.
 * Pour insérer un élément, on construit le nœud et on fait `appendChild`.
 */
const el = (tag, cls, texte) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (texte !== undefined && texte !== null) {
    if (typeof texte === 'object') {
      throw new TypeError(`el('${tag}') attend une chaîne, reçu un ${texte.constructor?.name ?? 'objet'}`);
    }
    n.textContent = String(texte);
  }
  return n;
};

const store = {
  read() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
  },
  write(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)); },
  clear() { localStorage.removeItem(STORE_KEY); },
};

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && state.token) headers['X-Arena-Token'] = state.token;

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: 'Réponse illisible du serveur.' }));
  if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { data, status: res.status });
  return data;
}

let toastTimer;

async function copie(texte) {
  try {
    await navigator.clipboard.writeText(texte);
  } catch {
    // Presse-papiers refusé (HTTP non sécurisé, vieux navigateur) : on
    // propose quand même la copie, en sélectionnant le texte.
    const zone = document.createElement('textarea');
    zone.value = texte;
    document.body.appendChild(zone);
    zone.select?.();
    document.execCommand?.('copy');
    zone.remove();
  }
}

function toast(message, kind = 'info', ms = 3600) {
  const box = $('#toast');
  box.textContent = message;
  box.className = `toast toast-${kind}`;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, ms);
}

/* ══════════════════════════════════════════════════════════════════ routage */

/**
 * Une seule source de vérité : le hash.
 *   (vide) ou '#portal' → projection enseignant
 *   '#/'                → le jeu (inscription ou reprise de session)
 */
async function route() {
  const wantsGame = location.hash.startsWith('#/');
  $('#portal').hidden = wantsGame;
  $('#game').hidden = !wantsGame;

  // Une seule connexion SSE à la fois, quelle que soit la vue. Sans cela,
  // chaque aller-retour portail → jeu laissait derrière lui une connexion
  // orpheline côté serveur : au bout de quelques bascules, le poste épuisait
  // son quota et l'indicateur restait bloqué sur « connexion… ».
  stopPortalStream();

  if (!wantsGame) {
    startPortalStream();
    try {
      renderPortal(await api('/api/overview', { auth: false }));
    } catch (err) { toast(err.message, 'err'); }
    return;
  }

  const saved = store.read();
  if (saved?.token) {
    state.token = saved.token;
    try {
      await bootPlayer();
      return;
    } catch {
      store.clear();      // token périmé ou base réinitialisée
      toast('Session expirée, inscris-toi à nouveau.', 'warn');
    }
  }
  showGate();
}

window.addEventListener('hashchange', route);

/* ══════════════════════════════════════════════════════ vue : le portail */

/**
 * Projection live du portail. Le serveur pousse `overview` à chaque
 * validation : plus de rafraîchissement toutes les 4 s comme dans le PDF.
 */
function startPortalStream() {
  stopPortalStream();

  const es = new EventSource('/api/live');
  state.source = es;
  state.retries = 0;

  es.addEventListener('overview', (e) => {
    state.retries = 0;
    setLive('on');
    renderPortal(JSON.parse(e.data));
  });

  // `EventSource` se reconnecte tout seul toutes les ~3 s. En salle, quand la
  // connexion coupe pour de bon (poste en veille, Wi-Fi), ces tentatives
  // automatiques consomment le quota du serveur et le FIGENT davantage. On
  // ferme donc la source et on la rouvre nous-mêmes, avec un recul exponentiel.
  es.onerror = () => {
    if (state.source !== es) return;          // déjà abandonnée
    setLive(state.retries === 0 ? 'wait' : 'retry');
    es.close();
    state.retries += 1;
    const pause = Math.min(30_000, 1000 * 2 ** (state.retries - 1));
    setTimeout(() => {
      if (!$('#portal').hidden && !state.source) startPortalStream();
    }, pause);
  };
}

function stopPortalStream() {
  if (state.source) {
    state.source.close();
    state.source = null;
  }
  state.retries = 0;
}

/**
 * @param {'on'|'off'|'wait'|'retry'} état
 *   on    flux établi, le portail suit le classement en direct
 *   off   vue jeu : le flux est volontairement arrêté
 *   wait  première connexion en cours
 *   retry coupure, nouvelle tentative programmée
 */
function setLive(etat) {
  const dot = $('#liveDot');
  const label = $('#liveLabel');
  dot.classList.toggle('off', etat !== 'on');
  dot.classList.toggle('pending', etat === 'wait' || etat === 'retry');
  label.textContent = {
    on: 'en direct',
    off: 'hors ligne',
    wait: 'connexion…',
    retry: 'reconnexion…',
  }[etat];
  // L'animation CSS ne tourne que si la connexion est réellement vivante.
  dot.dataset.state = etat;
}

function renderPortal(data) {
  const { competitive, normal, meta } = data;

  $('#questCount').textContent = meta.total_quests;
  $('#totalPoints').textContent = meta.total_points;

  renderPodium(competitive, meta);
  renderCompetitive(competitive, meta);
  renderNormal(normal);
  renderCurl(meta);
}

function renderPodium(rows, meta) {
  const box = $('#podium');
  box.textContent = '';
  if (!rows.length) {
    box.appendChild(el('p', 'podium-empty', 'Le podium attend son premier compétitif.'));
    return;
  }
  // Ordre d'affichage : 2ᵉ, 1ᵉʳ, 3ᵉ — la structure classique d'un podium.
  const order = [rows[1], rows[0], rows[2]].filter(Boolean);
  const heights = ['', 'is-first', ''];
  const medals = ['🥈', '🥇', '🥉'];

  order.forEach((row, idx) => {
    const step = el('div', `podium-step ${heights[idx] ?? ''}`);
    step.appendChild(el('div', 'podium-ico', medals[idx]));
    step.appendChild(el('div', 'podium-team', row.team));
    step.appendChild(el('div', 'podium-score', `${row.score} pts`));
    step.appendChild(el('div', 'podium-bar'));
    box.appendChild(step);
  });

  const foot = el('div', 'podium-foot');
  foot.appendChild(el('span', '', `${meta.players} compétitif${meta.players > 1 ? 's' : ''}`));
  if (meta.leader) foot.appendChild(el('span', '', `👑 ${meta.leader.team} en tête`));
  box.appendChild(foot);
}

function renderCompetitive(rows, meta) {
  const body = $('#compBody');
  body.textContent = '';
  if (!rows.length) {
    body.appendChild(emptyRow(6, 'Aucun compétitif inscrit.'));
    return;
  }
  for (const row of rows) {
    const tr = el('tr');
    tr.appendChild(el('td', 'c-rank', rankBadge(row.rank, row.finished)));

    const team = el('td');
    team.appendChild(el('span', 'team-cell', `> ${row.team}`));
    if (row.finished) team.appendChild(el('span', 'badge badge-done', 'TERMINÉ'));
    tr.appendChild(team);

    const prog = el('td', 'c-mid');
    prog.appendChild(questBadges(row.completed, meta.total_quests));
    tr.appendChild(prog);
    tr.appendChild(el('td', 'c-mid score-cell', String(row.score)));
    tr.appendChild(el('td', 'c-right dim', heure(row.last_submit_iso, row.last_submission)));
    const ip = el('td', 'c-right');
    ip.appendChild(cellIp(row.last_ip));
    tr.appendChild(ip);
    body.appendChild(tr);
  }
}

function renderNormal(rows) {
  const body = $('#normBody');
  body.textContent = '';
  if (!rows.length) {
    body.appendChild(emptyRow(5, 'Aucun étudiant inscrit.'));
    return;
  }
  for (const row of rows) {
    const tr = el('tr');
    const team = el('td');
    team.appendChild(el('span', 'team-cell', `> ${row.team}`));
    tr.appendChild(team);

    const badges = el('td', 'c-mid');
    badges.appendChild(questBadges(row.completed));
    badges.appendChild(el('span', 'progress-text', row.progress ?? ''));
    tr.appendChild(badges);

    const status = el('td', 'c-mid');
    status.appendChild(row.finished
      ? el('span', 'badge badge-done', 'ACHEVÉ ✅')
      : el('span', 'badge badge-run', 'EN COURS'));
    tr.appendChild(status);

    tr.appendChild(el('td', 'c-right dim', heure(row.last_submit_iso, row.last_submission)));
    const ip = el('td', 'c-right');
    ip.appendChild(cellIp(row.last_ip));
    tr.appendChild(ip);
    body.appendChild(tr);
  }
}

/**
 * Heure d'une action, affichée dans le fuseau du navigateur.
 *
 * Le serveur enregistre en UTC — c'est le bon choix pour la durée des
 * missions, qui se calcule en millisecondes. Mais afficher « 16:47 » sur une
 * horloge à 18:47 est déroutant pour l'enseignant : la salle ne parle pas UTC.
 *
 * `iso` est l'horodatage complet en UTC envoyé par le serveur. Sans lui, on
 * retombe sur la chaîne `last_submission` du cahier des charges, qui est
 * tronquée et donc déjà dans le mauvais fuseau — mieux vaut l'afficher que
 * de la masquer.
 */
function heure(iso, repli = '-') {
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString('fr-FR', { hour12: false });
    }
  }
  return repli && repli !== '-' ? repli : '—';
}

/**
 * Le poste du dernier appel, en IPv4 lisible.
 *
 * `::ffff:192.168.38.42` est la forme que renvoie le noyau pour une
 * connexion IPv4 ; on n'en garde que la partie utile. Les adresses loopback ne
 * servent à rien pour l'enseignant — tout le monde est sur 127.0.0.1 en local.
 */
function cellIp(ip) {
  if (!ip) return el('span', 'ip-cell dim', '—');
  const v4 = ip.replace(/^::ffff:/, '');
  const locale = /^(127\.|::1$|0\.0\.0\.0$)/.test(v4);
  const span = el('span', `ip-cell${locale ? ' dim' : ''}`, v4);
  span.title = 'Poste du dernier appel';
  return span;
}

/** Pastilles 1..N : remplies si validées. Rendue compacte au-delà de 20. */
function questBadges(completed = [], total = 0) {
  const box = el('span', 'qbadges');
  const list = completed.length ? completed : [];
  const n = Math.max(total, list.length, list.at(-1) ?? 0);
  for (let i = 1; i <= n; i++) {
    box.appendChild(el('i', `qdot${list.includes(i) ? ' on' : ''}`, String(i)));
  }
  return box;
}

const rankBadge = (rank, finished) =>
  `${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`}${finished ? ' ✅' : ''}`;

function emptyRow(span, text) {
  const tr = el('tr');
  const td = el('td', 'empty', text);
  td.colSpan = span;
  tr.appendChild(td);
  return tr;
}

function renderCurl(meta) {
  const host = location.host;
  $('#curlExamples').textContent =
`# 1. S'inscrire (mode compétitif, avec score et chrono)
curl -X POST http://${host}/api/register \\
  -H "Content-Type: application/json" \\
  -d '{"team": "CyberPhoenix", "mode": "competitive"}'

# 2. S'inscrire (mode normal, sans pression)
curl -X POST http://${host}/api/register \\
  -H "Content-Type: application/json" \\
  -d '{"team": "Alice_Bob", "mode": "normal"}'

# 3. Valider une mission : le token reçu à l'inscription sers d'authentification
curl -X POST http://${host}/api/submit \\
  -H "Content-Type: application/json" \\
  -H "X-Arena-Token: dq_..." \\
  -d '{"flag": "FLAG{HELLO_DOCKER_ENGINE_RUNNING}"}'

# 4. Voir le classement en direct
curl http://${host}/api/overview`;
}

/* ═══════════════════════════════════════════════════ vue : inscription */

function showGate() {
  $('#gate').hidden = false;
  $('#play').hidden = true;
}

function showPlay() {
  $('#gate').hidden = true;
  $('#play').hidden = false;
}

document.querySelectorAll('.mode').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    const labels = { competitive: '⚡ Compétitif', normal: '🧘 Normal' };
    $('#gateModeLabel').textContent = labels[state.mode];
    $('#gateForm').hidden = false;
    $('#gSecret').hidden = state.mode !== 'competitive';
    $('#gTeam').focus();
    $('#gateMsg').textContent = '';
  });
});

$('#changeMode').addEventListener('click', () => {
  $('#gateForm').hidden = true;
  $('#gateMsg').textContent = '';
});

$('#gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const team = $('#gTeam').value.trim();
  const secret = $('#gSecret').value.trim();
  const msg = $('#gateMsg');
  msg.textContent = '';
  msg.className = 'reg-msg';

  try {
    const res = await api('/api/register', {
      method: 'POST',
      auth: false,
      body: secret ? { team, mode: state.mode, secret } : { team, mode: state.mode },
    });
    store.write({ token: res.token, team: res.team, mode: res.mode });
    state.token = res.token;
    toast(res.message, res.status === 'created' ? 'ok' : 'info');
    await bootPlayer();
  } catch (err) {
    msg.textContent = `❌ ${err.message}`;
    msg.className = 'reg-msg reg-err';
  }
});

/* ═════════════════════════════════════════════════════ vue : le parcours */

async function bootPlayer() {
  // Le jeton peut ne pas être en mémoire si l'on arrive ici par un changement
  // de hash plutôt que par une nouvelle connexion : on le relit.
  state.token ??= store.read()?.token ?? null;
  showPlay();
  state.pack = await api('/api/quests');
  state.me = await api('/api/me');

  $('#teamName').textContent = state.me.team;
  const competitive = state.me.mode === 'competitive';
  $('#modeChip').textContent = competitive ? '⚡ Compétitif' : '🧘 Normal';
  $('#modeChip').className = `chip ${competitive ? 'chip-amber' : 'chip-emerald'}`;
  // Heure d'inscription : utile en fin de séance pour vérifier d'un coup
  // d'œil que l'équipe a bien été enregistrée avant de commencer.
  $('#sinceTag').textContent = state.me.registered_at
    ? `inscrit à ${state.me.registered_at}`
    : '';
  renderToken();

  $('#statScore').hidden = !competitive;
  $('#statRank').hidden = !competitive;

  renderHeader();
  renderMap();
  renderCurrent();
  await loadCommands();
}

function renderHeader() {
  const { me } = state;
  const competitive = me.mode === 'competitive';
  if (competitive) {
    $('#scoreVal').textContent = me.score ?? 0;
    $('#rankVal').textContent = me.rank ? `#${me.rank}` : '—';
  }
  $('#progressVal').textContent = me.progress;

  renderHistory();

  // Rail de progression : une case par quête.
  const rail = $('#rail');
  rail.textContent = '';
  const done = new Set(state.pack.completed);
  const flat = state.pack.modules.flatMap((m) => m.quests);
  flat.forEach((q) => {
    const seg = el('i', `rail-seg${done.has(q.id) ? ' on' : ''}${q.number === flat.find((x) => !done.has(x.id))?.number ? ' next' : ''}`);
    seg.title = `${q.number}. ${q.title}`;
    rail.appendChild(seg);
  });
}

/**
 * Historique du joueur : une ligne par mission validée, avec le détail du
 * score en mode compétitif.
 *
 * En mode normal, `time_display` arrive à `null` depuis le serveur — le temps
 * n'existe pas dans ce mode. On n'affiche alors rien plutôt que « — », pour
 * ne pas suggérer une information qui n'a pas été calculée.
 */
function renderHistory() {
  const box = $('#historyBox');
  if (!box) return;
  const { me } = state;
  box.textContent = '';

  const competitive = me.mode === 'competitive';
  box.appendChild(el('h3', 'history-title',
    competitive ? '📊 Tes résultats' : '📋 Tes missions validées'));

  if (!me.history.length) {
    box.appendChild(el('p', 'dim', 'Aucune mission validée pour l\'instant.'));
    return;
  }

  const list = el('div', 'history-list');
  for (const h of me.history) {
    const quest = state.pack.modules.flatMap((m) => m.quests).find((q) => q.id === h.quest_id);
    const row = el('div', 'history-row');

    row.appendChild(el('span', 'h-num', String(h.quest_number)));
    row.appendChild(el('span', 'h-title', quest?.title ?? h.quest_id));

    if (competitive) {
      row.appendChild(el('span', 'h-time', `⏱ ${h.time_display ?? '—'}`));
      const total = h.points + (h.speed_bonus ?? 0);
      row.appendChild(el('span', 'h-pts', `${total} pts`));
    } else {
      row.appendChild(el('span', 'h-pts h-plain', 'validée ✅'));
    }
    list.appendChild(row);
  }
  box.appendChild(list);

  if (competitive) {
    const foot = el('div', 'history-foot');
    const erreurs = me.history.reduce((a, h) => a + (h.wrong_flags ?? 0), 0);
    foot.appendChild(el('span', '', `Total : ${me.score} pts`));
    foot.appendChild(el('span', 'dim',
      erreurs ? `${erreurs} faux flag${erreurs > 1 ? 's' : ''}` : 'aucun faux flag'));
    box.appendChild(foot);
  }
}

function renderMap() {
  const map = $('#questMap');
  map.textContent = '';
  const done = new Set(state.pack.completed);
  const doneCount = done.size;

  const head = el('div', 'map-head');
  head.appendChild(el('h3', '', 'Programme'));
  head.appendChild(el('p', 'map-count', `${doneCount}/${state.pack.total_quests} · ${state.pack.total_points} pts`));
  map.appendChild(head);

  // Aucune mission n'est verrouillée : si le joueur est bloqué, il peut
  // consulter n'importe laquelle. Le bandeau garde malgré tout un rôle de
  //Fil conducteur, mais il ne parle plus d'obligation — il propose.
  const open = allQuests().filter((q) => !q.completed);
  if (open.length) {
    const next = open.find((q) => q.id === state.me.next_quest) ?? open[0];
    const box = el('div', 'map-next');
    box.appendChild(el('span', 'map-next-k', open.length === 1 ? 'Dernière mission' : 'Par où continuer'));
    box.appendChild(el('span', 'map-next-t', next.title));
    box.appendChild(el('span', 'map-next-p', `${next.points} pts`));
    const go = el('button', 'btn btn-primary btn-sm', 'Ouvrir →');
    go.type = 'button';
    go.addEventListener('click', () => openQuest(next.id));
    box.appendChild(go);
    map.appendChild(box);
  }

  for (const m of state.pack.modules) {
    const modPoints = m.quests.reduce((a, q) => a + q.points, 0);
    const box = el('div', 'map-mod');

    const title = el('button', 'map-mod-head');
    title.type = 'button';
    title.appendChild(el('span', 'mod-ico', m.icon));
    title.appendChild(el('span', 'mod-title', m.title));
    title.appendChild(el('span', 'mod-pts', `${modPoints} pts`));
    box.appendChild(title);

    const list = el('ul', 'mod-quests');
    for (const q of m.quests) {
      const li = el('li');
      const btn = el('button', `qitem${q.completed ? ' done' : ''}${q.locked ? ' locked' : ''}${state.current === q.id ? ' active' : ''}`);
      btn.type = 'button';
      btn.disabled = q.locked && !q.completed;
      btn.appendChild(el('span', 'qnum', String(q.number)));
      btn.appendChild(el('span', 'qname', q.title));
      if (q.completed) btn.appendChild(el('span', 'qok', '✅'));
      else if (q.locked) btn.appendChild(el('span', 'qlock', '🔒'));
      else btn.appendChild(el('span', 'qpts', `${q.points} pts`));
      btn.addEventListener('click', () => openQuest(q.id));
      li.appendChild(btn);
      list.appendChild(li);
    }
    box.appendChild(list);
    map.appendChild(box);
  }
}

/**
 * Le jeton, toujours affiché et copiable en un clic.
 *
 * doit pas avoir à aller le chercher dans un bloc de code — ni le retaper dans
 * une commande `curl`. Un clic le met dans le presse-papiers.
 */
function renderToken() {
  const chip = $('#tokenChip');
  if (!chip || !state.token) return;
  const court = `${state.token.slice(0, 9)}…`;
  chip.textContent = `🔑 ${court}`;
  chip.title = 'Copier mon jeton d\'API';

  // On écoute une seule fois : le bouton est persistant, contrairement au
  // contenu de la mission qui est reconstruit à chaque affichage.
  if (chip.dataset.wired) return;
  chip.dataset.wired = '1';

  chip.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.token);
      chip.classList.add('ok');
      chip.textContent = '🔑 copié ✓';
      setTimeout(() => {
        chip.classList.remove('ok');
        chip.textContent = `🔑 ${state.token.slice(0, 9)}…`;
      }, 1400);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé) : on montre en clair.
      chip.classList.add('ok');
      chip.textContent = `🔑 ${state.token}`;
    }
  });
}

function allQuests() {
  return state.pack.modules.flatMap((m) => m.quests);
}

function renderCurrent() {
  const quests = allQuests();
  const next = quests.find((q) => !q.completed);
  const target = state.current && quests.find((q) => q.id === state.current);
  openQuest((target ?? next ?? quests.at(-1)).id, false);
}

function openQuest(id, rerenderMap = true) {
  const quests = allQuests();
  const q = quests.find((x) => x.id === id);
  if (!q) return;

  const isDone = state.pack.completed.includes(id);
  // Verrouillage d'affichage : actif seulement si l'enseignant a demandé une
  // progression linéaire (ARENA_LINEAR=1). Par défaut on laisse lire et
  // valider dans n'importe quel ordre — c'est le moyen de ne pas rester
  // bloqué. Le serveur accepte la validation dans les deux cas.
  if (q.locked && !isDone) {
    toast('Mission verrouillée : termine d\'abord la précédente.', 'warn');
    return;
  }
  state.current = id;

  const panel = $('#questPanel');
  panel.textContent = '';

  // ── en-tête
  const head = el('div', 'quest-head');
  const line = el('div', 'quest-head-top');
  line.appendChild(el('span', 'quest-mod', `${q.number} · ${state.pack.modules.find((m) => m.module === q.number || m.quests.some((x) => x.id === q.id))?.title ?? ''}`));
  line.appendChild(el('h2', '', q.title));
  const tags = el('div', 'quest-tags');
  tags.appendChild(el('span', `tag ${q.flagship ? 'tag-flagship' : 'tag-pts'}`, `${q.points} pts`));
  tags.appendChild(el('span', 'tag', `⏱ ~${q.est_minutes} min`));
  tags.appendChild(el('span', 'tag tag-done', isDone ? '✅ Validée' : '⏳ En cours'));
  line.appendChild(tags);
  head.appendChild(line);
  panel.appendChild(head);

  // ── objectifs
  if (q.teaches?.length) {
    const teach = el('div', 'teaches');
    teach.appendChild(el('span', 'teaches-k', 'Tu vas apprendre'));
    for (const t of q.teaches) teach.appendChild(el('span', 'teach', t));
    panel.appendChild(teach);
  }

  // ── énoncé
  const brief = el('div', 'brief');
  brief.appendChild(renderMarkdown(q.brief));
  panel.appendChild(brief);

  // ── indice / point de contrôle
  const aid = el('div', 'aid');
  const hintBtn = el('button', 'btn btn-ghost btn-sm', '💡 Afficher un indice');
  hintBtn.type = 'button';
  const hintBox = el('div', 'hint-box');
  let hintIdx = 0;
  hintBtn.addEventListener('click', () => {
    if (hintIdx >= q.hints.length) {
      hintBox.textContent = '';
      hintBox.appendChild(el('p', 'dim', 'Plus aucun indice. Relis la mission et réessaie.'));
      hintBtn.disabled = true;
      return;
    }
    const h = q.hints[hintIdx];
    const row = el('div', 'hint');
    row.appendChild(el('span', 'hint-n', `Indice ${hintIdx + 1}`));
    row.appendChild(renderMarkdown(h));
    hintBox.appendChild(row);
    hintIdx += 1;
    if (hintIdx >= q.hints.length) hintBtn.disabled = true;
  });
  aid.appendChild(hintBtn);
  aid.appendChild(hintBox);
  panel.appendChild(aid);

  if (q.checkpoint) {
    const cp = el('div', 'checkpoint');
    cp.appendChild(el('span', 'cp-k', '✓ Comment savoir que j\'ai réussi ?'));
    cp.appendChild(el('p', '', q.checkpoint));
    panel.appendChild(cp);
  }

  // ── soumission du flag
  panel.appendChild(buildSubmitBox(q));

  // Le récapitulatif de la validation vient d'être obtenu : on l'affiche sous
  // les indices, avant le formulaire (qui n'a plus rien à soumettre).
  if (state.lastSuccess?.quest_validated === q.number) {
    panel.appendChild(buildSuccess(state.lastSuccess));
    state.lastSuccess = null;
  }

  if (isDone && q.solution) panel.appendChild(buildSolution(q));

  if (isDone) {
    const next = state.me.next_quest
      ? allQuests().find((x) => x.id === state.me.next_quest)
      : null;
    const box = el('div', 'next-box');
    box.appendChild(el('p', '', next
      ? 'Mission validée. Quand tu es prêt·e pour la suivante :'
      : '🏁 Parcours terminé. Toutes les missions sont validées.'));
    if (next) {
      const go = el('button', 'btn btn-primary', `Mission suivante : ${next.title} →`);
      go.type = 'button';
      go.addEventListener('click', () => openQuest(next.id));
      box.appendChild(go);
    }
    panel.appendChild(box);
  }

  if (rerenderMap) renderMap();
  renderHeader();
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildSubmitBox(q) {
  const box = el('form', 'submit-box');

  // Mission déjà validée : plus rien à soumettre, on ne montre qu'un rappel.
  if (state.pack.completed.includes(q.id)) {
    box.appendChild(el('h3', 'submit-title', '✅ Mission déjà validée'));
    box.appendChild(el('p', 'submit-sub',
      'Tu peux la revoir autant de fois que tu veux. Le score ne compte qu\'une fois.'));
    return box;
  }

  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = box.querySelector('#flagInput');
    const out = box.querySelector('#submitMsg');
    const btn = box.querySelector('button[type=submit]');

    btn.disabled = true;
    btn.textContent = 'Validation…';
    out.textContent = '';
    out.className = 'submit-msg';

    try {
      const res = await api('/api/submit', { method: 'POST', body: { flag: input.value } });

      if (res.status === 'already_submitted') {
        out.className = 'submit-msg submit-warn';
        out.textContent = res.message;
      } else if (res.status === 'pending') {
        out.className = 'submit-msg submit-warn';
        out.textContent = res.message;
      } else {
        // On reste sur la mission validée (voir commentaire plus haut) et on
        // propose explicitement de passer à la suivante.
        state.lastSuccess = res;
        input.value = '';
        await refresh();
      }
    } catch (err) {
      out.className = 'submit-msg submit-err';
      out.textContent = `❌ ${err.message}`;
      input.focus();
      input.select();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Valider la mission';
    }
  });

  const title = el('h3', 'submit-title', `🏁 Valider la mission ${q.number}`);
  box.appendChild(title);
  box.appendChild(el('p', 'submit-sub',
    `Ton mot de passe pour « ${q.title} » n'est écrit nulle part : c'est le `
    + 'résultat de la manipulation ci-dessus. Il est différent pour chaque équipe.'));

  // Le mot de passe n'est pas connu du client : c'est le résultat du travail.
  // On montre la commande qui va le chercher, puis le champ où le coller.
  const hint = el('div', 'fetch-hint');
  hint.appendChild(el('span', 'fetch-hint-k', '1 · Va chercher ton mot de passe'));
  const hintCode = el('pre', 'fetch-hint-code');
  hintCode.appendChild(el('code', '', q.fetch_hint ?? '(commande indisponible)'));
  hint.appendChild(hintCode);

  // La commande fait plusieurs lignes : la recopier à la main depuis un
  // affichage_selection est le meilleur moyen de se tromper sur un caractère.
  const copyCmd = el('button', 'linkish copy-hint', '📋 copier la commande');
  copyCmd.type = 'button';
  copyCmd.addEventListener('click', async () => {
    await copie(q.fetch_hint ?? '');
    copyCmd.textContent = '📋 copiée ✓';
    setTimeout(() => { copyCmd.textContent = '📋 copier la commande'; }, 1400);
  });
  hint.appendChild(copyCmd);
  box.appendChild(hint);

  const row = el('div', 'submit-row');
  const champ = el('label', 'submit-field');
  champ.appendChild(el('span', 'submit-field-k', '2 · Colle-le ici'));
  const input = document.createElement('input');
  input.id = 'flagInput';
  input.type = 'text';
  input.placeholder = 'FLAG{…}';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.required = true;
  input.setAttribute('autocapitalize', 'characters');
  champ.appendChild(input);
  row.appendChild(champ);
  const btn = el('button', 'btn btn-primary', 'Valider la mission');
  btn.type = 'submit';
  row.appendChild(btn);
  box.appendChild(row);

  const out = el('div', 'submit-msg');
  out.id = 'submitMsg';
  box.appendChild(out);
  return box;
}

function buildSuccess(res) {
  const card = el('div', 'success');
  card.appendChild(el('div', 'success-head', `✅ ${res.message ?? 'Mission validée !'}`));

  if (res.breakdown) {
    const ul = el('ul', 'breakdown');
    const rows = [
      ['Points de base', res.breakdown.base, ''],
      ['🥇 Bonus de podium', res.breakdown.speed_bonus, 'bonus'],
      ['⚡ Bonus de rapidité', res.breakdown.pace_bonus, 'bonus'],
      ['Erreurs de flag', -res.breakdown.penalty, 'malus'],
    ];
    for (const [k, v, cls] of rows) {
      if (!v) continue;
      const li = el('li', cls);
      li.appendChild(el('span', '', k));
      li.appendChild(el('b', '', v > 0 ? `+${v}` : String(v)));
      ul.appendChild(li);
    }
    card.appendChild(ul);
    card.appendChild(el('div', 'success-total',
      `Total : ${res.points_earned} pts · Score cumulé ${res.score_total} pts`));
    if (res.rank) {
      card.appendChild(el('div', 'success-rank',
        `Tu es ${res.rank === 1 ? '🥇 1ᵉʳ' : `#${res.rank}`} au classement.`));
    }
  } else {
    card.appendChild(el('div', 'success-total',
      `Progression : ${res.completed_count} — mode normal, aucun score.`));
  }
  return card;
}

function showSuccess(res, out) {
  out.className = 'submit-msg submit-ok';
  out.appendChild(buildSuccess(res));
  toast(res.message ?? 'Mission validée !', 'ok');
}

function buildSolution(q) {
  const box = el('div', 'solution');
  const h = el('h3', '', '📖 Correction');
  box.appendChild(h);
  box.appendChild(renderMarkdown(q.solution || '*Non renseignée.*'));
  return box;
}

async function refresh() {
  state.pack = await api('/api/quests');
  state.me = await api('/api/me');
  $('#teamName').textContent = state.me.team;
  renderMap();
  renderHistory();
  renderCurrent();
}

async function loadCommands() {
  const box = $('#cmdBody');
  if (!box) return;
  box.textContent = '';
  try {
    const list = await api('/api/commands', { auth: false });
    for (const c of list) {
      const tr = el('tr');
      tr.appendChild(el('td', 'cmd-action', c.action));
      const td = el('td', 'cmd-code');
      // Le mémento contient des commandes `curl` avec un jeton : on y injecte
      // celui du joueur, pour qu'il n'ait rien à retaper.
      const cmd = state.token
        ? c.cmd.replaceAll('dq_...', state.token).replaceAll('<IP>', location.host)
        : c.cmd;
      const code = el('code', '', cmd);
      td.appendChild(code);
      const cp = el('button', 'linkish', 'copier');
      cp.type = 'button';
      cp.addEventListener('click', async () => {
        await copie(cmd);
        cp.textContent = '✓';
        setTimeout(() => { cp.textContent = 'copier'; }, 1200);
      });
      td.appendChild(cp);
      tr.appendChild(td);
      box.appendChild(tr);
    }
  } catch { /* le mémento est optionnel */ }
}

/* ══════════════════════════════════════════════════════════ chrome du jeu */

$('#btnHelp').addEventListener('click', () => $('#helpDlg').showModal());
$('#closeHelp').addEventListener('click', () => $('#helpDlg').close());

$('#btnQuit').addEventListener('click', () => {
  if (!confirm('Quitter le lab ? Ton token reste enregistré sur ce poste : tu pourras reprendre où tu en étais.')) return;
  location.hash = '#/';
  route();
});

/* ════════════════════════════════════════════ formulaire d'inscription express */

$('#regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const team = $('#inTeam').value.trim();
  const mode = $('#inMode').value;
  const msg = $('#regMsg');
  msg.textContent = '';
  msg.className = 'reg-msg';
  if (!team) {
    msg.textContent = '❌ Veuillez entrer un nom d\'équipe.';
    return;
  }
  try {
    const res = await api('/api/register', { method: 'POST', auth: false, body: { team, mode } });
    msg.textContent = res.status === 'created'
      ? `✅ ${res.message} Ton token : ${res.token}`
      : `ℹ️ ${res.message}`;
    $('#inTeam').value = '';
  } catch (err) {
    msg.textContent = `❌ ${err.message}`;
  }
});

/* ══════════════════════════════════════════════════════════════════ démarrage */

route();