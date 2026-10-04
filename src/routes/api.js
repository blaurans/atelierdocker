import express from 'express';
import { db } from '../db.js';
import { config, isMode, MODE_LABELS } from '../config.js';
import { HttpError, requirePlayer, identify } from '../auth.js';
import { __plafonds as plafonds, clientIp } from '../ratelimit.js';
import { quests, reloadQuestpack } from '../questpack.js';
import { mastery, cohort } from '../mastery.js';
import { announce } from '../portal.js';
import { submitQuest, attest, announceAfter } from '../progress.js';
import { secretFor } from '../secret.js';
import {
  createPlayer, findByTeam, setMode, setSecret, deletePlayer, resetPlayer,
  doneOf, logEvent, allEvents, counts,
} from '../repo/arena.js';

export const api = express.Router();

const TEAM_RE = /^[\p{L}\p{N} ._-]{2,32}$/u;

// Plafonds de débit. Voir src/ratelimit.js : le portail est ouvert sur le
// réseau de la classe, un script de studied ne doit pas pouvoir noyer la base.
api.use(plafonds.api);

export const modeLabel = (m) => MODE_LABELS[m] ?? m;

const normalizeFlag = (raw) => String(raw ?? '').trim().toUpperCase();

/**
 * Nombre de quêtes par module, pour le détail de maîtrise.
 *
 * Calculé à partir du contenu plutôt que compté en base : un atelier dont on
 * aurait retiré une quête doit disparaître du dénominateur tout de suite.
 */
const moduleTotals = (pack) => {
  const out = {};
  for (const m of pack.modules) out[m.module] = m.quests.length;
  return out;
};

/**
 * Nombre de tentatives par quête, pour l'historique.
 *
 * Un décompte, pas le détail des réponses : l'enseignant voit « il a cherché
 * 4 fois » sans que l'élève relise devant tout le monde ce qu'il avait
 * répondu de faux.
 */
const masteryPerQuest = (playerId) => {
  const rows = db.prepare(
    `SELECT quest_id,
            SUM(CASE WHEN kind = 'check'  THEN attempts ELSE 0 END) AS check_attempts,
            SUM(CASE WHEN kind = 'recall' THEN attempts ELSE 0 END) AS recall_attempts
       FROM attempts WHERE player_id = ? GROUP BY quest_id`
  ).all(playerId);

  return new Map(rows.map((r) => [r.quest_id, {
    check_attempts: r.check_attempts ?? 0,
    recall_attempts: r.recall_attempts ?? 0,
  }]));
};

/**
 * Maîtrise d'un joueur, pour `/api/me`.
 *
 * Le module vient du contenu (`pack.byId`), pas d'une colonne en base : le
 * numéro de module est une propriété de la quête, et le recopier dans
 * `completions` créerait une seconde source de vérité à désynchroniser dès
 * qu'un contenu est réorganisé.
 */
const masteryOf = (playerId, pack) => {
  const rows = db.prepare(
    `SELECT * FROM completions WHERE player_id = ? AND status = 'done'`
  ).all(playerId);

  return mastery({
    completions: rows.map((c) => ({ ...c, module: pack.byId.get(c.quest_id)?.module ?? 0 })),
    totalQuests: pack.totalQuests,
    byModule: moduleTotals(pack),
  });
};

/**
 * L'origine sous laquelle l'élève a réellement joint le portail.
 *
 * C'est important derrière un reverse proxy TLS. Le portail écoute en HTTP
 * sur 8000 à l'intérieur du conteneur, mais l'élève voit `https://` dans sa
 * barre d'adresse et doit taper des commandes qui partent en clair si on
 * reconstruit l'URL depuis l'intérieur : le paquet ne sort pas du réseau du
 * lab, et sur un réseau d'établissement c'est une fuite de ses mots de passe.
 *
 * `req.protocol` ne renvoie `https` que si Express fait confiance à
 * X-Forwarded-Proto — d'où TRUST_PROXY=1 côté compose.
 *
 * On s'appuie sur `req.hostname`, qui — comme `req.host`, déprécié en
 * Express 5 — retire le port. C'est sans importance en production : le
 * portail n'est joignable que par Caddy, en 443, donc l'origine reconstruite
 * est la bonne. En revanche un accès direct au conteneur sur un port non
 * standard produirait une commande visant le port 80. Ce cas n'existe que
 * pour un portage local, où le portail est en `http` de toute façon.
 */
const origin = (req) => `${req.protocol}://${req.hostname}`;

/**
 * Rend un texte du contenu jouable sur la machine de l'élève.
 *
 * Trois substitutions, dans cet ordre, et **partout** — pas seulement dans
 * `fetch_hint`.
 *
 * L'oubli de `brief` a été trouvé par un test humain, pas par un test
 * automatique : le brief contient la commande de récupération du mot de passe
 * (« Ton mot de passe »), avec le littéral `dq_xxxxxxxxxxxxxxxx`. Un élève qui
 * copie la commande de l'énoncé obtient `401 Unauthorized`, sans rien
 * comprendre. Le portail, lui, affichait la bonne commande juste en dessous —
 * deux versions de la même chose dans la même page, dont une cassée.
 *
 * `$ARENA_TOKEN` est remplacé pour la même raison : la commande du brief
 * s'appuie sur la variable exportée juste avant, et un élève qui ne copie que
 * la ligne `docker run` — la seule qui l'intéresse — se retrouve avec un jeton
 * vide. Une commande doit fonctionner quand on la copie seule.
 *
 * Le jeton ne part jamais dans un texte qui ne le porte pas déjà : on remplace
 * un littéral, on n'en injecte pas un nouveau.
 */
const jouable = (req, player) => (texte) => {
  if (!texte) return texte;
  let out = texte
    .replaceAll('https://SERVER_IP', origin(req))
    .replaceAll('http://SERVER_IP', origin(req));
  if (player?.token) {
    out = out
      .replaceAll('dq_xxxxxxxxxxxxxxxx', player.token)
      .replaceAll('$ARENA_TOKEN', player.token);
  }
  return out;
};

/* ------------------------------------------------------------------ secrets */

/**
 * Sert le mot de passe d'une mission.
 *
 * C'est la seule source des mots de passe : ils n'apparaissent dans aucun
 * énoncé. L'étudiant doit aller le chercher avec une vraie commande Docker,
 * et la réponse n'est adressable qu'à lui (jeton requis).
 */
api.get('/secret/:questId', secretRoute(false));

/** Même chose en texte brut : c'est ce que récupère la commande du conteneur. */
api.get('/secret/:questId/raw', secretRoute(true));

/**
 * Sert le mot de passe d'une mission.
 *
 * C'est la seule source des mots de passe : ils n'apparaissent dans aucun
 * énoncé. L'étudiant doit aller le chercher avec une vraie commande Docker.
 *
 * Authentification : en-tête `X-Arena-Token` **ou** paramètre `?t=`. Le
 * second est indispensable — la commande est exécutée dans un conteneur, qui
 * n'a pas d'en-tête à envoyer. Et comme le mot de passe est unique par joueur,
 * il faut pouvoir dire « le mien ».
 */
function secretRoute(raw) {
  return (req, res, next) => {
    try {
      const player = identify(req);
      if (!player) {
        throw new HttpError(401,
          'Secret inaccessible : il faut ton jeton (X-Arena-Token ou ?t=…).');
      }
      const pack = quests();
      const quest = pack.byId.get(req.params.questId);
      if (!quest) throw new HttpError(404, 'Mission inconnue.');

      if (raw) {
        return res.type('text/plain; charset=utf-8')
          .send(`${secretFor(player, quest)}\n`);
      }
      res.json({
        quest_id: quest.id,
        quest_number: quest.number,
        title: quest.title,
        secret: secretFor(player, quest),
      });
    } catch (e) { next(e); }
  };
}

/* ------------------------------------------------------------------ register */

api.post('/register', plafonds.register, (req, res, next) => {
  try {
    const team = String(req.body?.team ?? '').trim();
    const mode = String(req.body?.mode ?? '').trim().toLowerCase();
    const secret = String(req.body?.secret ?? '').trim();

    if (!team) throw new HttpError(400, 'Le pseudo est obligatoire.');
    if (!TEAM_RE.test(team)) {
      throw new HttpError(400, 'Pseudo invalide : 2 à 32 caractères (lettres, chiffres, espace, point, tiret, tiret bas).');
    }
    if (!isMode(mode)) throw new HttpError(400, 'Mode invalide : « competitive » ou « normal ».');

    const existing = findByTeam(team);
    if (existing) {
      if (existing.secret && existing.secret !== secret) {
        // Le message dit ce qu'on peut faire, et dans quel ordre. « Ressaisis
        // le secret » seul suffisait tant que le champ était visible partout ;
        // il ne l'était qu'en Challenge, alors qu'un élève Sans stress se
        // trouvait coincé avec une consigne impossible.
        throw new HttpError(409,
          `Le pseudo « ${team} » est protégé par un secret. `
          + 'Reprends ta session : retape le même pseudo et le même secret, '
          + 'et tu retrouveras ta progression. '
          + 'Si tu ne t\'en souviens plus, prends un autre pseudo — celui-ci '
          + 'restera verrouillé.');
      }
      if (secret && !existing.secret) setSecret(existing.id, secret);
      logEvent(existing.id, 'rejoin', existing.mode);
      return res.status(200).json({
        status: 'exists',
        team: existing.team,
        mode: existing.mode,
        token: existing.token,
        message: `Pseudo « ${existing.team} » déjà enregistré en mode `
          + `${modeLabel(existing.mode)} — on reprend ta progression là où tu `
          + 'en étais.',
      });
    }

    const player = createPlayer({ team, mode, secret, ip: clientIp(req) });
    logEvent(player.id, 'register', mode);
    announce(`register:${player.team}`);

    res.status(201).json({
      status: 'created',
      team: player.team,
      mode: player.mode,
      token: player.token,
      message: player.mode === 'competitive'
        ? "Bienvenue dans l'Arena ! Le chrono est armé."
        : "Bienvenue ! Aucun chrono ici, prends ton temps.",
    });
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------- quests */

/**
 * Numéro de la première mission non validée : celle que le joueur est censé
 * attaquer ensuite. Sert au bandeau « à faire maintenant ».
 */
function nextQuestNumber(pack, done) {
  const first = pack.quests.find((q) => !done.has(q.id));
  return first?.number ?? pack.totalQuests;
}

api.get('/quests', plafonds.quests, (req, res, next) => {
  try {
    const pack = quests();
    const player = identify(req);
    const done = new Set(player ? doneOf(player.id).map((c) => c.quest_id) : []);
    const playable = nextQuestNumber(pack, done);
    // Progression stricte désactivée par défaut : tout est accessible.
    const linear = config.linearProgression;

    // Une seule fonction pour rendre tout texte jouable, appliquée au brief
    // comme à la commande de récupération. Voir `jouable()`.
    const t0 = jouable(req, player);

    res.json({
      total_quests: pack.totalQuests,
      total_points: pack.totalPoints,
      mode: player?.mode ?? null,
      completed: [...done],
      linear_progression: linear,
      modules: pack.modules.map((m) => ({
        module: m.module,
        title: m.title,
        tagline: m.tagline,
        icon: m.icon,
        quests: m.quests.map((q) => ({
          id: q.id,
          number: q.number,
          title: q.title,
          points: q.points,
          flagship: q.flagship,
          est_minutes: q.estMinutes,
          teaches: q.teaches,
          // Le point de contrôle et l'énoncé contiennent la commande de
          // récupération du mot de passe, avec son littéral de jeton. Sans la
          // substitution, l'élève copie une commande morte et reçoit un 401 —
          // voir `jouable()`.
          checkpoint: t0(q.checkpoint),
          brief: t0(q.brief),
          // Le flag n'est PAS transmis : il se récupère par /api/secret et
          // n'existe pas dans le contenu. Le champ reste dans la base pour
          // l'anti-doublon, mais il ne sort jamais d'ici.
          //
          // Les indices ne sont pas transmis non plus, et c'est une règle
          // (CONTRACTS § 1.5) : la réponse ne porte que le nombre, le texte
          // sort par POST /api/quests/:id/hint, qui enregistre la consommation.
          // Si `hints` réapparaît ici, la facturation cesse d'exister — l'élève
          // lit les trois dans l'onglet réseau. `hints_count` plus bas.
          hint_count: q.hint_count,
          // Ce que coûte chaque indice, pour que le client affiche le prix
          // AVANT le clic. Sans ça, l'élève découvre qu'il a payé en
          // regardant son score après coup — et le mode Challenge devient une
          // surprise, ce qui est exactement ce qu'on ne veut pas.
          charge: q.charge,
          // Les questions de compréhension et le réflexe : le contenu est
          // public, seule la réponse est vérifiée côté serveur. Le `answer` de
          // chaque question n'est pas transmis — voir `POST .../check`.
          // Les questions et le réflexe, **sans les réponses**. `check` et `recall`
          // portent un champ `answer` / `accept` ; les envoyer ici les
          // giveawayait dans l'onglet réseau, et la vérification ne
          // mesurerait plus rien. On les reconstruit donc champ par champ —
          // c'est le prix à payer pour ne pas dépendre d'un `...q` forget.
          check: q.check.map((c) => ({
            id: c.id,
            kind: c.kind,
            prompt: c.prompt,
            ...(c.kind === 'mcq' ? { choices: c.choices } : {}),
            required: c.required,
          })),
          recall: q.recall
            ? { id: q.recall.id, prompt: q.recall.prompt }
            : null,
          // La commande de récupération, prête à coller. Voir `origin()` plus
          // haut pour pourquoi c'est l'origine complète plutôt que le seul
          // hôte. Le préfixe est remplacé en entier, « https://SERVER_IP »
          // comme « http://SERVER_IP », parce que le contenu est la source de
          // vérité et porte déjà « https:// » : substituer une origine entière
          // à un protocole seul produirait « https://https://… ». Le jeton du
          // joueur remplace le littéral : sans lui, aucun conteneur ne peut rien
          // récupérer.
          fetch_hint: q.fetchHint && player ? t0(q.fetchHint) : null,
          // La correction n'est envoyée qu'une fois la mission validée : le
          // client ne doit pas pouvoir la lire avant, même depuis l'onglet
          // réseau du navigateur.
          // La correction est elle aussi rendue jouable : elle rappelle souvent
          // la commande du mot de passe, et un littéral de jeton dans la
          // correction d'une quête validée donnait un 401 à l'élève qui
          // voulait vérifier son propre travail.
          solution: done.has(q.id) ? t0(q.solution) : null,
          // Par défaut aucune mission n'est verrouillée : un étudiant
          // bloqué doit pouvoir consulter n'importe quelle autre mission.
          // Le mode linéaire, s'il est activé, garde la mission validée
          // relisible et n'ouvre que la suivante.
          locked: linear && player ? q.number > playable && !done.has(q.id) : false,
          completed: done.has(q.id),
        })),
      })),
    });
  } catch (e) { next(e); }
});

/* ----------------------------------------------------------------------- me */

api.get('/me', requirePlayer, (req, res, next) => {
  try {
    const p = req.player;
    const pack = quests();
    const done = doneOf(p.id);
    const doneIds = new Set(done.map((c) => c.quest_id));

    const m = masteryOf(p.id, pack);
    const perQuest = masteryPerQuest(p.id);

    res.json({
      team: p.team,
      mode: p.mode,
      mode_label: modeLabel(p.mode),
      mastery: m,
      total_quests: pack.totalQuests,
      progress: `${doneIds.size}/${pack.totalQuests}`,
      completed_percent: Math.round((doneIds.size / pack.totalQuests) * 100),
      finished: !!p.finished_at,
      registered_at: p.registered_at,
      last_submission: p.last_submit,
      next_quest: pack.quests.find((q) => !doneIds.has(q.id))?.id ?? null,
      history: done.map((c) => {
        const q = pack.byId.get(c.quest_id);
        const flags = perQuest.get(c.quest_id) ?? { check_attempts: 0, recall_attempts: 0 };
        return {
          quest_id: c.quest_id,
          quest_number: c.quest_number,
          title: q?.title ?? null,
          // Le détail par quête : c'est ce qui permet à l'élève de relire son
          // parcours et de voir *quelles* quêtes lui ont coûté un indice,
          // plutôt qu'un total qu'il ne pourrait pas situer.
          hints_used: c.hints_used ?? 0,
          // Payés, pas demandés : en Sans stress l'élève a pu demander des
          // indices sans en payer, et son autonomie est intacte.
          hints_charged: c.hints_charged ?? 0,
          autonomous: (c.hints_charged ?? c.hints_used ?? 0) === 0,
          check_ok: c.check_ok === 1,
          recall_ok: c.recall_ok === 1,
          // `pending` = flag correct mais attente de validation par
          // l'enseignant. Distingué de `done` parce que la quête n'est pas
          // encore acquise : la compter dans la maîtrise serait faux.
          status: c.status,
          wrong_flags: c.wrong_flags,
          time_ms: c.time_ms,
          at: c.completed_at,
          check_attempts: flags.check_attempts,
          recall_attempts: flags.recall_attempts,
        };
      }),
    });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------- submit */

api.post('/submit', plafonds.submit, (req, res, next) => {
  try {
    const flag = normalizeFlag(req.body?.flag);
    const player = identify(req);
    if (!player) {
      throw new HttpError(404, 'Pseudo non enregistré. Inscris-toi d\'abord via /api/register.');
    }

    // Le mot de passe n'est plus stocké dans le contenu : on le compare au
    // secret que le serveur dérive pour CE joueur et CETTE mission. Impossible
    // donc de valider en recopiant un flag lu ailleurs, et chaque joueur a le
    // sien.
    const pack = quests();
    const quest = pack.quests.find((q) => secretFor(player, q) === flag);
    if (!quest) {
      logEvent(player.id, 'bad_flag', flag.slice(0, 60));
      throw new HttpError(400,
        'Mot de passe invalide. Va le chercher avec la commande indiquée dans '
        + 'la mission — il n\'est écrit nulle part dans l\'énoncé.');
    }

    const previous = doneOf(player.id);

    if (previous.some((c) => c.quest_id === quest.id)) {
      return res.json({
        status: 'already_submitted',
        mode: player.mode,
        quest_validated: quest.number,
        quest_title: quest.title,
        completed_count: `${previous.length}/${pack.totalQuests}`,
        finished: !!player.finished_at,
        message: `Quête ${quest.number} déjà validée précédemment.`,
      });
    }

    const outcome = submitQuest({
      player,
      quest,
      requireAttestation: config.requireAttestation,
    });

    announceAfter(player.id);

    if (outcome.status === 'pending') {
      return res.json({
        status: 'pending',
        mode: player.mode,
        quest_validated: quest.number,
        quest_title: quest.title,
        completed_count: `${previous.length}/${pack.totalQuests}`,
        finished: false,
        // Message clé : l'élève doit savoir que son mot de passe est bon et
        // que c'est l'enseignant qui bloque. Sans cette phrase, il croit avoir
        // échoué et il recommence la quête.
        message: "Mot de passe correct. En attente de la validation de l'enseignant.",
      });
    }

    const doneIds = new Set([...previous.map((c) => c.quest_id), quest.id]);
    const next = pack.quests.find((q) => !doneIds.has(q.id)) ?? null;
    const m = masteryOf(player.id, pack);

    res.json({
      status: 'success',
      mode: player.mode,
      quest_validated: quest.number,
      quest_title: quest.title,
      mastery: m,
      // Ce que cette quête a rapporté à la maîtrise, formulé qualitativement.
      // Un élève se moque d'un « 25 points » quand les points ne veulent rien
      // dire ; il ne se moque pas de « cette quête ne compte pas pour ton
      // autonomie ».
      quest_result: outcome.result,
      completed_count: `${doneIds.size}/${pack.totalQuests}`,
      finished: doneIds.size === pack.totalQuests,
      unlocked_next: next?.id ?? null,
      time_display: formatMs(outcome.timeMs),
      message: buildMessage({ player, quest, outcome, doneIds, pack }),
    });
  } catch (e) { next(e); }
});

function formatMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
}

/**
 * Le mot de retour après une validation.
 *
 * Les deux modes ont le même texte, volontairement. La différence de pression
 * ne se joue pas dans le congratulation — elle se joue dans ce que la quête
 * leur a coûté en autonomie, et dans le temps affiché juste au-dessus. Un
 * élève en mode Sans stress qui lit « bravo, 40 points » comprend qu'il joue
 * encore le jeu de la V1.
 */
function buildMessage({ player, quest, outcome, doneIds, pack }) {
  const r = outcome.result ?? {};
  const bits = [`Quête ${quest.number} validée`];

  if (!r.autonomous) {
    bits.push(`avec ${r.hints_used} indice${r.hints_used > 1 ? 's' : ''} `
      + '— elle compte pour ta progression, pas pour ton autonomie');
  } else if (r.hints_used) {
    // Élève Sans stress qui a demandé de l'aide sans la payer. Dire « sans
    // indice » serait exact et trompeur : il en a demandé un, il le voit sur
    // l'écran. La formulation dit ce qui s'est réellement passé.
    bits.push(`avec ${r.hints_used} indice${r.hints_used > 1 ? 's' : ''}, `
      + 'gratuit en mode Sans stress — elle compte pour ton autonomie');
  } else {
    bits.push('sans indice — elle compte pour ton autonomie');
  }

  if (doneIds.size === pack.totalQuests) {
    return `${bits.join(', ')}. Parcours terminé.`;
  }
  return `${bits.join(', ')}. ${doneIds.size}/${pack.totalQuests} quêtes accomplies.`;
}

/* ---------------------------------------------------------------- overview */

/*
 * `GET /api/overview` et `GET /api/live` ne sont **plus** ici : ils sont montés
 * dans `src/routes/admin.js`, derrière le mot de passe.
 *
 * Ils listent tous les élèves, leur progression et leur adresse IP. C'est la
 * vue de l'enseignant. La laisser ouverte sur une URL publique revenait à
 * publier la liste de la classe et les IP des postes — à quiconque Bautait à
 * l'adresse. Un élève n'a jamais besoin de cette route ; l'administrateur,
 * oui.
 */

/**
 * Classement — route retirée en V2.
 *
 * Elle est supprimée, pas désactivée : il n'y a plus de classement à renvoyer,
 * et une route qui répond `{"mode":"competitive","leaderboard":undefined}`
 * ferait croire à un élève qui l'a encore en favori qu'il est premier. Un 404
 * est plus honnête qu'un silence.
 */

/* -------------------------------------------------------------------- stats */

/*
 * `GET /api/stats` n'est plus ici : elle est dans `src/routes/admin.js`, derrière
 * le mot de passe, et reconstruite sur `ov.players` — elle lisait
 * `ov.competitive` / `ov.normal`, champs supprimés avec le classement, et
 * levait une exception à chaque appel. Elle n'a jamais fonctionné.
 */

/* -------------------------------------------------------------------- admin */

/*
 * Tout ce qui suit est parti dans `src/routes/admin.js`, avec le reste de
 * l'administration. Ces routes partagent un mot de passe et un jeton de
 * session ; les laisser ici aurait signifié deux implémentations de la même
 * règle, donc deux endroits où l'oublier.
 */

/* ------------------------------------------------------------------ rappels */

api.get('/commands', (_req, res) => {
  res.json(COMMAND_SHEET);
});

/**
 * Mémento des commandes (section « Mémento des commandes clés » du cahier des
 * charges). Servi par l'API pour que la page d'aide n'ait pas de copie du
 * contenu à maintenir.
 */
const COMMAND_SHEET = [
  { action: 'Lancer un conteneur', cmd: 'docker run -d --name web -p 8080:80 nginx:alpine' },
  { action: 'Lister les conteneurs actifs', cmd: 'docker ps' },
  { action: 'Lister tous les conteneurs', cmd: 'docker ps -a' },
  { action: 'Exécuter une commande interne', cmd: 'docker exec -it <nom> sh' },
  { action: 'Lire les journaux', cmd: 'docker logs -f <nom>' },
  { action: "Copier un fichier vers un conteneur", cmd: 'docker cp <src> <nom>:<dst>' },
  { action: 'Construire une image', cmd: 'docker build -t monimage:1.0 .' },
  { action: 'Voir les couches d\'une image', cmd: 'docker history <image>' },
  { action: 'Créer un volume nommé', cmd: 'docker volume create mesdonnees' },
  { action: 'Monter un volume', cmd: 'docker run --rm -v mesdonnees:/data alpine ls /data' },
  { action: 'Créer un réseau', cmd: 'docker network create monreseau' },
  { action: 'Voir les ports publiés', cmd: 'docker port <nom>' },
  { action: 'Arrêter / supprimer', cmd: 'docker stop <nom> && docker rm <nom>' },
  { action: 'Nettoyer les ressources inutilisées', cmd: 'docker system prune -f' },
  { action: 'Démarrer la pile Compose', cmd: 'docker compose up -d' },
  { action: 'État de la pile Compose', cmd: 'docker compose ps' },
  { action: 'Arrêter la pile Compose', cmd: 'docker compose down' },
  { action: "S'inscrire (compétitif)", cmd: `curl -X POST https://atelierdocker.laurans.org/api/register -H "Content-Type: application/json" -d '{"team":"MonPseudo","mode":"competitive"}'` },
  { action: "S'inscrire (normal)", cmd: `curl -X POST https://atelierdocker.laurans.org/api/register -H "Content-Type: application/json" -d '{"team":"Alice_Bob","mode":"normal"}'` },
  { action: 'Soumettre un flag', cmd: `curl -X POST https://atelierdocker.laurans.org/api/submit -H "Content-Type: application/json" -H "X-Arena-Token: dq_..." -d '{"flag":"FLAG{...}"}'` },
  { action: 'Voir le classement', cmd: 'curl https://atelierdocker.laurans.org/api/overview' },
];