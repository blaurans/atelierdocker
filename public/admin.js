/**
 * L'écran d'administration.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne gère aucun mot de passe. Le champ de saisie ne fait qu'un `POST
 * /api/admin/session` ; c'est le serveur qui compare, et qui pose un cookie
 * `HttpOnly` — inaccessible en JavaScript. Si ce fichier pouvait s'authentifier
 * seul, il suffirait d'une faille XSS ici pour prendre le contrôle du portail.
 *
 * ## Ce qu'il fait
 *
 * Trois choses, et c'est tout : la classe, la remise à zéro, la validation en
 * attente. Le reste — la progression, les ratios, le niveau — vient de
 * l'API, qui est la seule à savoir les calculer.
 */
const $ = (sel) => document.querySelector(sel);
/**
 * Un élément, avec une garde-fou.
 *
 * Passer un nœud en troisième argument produirait `[object HTMLSpanElement]`
 * dans la cellule — c'est arrivé, et c'est ce que le garde-fou rend impossible.
 * Un nœud s'ajoute avec `appendChild`, qui est explicite.
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
const esc = (s) => String(s ?? '');
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let source = null;          // EventSource du flux live
let filtre = '';
let dernier = null;         // dernier payload reçu, pour le rendu

/* ------------------------------------------------------------------ api */

/**
 * Un appel d'administration.
 *
 * Le cookie part tout seul : il est `HttpOnly`, donc `fetch` l'envoie sans que
 * cette page le voie. Aucune clé n'est donc manipulée ici, et c'est voulu.
 */
async function api(chemin, { methode = 'GET', corps } = {}) {
  const r = await fetch(chemin, {
    method: methode,
    headers: corps === undefined ? {} : { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
  return data;
}

/* ----------------------------------------------------------------- gate */

$('#gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const msg = $('#gateMsg');
  btn.disabled = true;
  btn.textContent = 'Vérification…';
  msg.textContent = '';
  msg.className = 'admin-msg';
  try {
    await api('/api/admin/session', { methode: 'POST', corps: { password: $('#mdp').value } });
    // On vide le champ immédiatement : le mot de passe n'a plus à rester dans
    // le DOM, même le temps d'un rechargement.
    $('#mdp').value = '';
    await demarrer();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'admin-msg admin-msg-err';
    $('#mdp').select();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ouvrir la session';
  }
});

$('#btnQuitter').addEventListener('click', async () => {
  try { await api('/api/admin/session', { methode: 'DELETE' }); } catch { /* tant pis */ }
  arreterFlux();
  $('#admin').hidden = true;
  $('#gate').hidden = false;
  $('#mdp').focus();
});

$('#btnRafraichir').addEventListener('click', () => charger());
$('#search').addEventListener('input', (e) => {
  filtre = e.target.value.trim().toLowerCase();
  rendreJoueurs();
});

/* -------------------------------------------------------------- démarrage */

async function demarrer() {
  $('#gate').hidden = true;
  $('#admin').hidden = false;
  await charger();
  lancerFlux();
}

async function charger() {
  try {
    const [ov, stats] = await Promise.all([
      api('/api/overview'),
      api('/api/stats'),
    ]);
    dernier = { ov, stats };
    rendreStats(stats);
    rendreJoueurs();
    rendreAttentes(stats.pending ?? []);
    rendreBloquees(stats.quests?.bloquees ?? []);
    rendreJournal(stats.recent_events ?? []);
    rendreCurl();
    $('#sessionInfo').textContent =
      `${stats.players} joueur${stats.players > 1 ? 's' : ''} · `
      + `${stats.completions} validation${stats.completions > 1 ? 's' : ''} · `
      + `session ouverte pour ${stats.classroom ? 'la journée' : 'la séance'}`;
  } catch (err) {
    // Un 401 ici signifie que la session a expiré pendant que la page était
    // ouverte. C'est le moment de redemander le mot de passe, pas d'afficher
    // une erreur et de laisser un écran vide.
    if (/401|fermé/i.test(err.message)) {
      arreterFlux();
      $('#admin').hidden = true;
      $('#gate').hidden = false;
      const msg = $('#gateMsg');
      msg.textContent = 'Session expirée. Reprends le mot de passe.';
      msg.className = 'admin-msg admin-msg-warn';
      return;
    }
    toast(err.message, 'err');
  }
}

/* ----------------------------------------------------------------- flux */

function lancerFlux() {
  arreterFlux();
  source = new EventSource('/api/live');
  const dot = $('#liveDot');
  const label = $('#liveLabel');
  source.addEventListener('overview', (e) => {
    dernier.ov = JSON.parse(e.data);
    rendreJoueurs();
    dot.classList.remove('off', 'pending');
    dot.classList.add('on');
    label.textContent = 'en direct';
    dot.dataset.state = 'on';
  });
  source.onerror = () => {
    dot.classList.add('pending');
    dot.classList.remove('on', 'off');
    label.textContent = 'reconnexion…';
    dot.dataset.state = 'retry';
  };
  source.onopen = () => {
    dot.classList.remove('off', 'pending');
    dot.classList.add('on');
    label.textContent = 'en direct';
    dot.dataset.state = 'on';
  };
}

function arreterFlux() {
  if (source) { source.close(); source = null; }
}

/* ---------------------------------------------------------------- rendu */

function rendreStats(s) {
  const box = $('#stats');
  box.textContent = '';
  const c = s.classroom ?? {};
  const encart = (k, v, sub) => {
    const d = el('div', 'cohort-card');
    d.appendChild(el('div', 'cohort-v', v));
    d.appendChild(el('div', 'cohort-k', k));
    if (sub) d.appendChild(el('div', 'cohort-s', sub));
    return d;
  };
  box.appendChild(encart('Inscrits', String(s.players ?? 0),
    `${s.by_mode?.competitive ?? 0} Challenge · ${s.by_mode?.normal ?? 0} Sans stress`));
  box.appendChild(encart('Avancement moyen', String(c.moyenne_quetes ?? 0),
    `sur ${s.quests?.total ?? 27} quêtes`));
  box.appendChild(encart('Autonomie moyenne', `${Math.round((c.autonomie_moyenne ?? 0) * 100)} %`,
    `${c.indices_demandes ?? 0} indice(s) demandé(s)`));
  box.appendChild(encart('Compris du premier coup', String(c.autonomes_sur_8 ?? 0),
    `élèves autonomes à 75 % ou plus`));
  const pire = c.atelier_le_plus_consomme;
  if (pire) {
    box.appendChild(encart('Atelier le plus consommé', `Atelier ${pire.module}`,
      `${pire.hints} indice(s) demandé(s)`));
  }
}

function rendreJoueurs() {
  const body = $('#playersBody');
  body.textContent = '';
  const tous = dernier?.ov?.players ?? [];
  const vus = tous.filter((p) => !filtre || p.team.toLowerCase().includes(filtre));
  $('#playersCount').textContent = filtre
    ? `${vus.length} sur ${tous.length}`
    : `${tous.length} joueur${tous.length > 1 ? 's' : ''}`;

  if (!vus.length) {
    const tr = el('tr');
    const td = el('td', 'empty', tous.length
      ? 'Aucun joueur ne correspond à ce filtre.'
      : 'Aucun inscrit. Les élèves rejoignent la session depuis le portail.');
    td.colSpan = 9;
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }

  for (const p of vus) {
    const tr = el('tr');
    const qui = el('td');
    qui.appendChild(el('span', 'team-cell', `> ${p.team}`));
    if (p.finished) qui.appendChild(el('span', 'badge badge-done', 'ACHEVÉ ✅'));
    tr.appendChild(qui);

    const mode = el('td', 'c-mid');
    mode.appendChild(el('span', `badge ${p.mode === 'competitive' ? 'badge-run' : 'badge-done'}`,
      p.mode === 'competitive' ? 'Challenge' : 'Sans stress'));
    tr.appendChild(mode);

    const prog = el('td', 'c-mid');
    prog.appendChild(el('span', 'progress-text', p.progress ?? '—'));
    tr.appendChild(prog);

    const auto = el('td', 'c-mid ratio-cell');
    auto.appendChild(ratio(p.autonomy_ratio));
    tr.appendChild(auto);

    const compr = el('td', 'c-mid ratio-cell');
    compr.appendChild(ratio(p.comprehension_ratio));
    tr.appendChild(compr);

    const niveau = el('td', 'c-mid');
    niveau.appendChild(el('span', 'badge', p.level_name ?? p.level ?? '—'));
    tr.appendChild(niveau);
    tr.appendChild(el('td', 'c-mid dim', String(p.hints_used ?? 0)));
    tr.appendChild(el('td', 'c-right dim', p.last_ip ?? '—'));

    const actions = el('td', 'c-right');
    actions.appendChild(bouton('↺', `Remettre ${p.team} à zéro`, () => remettre(p)));
    actions.appendChild(bouton('⇄', `Passer ${p.team} en ${p.mode === 'competitive' ? 'Sans stress' : 'Challenge'}`,
      () => changerMode(p)));
    actions.appendChild(bouton('✕', `Supprimer ${p.team}`, () => supprimer(p), 'btn-danger'));
    tr.appendChild(actions);

    body.appendChild(tr);
  }
}

function bouton(glyphe, titre, onClick, classe = 'btn-ghost') {
  const b = el('button', `btn btn-sm ${classe}`, glyphe);
  b.type = 'button';
  b.title = titre;
  b.setAttribute('aria-label', titre);
  b.addEventListener('click', onClick);
  return b;
}

function ratio(v) {
  const n = Math.round((v ?? 0) * 100);
  const box = el('span', 'ratio');
  const bar = el('span', 'ratio-bar');
  bar.style.width = `${n}%`;
  bar.dataset.level = n >= 60 ? 'ok' : n >= 30 ? 'mid' : 'low';
  box.appendChild(bar);
  box.appendChild(el('span', 'ratio-n', `${n}%`));
  return box;
}

function rendreAttentes(liste) {
  const panel = $('#pendingPanel');
  const body = $('#pendingBody');
  body.textContent = '';
  panel.hidden = liste.length === 0;
  for (const p of liste) {
    const tr = el('tr');
    tr.appendChild(el('td', '', p.team));
    tr.appendChild(el('td', 'c-mid', `n°${p.quest_number ?? '?'}`));
    tr.appendChild(el('td', 'c-right dim', (p.completed_at ?? '').slice(11, 19)));
    const td = el('td', 'c-right');
    td.appendChild(bouton('✓', `Valider ${p.team}`, () => attester(p)));
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

function rendreBloquees(liste) {
  const box = $('#stuckList');
  box.textContent = '';
  if (!liste.length) {
    box.appendChild(el('li', 'dim', 'Personne n\'est bloqué : ou personne n\'a validé de quête.'));
    return;
  }
  for (const q of liste) {
    const li = el('li');
    li.appendChild(el('span', 'stuck-n', String(q.number)));
    li.appendChild(el('span', 'stuck-t', q.title));
    li.appendChild(el('span', 'stuck-c', `${q.bloques} élève${q.bloques > 1 ? 's' : ''} bloqué${q.bloques > 1 ? 's' : ''}`
      + ` · ${q.resolues} à l'avoir passée`));
    box.appendChild(li);
  }
}

function rendreJournal(liste) {
  const box = $('#eventLog');
  box.textContent = '';
  if (!liste.length) {
    box.appendChild(el('li', 'dim', 'Rien pour l\'instant.'));
    return;
  }
  for (const e of liste) {
    const li = el('li', e.kind === 'admin-refused' ? 'log-warn' : '');
    li.appendChild(el('span', 'log-at', (e.at ?? '').slice(11, 19)));
    li.appendChild(el('span', 'log-k', e.kind));
    li.appendChild(el('span', 'log-d', e.detail ?? ''));
    box.appendChild(li);
  }
}

/* -------------------------------------------------------------- actions */

/**
 * Chaque action destructrice demande confirmation, en nommant le joueur.
 *
 * Pas une `window.confirm` : elle dit « OK ? » sans dire sur quoi, et un
 * pseudo de six caractères passe inaperçu. On écrit la phrase complète.
 */
function confirmer(phrase) {
  return new Promise((ok) => {
    const boite = el('div', 'confirm-box');
    const texte = el('p', '', phrase);
    const oui = el('button', 'btn btn-danger', 'Oui, le faire');
    const non = el('button', 'btn btn-ghost', 'Annuler');
    for (const b of [oui, non]) b.type = 'button';
    const fermer = (v) => { boite.remove(); ok(v); };
    oui.addEventListener('click', () => fermer(true));
    non.addEventListener('click', () => fermer(false));
    boite.append(texte, oui, non);
    document.body.appendChild(boite);
    const sur = (ev) => {
      if (ev.key === 'Escape') { document.removeEventListener('keydown', sur); fermer(false); }
    };
    document.addEventListener('keydown', sur);
    non.focus();
  });
}

async function remettre(p) {
  if (!await confirmer(`Remettre ${p.team} à zéro ? Ses ${p.done ?? 0} quête(s) validée(s), ses indices et son journal seront effacés. Il repart de zéro.`)) return;
  await agir(`/api/admin/reset/${encodeURIComponent(p.team)}`, 'POST', { confirm: 'oui' });
}

async function changerMode(p) {
  const vers = p.mode === 'competitive' ? 'normal' : 'competitive';
  const nom = vers === 'competitive' ? 'Challenge' : 'Sans stress';
  if (!await confirmer(`Passer ${p.team} en ${nom} ? Son parcours repart de zéro : une quête validée dans l'autre mode a été validée sous une règle d'autonomie différente.`)) return;
  await agir(`/api/admin/mode/${encodeURIComponent(p.team)}`, 'POST', { mode: vers });
}

async function supprimer(p) {
  if (!await confirmer(`Supprimer définitivement ${p.team} ? Tout ce que cet élève a fait disparaît, et son mot de passe avec. C'est irréversible.`)) return;
  await agir(`/api/admin/delete/${encodeURIComponent(p.team)}`, 'POST');
}

async function attester(p) {
  await agir(`/api/admin/attest/${encodeURIComponent(p.team)}/${encodeURIComponent(p.quest_id)}`, 'POST');
}

async function agir(chemin, methode, corps) {
  try {
    const r = await api(chemin, { methode, corps });
    toast(r.message ?? 'Fait.', 'ok');
    await charger();
  } catch (err) {
    toast(err.message, 'err');
  }
}

/* ------------------------------------------------------------------ divers */

function rendreCurl() {
  $('#curlBox').textContent = [
    '# Le mot de passe est lu depuis le .env du serveur.',
    '# `$MDP` : export ATELIER_ADMIN_KEY=$(grep ATELIER_ADMIN_KEY /app/atelierdocker/.env | cut -d= -f2-)',
    '',
    '# La classe, avec les IP des postes',
    'curl -H "X-Arena-Admin: $MDP" \\',
    '  https://atelierdocker.laurans.org/api/overview',
    '',
    '# Les indicateurs de séance',
    'curl -H "X-Arena-Admin: $MDP" \\',
    '  https://atelierdocker.laurans.org/api/stats',
    '',
    '# Remettre un joueur à zéro — {"confirm":"oui"} est obligatoire',
    'curl -X POST -H "X-Arena-Admin: $MDP" -H "Content-Type: application/json" \\',
    "  -d '{\"confirm\":\"oui\"}' \\",
    '  https://atelierdocker.laurans.org/api/admin/reset/MonPseudo',
    '',
    '# Supprimer une inscription',
    'curl -X POST -H "X-Arena-Admin: $MDP" \\',
    '  https://atelierdocker.laurans.org/api/admin/delete/MonPseudo',
  ].join('\n');
}

function toast(texte, genre = 'ok') {
  const t = el('div', `toast toast-${genre}`, texte);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

/* ------------------------------------------------------------- amorçage */

const etat = await api('/api/admin/session').catch(() => ({ authenticated: false }));
if (etat.authenticated) await demarrer();
else $('#mdp').focus();
