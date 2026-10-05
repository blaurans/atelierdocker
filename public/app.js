/**
 * Atelier Docker — client.
 *
 * Une seule vue : le parcours de l'élève. La projection pour l'enseignant est
 * dans `/admin`, derrière un mot de passe — son tableau de classe ne peut pas
 * être public, et il était déjà mort ici depuis la fermeture de
 * `/api/overview`.
 *
 * Le token d'API est stocké dans localStorage : il identifie le joueur d'un
 * poste à l'autre sans mot de passe (voir README § Sécurité).
 */

import { renderMarkdown } from '/md.js';

// La clé a changé avec la V2 : un élève qui avait une session V1 enregistrée
// sous l'ancienne clé se voit demander de s'inscrire à nouveau. C'est
// volontaire — les deux portails ont des bases distinctes, et un jeton de la
// V1 n'y existe pas.
const STORE_KEY = 'atelier-docker:v2';

const state = {
  token: null,
  team: null,
  mode: null,
  pack: null,     // programme complet
  me: null,       // état du joueur
  current: null,  // id de la quête affichée
  source: null,   // EventSource
  retries: 0,     // échecs de connexion successifs (backoff)
  // Le bilan d'une validation, en attente d'affichage. Il doit survivre au
  // repeint du panneau : le message est écrit **avant** le repeint, et lu par
  // `paintQuest` au passage.
  lastSuccess: null,
  // Réponses de compréhension déjà données, par quête. C'est un **miroir de la
  // base**, pas l'état de vérité : il est réhydraté depuis
  // `GET /api/quests/:id/attempts` à chaque ouverture. Sans cela, un simple
  // rechargement de page effacerait l'historique des réponses et ferait
  // repasser l'élève pour une question à laquelle il avait déjà répondu juste.
  compr: {},
  // Indices déjà pris, par quête. Miroir de la base, comme `compr` : sans cela,
  // un élève qui recharge la page retombe sur « Demander un indice » alors
  // qu'il les a déjà pris tous.
  hints: {},
};

/** Ce que la base sait d'une quête : indices pris, indices payés. */
const etatHints = (id) => state.hints[id] ?? { hints_used: 0, hints_charged: 0 };

/*
 * Les libellés des deux modes ont disparu d'ici avec le portail : c'était la
 * seule chose qui les lisait, pour la colonne « Mode » du tableau de suivi. La
 * table de référence reste dans `src/config.js` et dans les deux cartes de choix
 * de mode de la page — là où un élève la lit.
 */

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
 * Une seule vue : le jeu.
 *
 * La V2 avait deux vues sur cette page — le portail enseignant et le jeu —
 * dispatchées sur le hash. Le portail est parti dans `/admin`, derrière le mot
 * de passe : ce qu'il montrait y est déjà, en mieux, et sa lecture ne peut pas
 * rester publique. Il était d'ailleurs à moitié mort — le tableau de classe
 * dépendait d'`/api/overview`, fermée au même moment, et la page d'accueil
 * affichait un toast d'erreur à quiconque la chargeait.
 *
 * Le hash reste accepté, sans rôle : `/#/` est l'adresse que l'enseignant
 * distribue depuis le début, et la faire marcher coûte moins cher que de
 * demander à vingt élèves de la changer.
 */
async function route() {
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
    const labels = { competitive: '⚡ Challenge', normal: '🧘 Sans stress' };
    $('#gateModeLabel').textContent = labels[state.mode];
    $('#gateForm').hidden = false;
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
    // Le ❌ est réservé aux échecs : un 409 est une reprise de session.
    msg.textContent = `${err.status === 409 ? '' : '❌ '}${err.message}`;
    msg.className = 'reg-msg reg-err';
    // Un 409 sur l'inscription n'est pas un échec : c'est la reprise d'une
    // session. Le dire change tout — en rouge, l'élève renonce et prend un
    // autre pseudo, ce qui lui fait perdre sa progression.
    //
    // On se fie au **code HTTP**, pas aux mots du message : la V1 testait
    // « déjà pris » contre une phrase, et le jour où le serveur a reformulé —
    // pour mieux dire — le test a cessé de jouer son rôle. Un code HTTP ne se
    // reformule pas.
    if (err.status === 409) {
      msg.className = 'reg-msg reg-warn';
      $('#gSecret').hidden = false;
      $('#gSecret').focus();
    }
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
  $('#modeChip').textContent = state.me.mode_label
    ?? (competitive ? '⚡ Challenge' : '🧘 Sans stress');
  $('#modeChip').className = `chip ${competitive ? 'chip-amber' : 'chip-emerald'}`;
  // Heure d'inscription : utile en fin de séance pour vérifier d'un coup
  // d'œil que le joueur a bien été enregistré avant de commencer.
  $('#sinceTag').textContent = state.me.registered_at
    ? `inscrit à ${state.me.registered_at}`
    : '';
  renderToken();

  renderHeader();
  renderMap();
  renderCurrent();
  await loadCommands();
}

/*
 * `renderValidationReport` est parti avec le portail. Il ne servait plus qu'aux
 * réponses qui ne valident rien — « quête déjà validée », « en attente » — et ces
 * deux messages sont écrits en place, dans le handler de soumission, qui sait de
 * quoi il parle.
 */

function renderHeader() {
  const { me } = state;
  $('#progressVal').textContent = me.progress;

  // Ni score ni rang : à la place, ce que l'élève a réellement fait — son
  // niveau et sa part de quêtes réussies sans indice. L'autonomie est le
  // signal le plus important : c'est le seul qui ne dépende que de lui.
  //
  // Ces deux valeurs sont ici, et pas dans `bootPlayer`, parce que c'est cette
  // fonction que `refresh()` appelle après chaque validation. Les mettre à
  // l'inscription seulement affichait un niveau figé pendant toute la séance —
  // l'élève validait une quête et son autonomie ne bougeait pas.
  const m = state.me.mastery ?? {};
  $('#levelVal').textContent = m.level?.name ?? '—';
  $('#autonomyVal').textContent = m.autonomy_ratio != null
    ? `${Math.round(m.autonomy_ratio * 100)} %`
    : '—';

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

  // Le titre ne dépend plus du mode : les deux modes affichent les mêmes
  // missions validées. Ce qui change, c'est la colonne de droite — le temps
  // en Challenge, le rappel de l'autonomie en Sans stress.
  box.appendChild(el('h3', 'history-title', '📋 Tes missions validées'));

  if (!me.history.length) {
    box.appendChild(el('p', 'dim', 'Aucune mission validée pour l\'instant.'));
    return;
  }

  const competitive = me.mode === 'competitive';
  const list = el('div', 'history-list');
  for (const h of me.history) {
    const quest = state.pack.modules.flatMap((m) => m.quests).find((q) => q.id === h.quest_id);
    const row = el('div', 'history-row');

    row.appendChild(el('span', 'h-num', String(h.quest_number)));
    row.appendChild(el('span', 'h-title', quest?.title ?? h.quest_id));

    if (competitive) {
      row.appendChild(el('span', 'h-time', `⏱ ${duree(h.time_ms)}`));
      // En Challenge, on dit ce que la validation a coûté — et c'est toujours
      // l'autonomie, jamais des points. Le score a disparu du jeu ; il ne doit
      // pas réapparaître dans un coin de l'écran sous forme de « undefined ».
      row.appendChild(el('span', 'h-pts h-plain', autonomieDe(h)));
    } else {
      row.appendChild(el('span', 'h-pts h-plain', 'validée ✅'));
    }
    list.appendChild(row);
  }
  box.appendChild(list);

  const foot = el('div', 'history-foot');
  const indices = me.history.reduce((a, h) => a + (h.hints_used ?? 0), 0);
  const juste = me.history.filter((h) => h.check_ok).length;
  // Le ratio d'autonomie vit sous `me.mastery`, pas à la racine : `/api/me` a
  // suivi le même mouvement que le reste de l'API, et lire `me.autonomy_ratio`
  // donnait `NaN %` en bas de l'historique.
  const autonomie = Math.round((me.mastery?.autonomy_ratio ?? 0) * 100);
  foot.appendChild(el('span', '',
    `${me.history.length} mission${me.history.length > 1 ? 's' : ''} · `
    + `${autonomie}% d'autonomie`));
  foot.appendChild(el('span', 'dim',
    indices ? `${indices} indice${indices > 1 ? 's' : ''} demandé${indices > 1 ? 's' : ''}`
            : 'sans aucun indice',
    ));
  foot.appendChild(el('span', 'dim',
    juste ? `${juste}/${me.history.length} comprises du premier coup` : ''));
  box.appendChild(foot);
}

/** Une durée en millisecondes, lisible. Le serveur envoie `time_ms`, pas une
 *  chaîne formatée : le formatage suit le fuseau du navigateur, donc il est
 *  fait ici. */
function duree(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
}

/** Une durée en minutes, dite en heures dès qu'elle dépasse 90 minutes. */
function dureeCourte(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  if (minutes < 90) return `${minutes} min`;
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h % 1 === 0 ? h : h.toFixed(1).replace('.', ',')} h`;
}

/** Rappel d'une seule mission : ce qu'elle a coûté, en une ligne. */
function autonomieDe(h) {
  const bits = [];
  if (h.hints_used) bits.push(`${h.hints_used} indice${h.hints_used > 1 ? 's' : ''}`);
  if (h.recall_ok === false) bits.push('réflexe à revoir');
  return bits.length ? bits.join(' · ') : 'autonome ✅';
}

function renderMap() {
  const map = $('#questMap');
  map.textContent = '';
  const done = new Set(state.pack.completed);
  const doneCount = done.size;

  const head = el('div', 'map-head');
  head.appendChild(el('h3', '', 'Programme'));
  // Le compteur porte la **durée**, pas des points : c'est la seule unité qui
  // dit quelque chose à l'élève. `total_points` n'existe plus dans l'API —
  // l'afficher produisait « undefined pts ».
  //
  // La durée totale est donnée en heures, pas en minutes : « 413 min » se lit
  // comme un défaut de conception, « ~7 h de travail » se lit comme ce que
  // c'est. Le détail est dans l'en-tête de chaque atelier.
  const minutes = allQuests().reduce((a, q) => a + (q.est_minutes ?? 0), 0);
  head.appendChild(el('p', 'map-count',
    `${doneCount}/${state.pack.total_quests} missions · ~${dureeCourte(minutes)}`));
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
    box.appendChild(el('span', 'map-next-p', `~${next.est_minutes} min`));
    const go = el('button', 'btn btn-primary btn-sm', 'Ouvrir →');
    go.type = 'button';
    go.addEventListener('click', () => openQuest(next.id));
    box.appendChild(go);
    map.appendChild(box);
  }

  for (const m of state.pack.modules) {
    const modDone = m.quests.filter((q) => q.completed).length;
    const box = el('div', 'map-mod');

    const title = el('button', 'map-mod-head');
    title.type = 'button';
    title.appendChild(el('span', 'mod-ico', m.icon));
    title.appendChild(el('span', 'mod-title', m.title));
    title.appendChild(el('span', 'mod-pts', `${modDone}/${m.quests.length}`));
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
      else btn.appendChild(el('span', 'qpts', `~${q.est_minutes} min`));
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
  return openQuest((target ?? next ?? quests.at(-1)).id);
}

function openQuest(id) {
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

  // L'état des réponses vient du serveur, pas de la mémoire de l'onglet. Le
  // rendu est donc asynchrone : on rend quand la requête revient, sinon
  // l'affichage qui suit écraserait ce qu'elle apporte. La promesse est
  // renvoyée pour que l'appelant puisse attendre un panneau peint.
  return hydrateCompr(q).then(() => paintQuest(q));
}

/**
 * Dessine le panneau de la quête courante.
 *
 * Séparé de `openQuest` parce que l'état des réponses de compréhension arrive
 * du serveur : on ne peut pas peindre avant de l'avoir. Un seul endroit dessine,
 * donc le rendu après un rechargement est le même que le rendu initial.
 */
function paintQuest(q) {
  const isDone = state.pack.completed.includes(q.id);

  const panel = $('#questPanel');
  panel.textContent = '';

  // ── en-tête
  const head = el('div', 'quest-head');
  const line = el('div', 'quest-head-top');
  line.appendChild(el('span', 'quest-mod', `${q.number} · ${state.pack.modules.find((m) => m.module === q.number || m.quests.some((x) => x.id === q.id))?.title ?? ''}`));
  line.appendChild(el('h2', '', q.title));
  const tags = el('div', 'quest-tags');
  // Plus de points : la star marque une quête « phare » (celle qui fait le
  // conceptclic), le nombre donne la durée. La classe `tag-pts` devient
  // `tag-star`.
  tags.appendChild(el('span', `tag ${q.flagship ? 'tag-flagship' : 'tag-star'}`, q.flagship ? '★ phare' : '★'));
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
  //
  // Les indices ne sont plus dans le payload : le serveur ne livre que
  // `hint_count`, et le texte sort par POST /api/quests/:id/hint. C'est ce qui
  // rend la facturation possible — un indice reçu d'avance ne peut pas être
  // facturé, puisque personne ne l'a demandé.
  //
  // Le coût est affiché avant le clic : un élève ne doit pas découvrir qu'il
  // a payé en regardant son score après coup.
  const aid = el('div', 'aid');
  const total = q.hint_count ?? 0;
  const hintBox = el('div', 'hint-box');
  let hintIdx = 0;

  if (total === 0) {
    aid.appendChild(el('p', 'dim', 'Pas d\'indice pour cette mission.'));
  }

  // L'élève a peut-être déjà pris des indices : on ne les redemande pas au
  // serveur, on ne les re-facture pas, et on ne lui affiche pas un bouton qui
  // promet un indice qu'il a déjà. On part de son état.
  const dejaPris = etatHints(q.id).hints_used;
  if (dejaPris > 0) {
    const reste = total - dejaPris;
    aid.appendChild(el('p', 'hint-recap',
      `${dejaPris} indice${dejaPris > 1 ? 's' : ''} déjà pris sur ${total}`
      + (reste > 0
        ? ` — il en reste ${reste}.`
        : ' — il n\'en reste plus, mais tu as tout ce qu\'il faut.')));
  }

  if (total > 0) {
    const hintBtn = el('button', 'btn btn-ghost btn-sm', '💡 Demander un indice');
    hintBtn.type = 'button';

    // Le bouton n'est **pas** désactivé au départ. Il l'était, « jusqu'à la
    // première réponse du serveur » — sauf que la première réponse du serveur
    // est celle que ce bouton déclenche. Il restait donc désactivé pour
    // toujours : un élève avait un bouton d'indice visible, inerte, et aucune
    // manière de le savoir. C'est le défaut « demande un indice pas dispo ».
    //
    // Un élève qui relit une mission a déjà pu prendre des indices : on part de
    // ce qu'il en reste, sinon on lui propose un bouton qui ne mènera nulle
    // part.
    if (dejaPris > 0) {
      hintBtn.textContent = '💡 Autre indice';
      hintBtn.appendChild(el('span', 'dim',
        ` (${total - dejaPris} restant${total - dejaPris > 1 ? 's' : ''})`));
    }
    if (dejaPris >= total) {
      hintBtn.textContent = 'Plus d\'indice';
      hintBtn.disabled = true;
    }

    hintBtn.addEventListener('click', async () => {
      // Désactivé **pendant** l'appel seulement. Un double-clic ferait perdre
      // deux indices, et le second ne serait pas un indice plus utile — d'où le
      // verrou, mais pas au départ.
      hintBtn.disabled = true;
      const lbl = el('span', 'dim', ' …');
      hintBtn.textContent = '💡 Chargement';
      hintBtn.appendChild(lbl);

      try {
        const r = await api(`/api/quests/${q.id}/hint`, { method: 'POST' });

        if (r.status === 'exhausted') {
          hintBox.appendChild(el('p', 'dim',
            'Plus aucun indice. Relis la mission, ou demande au professeur.'));
          return;
        }

        const row = el('div', 'hint');
        row.appendChild(el('span', 'hint-n', `Indice ${r.index + 1} / ${total}`));
        row.appendChild(renderMarkdown(r.hint));
        hintBox.appendChild(row);

        hintIdx = r.index + 1;
        state.hints[q.id] = {
          hints_used: r.index + 1,
          hints_charged: etatHints(q.id).hints_charged + (r.autonomy_lost > 0 ? 1 : 0),
        };
        if (r.autonomy_lost > 0) {
          hintBox.appendChild(el('p', 'hint-cost',
            `Cet indice ne compte pas pour ton autonomie.`
            + (r.free_next ? ' Le prochain sera gratuit.' : '')));
        } else if (r.already_taken) {
          hintBox.appendChild(el('p', 'dim', 'Tu avais déjà pris cet indice.'));
        } else if (r.free) {
          hintBox.appendChild(el('p', 'hint-free',
            'Mode Sans stress : tous les indices sont gratuits.'));
        } else {
          hintBox.appendChild(el('p', 'hint-free', 'Dernier indice : celui-ci est gratuit.'));
        }

        if (r.remaining > 0) {
          hintBtn.textContent = '💡 Autre indice';
          hintBtn.appendChild(el('span', 'dim',
            ` (${r.remaining} restant${r.remaining > 1 ? 's' : ''})`));
          hintBtn.disabled = false;
        } else {
          hintBtn.textContent = 'Plus d\'indice';
          hintBtn.disabled = true;
        }
      } catch (err) {
        hintBox.appendChild(el('p', 'err', err.message ?? 'Impossible de charger un indice.'));
        hintBtn.disabled = false;
      }
    });

    aid.appendChild(hintBtn);
  }

  aid.appendChild(hintBox);
  panel.appendChild(aid);

  if (q.checkpoint) {
    const cp = el('div', 'checkpoint');
    cp.appendChild(el('span', 'cp-k', '✓ Comment savoir que j\'ai réussi ?'));
    cp.appendChild(el('p', '', q.checkpoint));
    panel.appendChild(cp);
  }

  // ── compréhension vérifiée
  //
  // Les questions et le réflexe sont rendus **après** le point de contrôle et
  // **avant** le formulaire : c'est l'ordre dans lequel on les vit — on fait le
  // travail, on vérifie qu'on l'a compris, puis on valide.
  //
  // Les réponses déjà données sont relues au chargement, pour qu'un élève qui
  // revient sur une quête ne réponde pas deux fois à la même question.
  if (q.check?.length || q.recall) {
    panel.appendChild(buildComprehension(q));
  }

  // Le bilan d'une validation vient d'être obtenu : il va entre la
  // compréhension et le formulaire — c'est-à-dire à l'endroit exact où l'élève
  // vient de coller son mot de passe, et qui disparaît une fois la mission
  // validée. Un peu plus bas, le formulaire cède la place à « Mission déjà
  // validée ».
  if (state.lastSuccess?.quest_validated === q.number) {
    panel.appendChild(buildSuccess(state.lastSuccess));
    state.lastSuccess = null;
  }

  // ── soumission du flag
  panel.appendChild(buildSubmitBox(q));

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

  renderMap();
  renderHeader();
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Recharge depuis la base les réponses déjà données sur cette quête.
 *
 * La base est la source de vérité : l'onglet peut être rechargé, le serveur
 * redémarré, la réponse donnée la veille. `explanation` et `hint` ne sont pas
 * rejoués — ils ne sont renvoyés qu'au moment de la bonne réponse, pour ne pas
 * les exposer dans l'onglet réseau. Un élève qui recharge voit donc « ✓ Juste »
 * sans la justification : il l'a déjà lue.
 */
async function hydrateCompr(q) {
  const store = {};
  try {
    const r = await api(`/api/quests/${q.id}/attempts`);
    for (const a of r.attempts ?? []) {
      const key = `${a.kind}:${a.item_id}`;
      // La base ne stocke que des chaînes : on rend le type que la question
      // attend, sinon « true » (texte) ne serait jamais égal à `true` (booléen)
      // et une question Vrai/Faux déjà réussie apparaîtrait comme fausse.
      const item = a.kind === 'recall'
        ? q.recall
        : (q.check ?? []).find((c) => c.id === a.item_id);
      const answer = item?.kind === 'boolean' ? a.answer === 'true' : a.answer;
      store[key] = {
        correct: a.correct,
        attempts: a.attempts,
        answer: item?.kind === 'mcq' ? Number(a.answer) : answer,
      };
    }
    // Les indices vont dans le même miroir : le bouton doit dire « Plus
    // d'indice » après un rechargement, pas « Demander un indice ».
    state.hints[q.id] = {
      hints_used: r.hints_used ?? 0,
      hints_charged: r.hints_charged ?? 0,
    };
  } catch {
    // Réseau coupé ou joueur non identifié : l'élève voit des questions
    // neuves. C'est dégradé, pas cassé — et les réponses suivantes repartiront
    // bien dans la base.
    return;
  }
  state.compr[q.id] = store;
}

/**
 * Le bloc « as-tu compris ? » : questions à choix fermé et réflexe.
 *
 * La réponse ne bloque **jamais** la validation : c'est un choix pédagogique
 * (punir un élève qui a cherché le punit de chercher moins). Ce qui change, c'est
 * la colonne `check_ok` de la validation, donc la maîtrise « compréhension ».
 *
 * Chaque question garde son état : juste, faux avec l'aide, faux tout court. La
 * justification n'arrive qu'après une bonne réponse — l'envoyer d'abord
 * viderait la question de son intérêt.
 */
function buildComprehension(q) {
  const box = el('div', 'compr');
  box.appendChild(el('h3', 'compr-t', 'As-tu compris ?'));
  box.appendChild(el('p', 'compr-sub',
    'Réponds pour vérifier. Un indice ne te coûtera rien si tu te trompes.'));
  state.compr[q.id] = state.compr[q.id] ?? {};
  box.appendChild(buildQuestions(q));
  if (q.recall) box.appendChild(buildRecall(q));
  return box;
}

function buildQuestions(q) {
  const wrap = el('div', 'compr-qs');
  for (const c of q.check ?? []) {
    wrap.appendChild(oneQuestion(q, c));
  }
  return wrap;
}

function oneQuestion(q, c) {
  const deja = state.compr[q.id][`check:${c.id}`] ?? null;
  const box = el('div', `qcm${c.required ? '' : ' qcm-opt'}`);

  box.appendChild(el('p', 'qcm-p',
    (c.required ? '' : 'Facultatif — ') + c.prompt));

  if (c.kind === 'boolean') {
    const form = el('div', 'qcm-choices');
    for (const [val, label] of [[true, 'Vrai'], [false, 'Faux']]) {
      const b = el('button', 'qcm-choice');
      b.type = 'button';
      b.textContent = label;
      b.disabled = deja?.correct === true;
      if (deja?.correct === true && deja.answer === val) b.className = 'qcm-choice ok';
      b.addEventListener('click', () => answerQuestion(q, c, val, box, form));
      form.appendChild(b);
    }
    box.appendChild(form);
    box.appendChild(feedback(q, c, deja));
    return box;
  }

  const form = el('div', 'qcm-choices');
  c.choices.forEach((label, i) => {
    const b = el('button', 'qcm-choice');
    b.type = 'button';
    b.textContent = label;
    b.disabled = deja?.correct === true;
    if (deja?.correct === true && Number(deja.answer) === i) b.className = 'qcm-choice ok';
    b.addEventListener('click', () => answerQuestion(q, c, i, box, form));
    form.appendChild(b);
  });
  box.appendChild(form);
  box.appendChild(feedback(q, c, deja));
  return box;
}

/** Affiche l'état d'une question : juste, faux, ou le rappel des essais. */
function feedback(q, c, deja) {
  const out = el('div', 'qcm-fb');
  if (!deja) {
    out.appendChild(el('p', 'dim', 'Aucune réponse pour l\'instant.'));
    return out;
  }
  if (deja.correct) {
    out.appendChild(el('p', 'ok', '✓ Juste.'));
  } else {
    out.appendChild(el('p', 'err',
      `Faux, ${deja.attempts} essai${deja.attempts > 1 ? 's' : ''}.`
      + ' Réessaie — ça ne te coûte rien.'));
  }
  if (deja.explanation) out.appendChild(el('p', 'why', deja.explanation));
  return out;
}

/**
 * Envoie une réponse et recharge la question avec le retour du serveur.
 *
 * On recharge la question entière plutôt que de la modifier sur place : c'est la
 * seule façon d'être sûr que l'affichage reflète la réponse du serveur. Un
 * client qui décide seul « c'est juste » n'aurait aucun intérêt.
 */
async function answerQuestion(q, c, answer, box, form) {
  for (const b of form.children) b.disabled = true;
  try {
    const r = await api(`/api/quests/${q.id}/check`, {
      method: 'POST',
      body: { id: c.id, answer },
    });
    state.compr[q.id][`check:${c.id}`] = {
      correct: r.correct, attempts: r.attempts, answer, explanation: r.explanation,
    };
  } catch (err) {
    state.compr[q.id][`check:${c.id}`] = {
      correct: false, attempts: 1, answer, explanation: null, erreur: err.message,
    };
  }
  box.replaceWith(oneQuestion(q, c));
}

function buildRecall(q) {
  const r = q.recall;
  const deja = state.compr[q.id][`recall:${r.id}`] ?? null;
  const box = el('div', 'qcm qcm-recall');
  box.appendChild(el('p', 'qcm-p', `Réflexe — ${r.prompt}`));

  const form = el('div', 'recall-form');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'recall-input';
  input.placeholder = 'Ta réponse, en un mot';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const send = el('button', 'btn btn-sm btn-primary', 'Vérifier');
  send.type = 'button';
  send.disabled = deja?.correct === true;
  if (deja?.correct) input.value = deja.answer;

  const run = async () => {
    if (!input.value.trim()) return;
    send.disabled = true;
    try {
      const res = await api(`/api/quests/${q.id}/recall`, {
        method: 'POST',
        body: { answer: input.value },
      });
      state.compr[q.id][`recall:${r.id}`] = {
        correct: res.correct, attempts: res.attempts,
        answer: input.value, hint: res.hint,
      };
    } catch (err) {
      state.compr[q.id][`recall:${r.id}`] = {
        correct: false, attempts: 1, answer: input.value, erreur: err.message,
      };
    }
    box.replaceWith(buildRecall(q));
  };

  send.addEventListener('click', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  if (deja?.correct) input.disabled = true;

  form.appendChild(input);
  form.appendChild(send);
  box.appendChild(form);

  if (deja?.correct) {
    box.appendChild(el('p', 'ok', `✓ Juste — ${deja.attempts} essai${deja.attempts > 1 ? 's' : ''}.`));
  } else if (deja) {
    box.appendChild(el('p', 'err',
      `Pas encore — ${deja.attempts} essai${deja.attempts > 1 ? 's' : ''}.`));
    if (deja.hint) box.appendChild(el('p', 'why', deja.hint));
  }
  return box;
}

function buildSubmitBox(q) {
  const box = el('form', 'submit-box');

  // Mission déjà validée : plus rien à soumettre, on ne montre qu'un rappel.
  if (state.pack.completed.includes(q.id)) {
    box.appendChild(el('h3', 'submit-title', '✅ Mission déjà validée'));
    box.appendChild(el('p', 'submit-sub',
      'Tu peux la revoir et la relire autant de fois que tu veux : '
      + 'elle ne compte qu\'une fois, ni pour ta progression ni pour ton autonomie.'));
    return box;
  }

  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = box.querySelector('#flagInput');
    const out = box.querySelector('.submit-msg');
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
        input.value = '';
        // Le bilan est mis en attente **avant** le repeint, pas écrit dedans.
        //
        // Écrire dans `#submitMsg` ne peut pas fonctionner : pour une quête
        // validée, le formulaire est remplacé par un encart « Mission déjà
        // validée », qui n'a pas de champ de message. Le bilan partait donc dans
        // le vide, et l'élève validait une mission sans rien voir se passer.
        //
        // On reste sur la mission validée : c'est là qu'on relit son bilan.
        state.lastSuccess = res;
        await refresh();
        toast(res.message ?? 'Mission validée !', 'ok');
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
    + 'résultat de la manipulation ci-dessus. Il est différent pour chaque joueur.'));

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
  box.appendChild(out);
  return box;
}

/**
 * La carte de confirmation d'une validation.
 *
 * Ce que cette quête a rapporté, formulé qualitativement. Le serveur ne renvoie
 * ni `breakdown` ni `points_earned` : l'affichage de la V1 calculait
 * `Total : undefined pts`, parce qu'il lisait des champs que l'API ne fournit
 * plus. On affiche ce qui existe réellement.
 */
function buildSuccess(res) {
  const card = el('div', 'success');
  card.appendChild(el('div', 'success-head', `✅ ${res.message ?? 'Mission validée !'}`));
  card.appendChild(el('div', 'success-count', res.completed_count));

  // Le message du serveur dit déjà ce que la quête a coûté — « avec 1 indice,
  // elle compte pour ton autonomie », ou « réussie seule ». Le répéter ici
  // produisait la même phrase deux fois de suite. Cette ligne n'apporte que ce
  // que le message ne dit pas : la compréhension.
  //
  // Les noms de champs viennent de `questResult()` dans src/progress.js :
  // `autonomous`, `hints_used`, `check_ok`, `check_total`, `understood`.
  const r = res.quest_result ?? {};
  const bits = [];
  if (r.understood) {
    bits.push(r.check_total
      ? `comprise du premier coup (${r.check_total} question${r.check_total > 1 ? 's' : ''})`
      : 'comprise');
  } else {
    bits.push('⚠️ compréhension à revoir — la quête compte pour ta progression, '
      + 'pas pour ta compréhension');
  }
  card.appendChild(el('p', 'success-total', bits.join(' · ')));

  // La maîtrise, lisible : trois ratios, pas un total. Un élève qui valide sa
  // 3ᵉ quête n'a pas « 300 points » — il a fait 3 quêtes sur 27, il a su faire
  // seul, il a compris.
  const m = res.mastery;
  if (m) {
    const ul = el('ul', 'breakdown');
    for (const [k, val, cls] of [
      ['Progression', m.progress_ratio, ''],
      ['Autonomie', m.autonomy_ratio, m.autonomy_ratio >= 0.6 ? 'bonus' : 'malus'],
      ['Compréhension', m.comprehension_ratio, m.comprehension_ratio >= 0.6 ? 'bonus' : 'malus'],
    ]) {
      const li = el('li', cls);
      li.appendChild(el('span', '', k));
      li.appendChild(el('b', '', pct(val)));
      ul.appendChild(li);
    }
    card.appendChild(ul);
    card.appendChild(el('div', 'success-rank', `Niveau : ${m.level.name}`));
  }

  if (res.time_display) card.appendChild(el('div', 'success-time', `⏱ ${res.time_display}`));

  // Pas de bouton « mission suivante » ici : l'encart juste en dessous, sous le
  // formulaire remplacé, s'en charge — et il reste en place quand l'élève
  // revient relire la mission. Deux boutons pour la même chose, c'est un de
  // trop.
  //
  // Ce que la confirmation ajoute, c'est la phrase qui manquait : cette mission
  // est terminée, et voici ce qu'elle a rapporté. Un test humain a signalé « la
  // fin de la quête 1 valide la quête 2 et la quête 1 reste ouverte » — rien ne
  // disait que c'était fini.
  return card;
}

const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;

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
  renderHeader();
  renderMap();
  renderHistory();
  // `renderCurrent` est attendu : le panneau de la mission est repeint, et
  // l'appelant doit pouvoir écrire dans ce panneau **après**. Sans cela, le
  // message de confirmation partait dans un nœud détaché — il n'apparaissait
  // nulle part, et un élève validant une mission ne voyait rien se passer.
  await renderCurrent();
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

/* ═════════════════════════════════════════ l'inscription express a migré */

/*
 * Le formulaire d'inscription rapide n'est plus ici : il est dans `/admin`,
 * avec le reste des gestes d'enseignant.
 *
 * Il ne dépendait d'aucune donnée protégée — `POST /api/register` est public —
 * mais c'était un raccourci pour inscrire une classe entière en tapant les
 * pseudos, et un raccourci d'enseignant n'a rien à faire sur une page publique.
 * Le champ secret est venu avec lui : sur cette page d'accueil, « inscription
 * rapide » était le chemin le moins protégé — aucun secret, donc un pseudo
 * public pour tous ceux qui prenaient le raccourci.
 */

/* ══════════════════════════════════════════════════════════════════ démarrage */

route();