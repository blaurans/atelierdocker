import express from 'express';
import { db } from '../db.js';
import { config, isMode } from '../config.js';
import { HttpError, requirePlayer, requireAdmin, identify } from '../auth.js';
import { __plafonds as plafonds, clientIp } from '../ratelimit.js';
import { quests, reloadQuestpack } from '../questpack.js';
import { rank, positionOf } from '../scoring.js';
import { overview, liveHandler, announce } from '../portal.js';
import { submitQuest, attest, recomputeScore, announceAfter } from '../progress.js';
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

export const modeLabel = (m) => (m === 'competitive' ? 'Compétitif' : 'Normal');

const normalizeFlag = (raw) => String(raw ?? '').trim().toUpperCase();

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
 * n'a pas d'en-tête à envoyer. Et comme le mot de passe est unique par équipe,
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

    if (!team) throw new HttpError(400, "Le nom d'équipe est obligatoire.");
    if (!TEAM_RE.test(team)) {
      throw new HttpError(400, 'Nom invalide : 2 à 32 caractères (lettres, chiffres, espace, point, tiret, tiret bas).');
    }
    if (!isMode(mode)) throw new HttpError(400, 'Mode invalide : « competitive » ou « normal ».');

    const existing = findByTeam(team);
    if (existing) {
      if (existing.secret && existing.secret !== secret) {
        throw new HttpError(409,
          `L'équipe « ${team} » est déjà prise en mode ${modeLabel(existing.mode)}. `
          + 'Choisis un autre pseudo, ou ressaisis le secret pour reprendre ton score.');
      }
      if (secret && !existing.secret) setSecret(existing.id, secret);
      logEvent(existing.id, 'rejoin', existing.mode);
      return res.status(200).json({
        status: 'exists',
        team: existing.team,
        mode: existing.mode,
        token: existing.token,
        message: `Équipe « ${existing.team} » déjà enregistrée en mode ${modeLabel(existing.mode)}.`,
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
          checkpoint: q.checkpoint,
          brief: q.brief,
          // Le flag n'est PAS transmis : il se récupère par /api/secret et
          // n'existe pas dans le contenu. Le champ reste dans la base pour
          // l'anti-doublon, mais il ne sort jamais d'ici.
          hints: q.hints,
          // La commande de récupération, prête à coller. Voir `origin()` plus
          // haut pour pourquoi c'est l'origine complète plutôt que le seul
          // hôte. Le préfixe est remplacé en entier, « https://SERVER_IP »
          // comme « http://SERVER_IP », parce que le contenu est la source de
          // vérité et porte déjà « https:// » : substituer une origine entière
          // à un protocole seul produirait « https://https://… ». Le jeton du
          // joueur remplace le littéral : sans lui, aucun conteneur ne peut rien
          // récupérer.
          fetch_hint: q.fetchHint && player
            ? q.fetchHint
              .replaceAll('https://SERVER_IP', origin(req))
              .replaceAll('http://SERVER_IP', origin(req))
              .replaceAll('dq_xxxxxxxxxxxxxxxx', player.token)
            : null,
          // La correction n'est envoyée qu'une fois la mission validée : le
          // client ne doit pas pouvoir la lire avant, même depuis l'onglet
          // réseau du navigateur.
          solution: done.has(q.id) ? q.solution : null,
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
    const competitive = p.mode === 'competitive';

    res.json({
      team: p.team,
      mode: p.mode,
      mode_label: modeLabel(p.mode),
      score: competitive ? p.score : null,
      rank: competitive ? positionOf(rank(overview().competitive), p.team) : null,
      total_quests: pack.totalQuests,
      progress: `${doneIds.size}/${pack.totalQuests}`,
      completed_percent: Math.round((doneIds.size / pack.totalQuests) * 100),
      finished: !!p.finished_at,
      registered_at: p.registered_at,
      last_submission: p.last_submit,
      next_quest: pack.quests.find((q) => !doneIds.has(q.id))?.id ?? null,
      history: done.map((c) => ({
        quest_id: c.quest_id,
        quest_number: c.quest_number,
        points: c.points,
        speed_bonus: c.speed_bonus,
        pace_bonus: c.pace_bonus,
        penalty: c.penalty,
        wrong_flags: c.wrong_flags,
        time_ms: c.time_ms,
        at: c.completed_at,
        // Le mode normal ne renvoie jamais de temps : il ne doit pas exister
        // dans la réponse, pas seulement être masqué à l'affichage.
        time_display: competitive ? formatMs(c.time_ms) : null,
      })),
    });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------- submit */

api.post('/submit', plafonds.submit, (req, res, next) => {
  try {
    const flag = normalizeFlag(req.body?.flag);
    const player = identify(req);
    if (!player) {
      throw new HttpError(404, "Équipe non enregistrée. Inscris-toi d'abord via /api/register.");
    }

    // Le mot de passe n'est plus stocké dans le contenu : on le compare au
    // secret que le serveur dérive pour CE joueur et CETTE mission. Impossible
    // donc de valider en recopiant un flag lu ailleurs, et chaque équipe a le
    // sien.
    const pack = quests();
    const quest = pack.quests.find((q) => secretFor(player, q) === flag);
    if (!quest) {
      logEvent(player.id, 'bad_flag', flag.slice(0, 60));
      throw new HttpError(400,
        'Mot de passe invalide. Va le chercher avec la commande indiquée dans '
        + 'la mission — il n\'est écrit nulle part dans l\'énoncé.');
    }

    const competitive = player.mode === 'competitive';
    const previous = doneOf(player.id);

    if (previous.some((c) => c.quest_id === quest.id)) {
      return res.json({
        status: 'already_submitted',
        mode: player.mode,
        quest_validated: quest.number,
        quest_title: quest.title,
        points_earned: 0,
        score_total: competitive ? player.score : 0,
        completed_count: `${previous.length}/${pack.totalQuests}`,
        rank: competitive ? positionOf(rank(overview().competitive), player.team) : null,
        finished: !!player.finished_at,
        message: `Quête ${quest.number} déjà validée précédemment.`,
      });
    }

    const outcome = submitQuest({
      player,
      quest,
      requireAttestation: config.requireAttestation,
    });

    const fresh = announceAfter(player.id);
    const ranked = rank(overview().competitive);

    if (outcome.status === 'pending') {
      return res.json({
        status: 'pending',
        mode: player.mode,
        quest_validated: quest.number,
        quest_title: quest.title,
        points_earned: 0,
        completed_count: `${previous.length}/${pack.totalQuests}`,
        finished: false,
        message: "Flag correct ! En attente de la validation de l'enseignant.",
      });
    }

    const doneIds = new Set([...previous.map((c) => c.quest_id), quest.id]);
    const next = pack.quests.find((q) => !doneIds.has(q.id)) ?? null;
    const step = outcome.result?.breakdown?.at(-1) ?? null;

    res.json({
      status: 'success',
      mode: player.mode,
      quest_validated: quest.number,
      quest_title: quest.title,
      points_earned: competitive ? step?.gained ?? quest.points : 0,
      breakdown: competitive && step
        ? {
          base: quest.points,
          speed_bonus: step.speed_bonus ?? 0,
          pace_bonus: step.pace_bonus ?? 0,
          penalty: step.penalty ?? 0,
        }
        : null,
      score_total: competitive ? fresh.score : 0,
      completed_count: `${doneIds.size}/${pack.totalQuests}`,
      rank: competitive ? positionOf(ranked, player.team) : null,
      finished: doneIds.size === pack.totalQuests,
      unlocked_next: next?.id ?? null,
      time_display: competitive ? formatMs(outcome.timeMs) : null,
      message: buildMessage({ player, quest, outcome, competitive, doneIds, pack }),
    });
  } catch (e) { next(e); }
});

function formatMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
}

function buildMessage({ player, quest, outcome, competitive, doneIds, pack }) {
  if (!competitive) {
    return doneIds.size === pack.totalQuests
      ? "Parcours terminé : toutes les étapes sont validées. Bien joué !"
      : `Étape validée ! ${doneIds.size}/${pack.totalQuests} étapes accomplies.`;
  }
  const gained = outcome.result?.breakdown?.at(-1)?.gained ?? quest.points;
  const medal = outcome.rank === 1 ? ' — 🥇 premier sur cette quête'
    : outcome.rank === 2 ? ' — 🥈 deuxième'
      : outcome.rank === 3 ? ' — 🥉 troisième' : '';
  return `Quête ${quest.number} validée ! +${gained} pts${medal}.`;
}

/* ---------------------------------------------------------------- overview */

api.get('/overview', (_req, res, next) => {
  try { res.json(overview()); } catch (e) { next(e); }
});

api.get('/live', plafonds.live, liveHandler);

api.get('/leaderboard/:mode', (req, res, next) => {
  try {
    const mode = String(req.params.mode).toLowerCase();
    if (!isMode(mode)) throw new HttpError(400, 'Mode inconnu : competitive ou normal.');
    res.json({ mode, leaderboard: overview()[mode] });
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------- stats */

api.get('/stats', requireAdmin, (_req, res, next) => {
  try {
    const pack = quests();
    const ov = overview();
    const everyone = [...ov.competitive, ...ov.normal];

    res.json({
      ...counts(),
      by_mode: {
        competitive: ov.competitive.length,
        normal: ov.normal.length,
      },
      quests: {
        total: pack.totalQuests,
        points: pack.totalPoints,
        hardest: pack.quests
          .map((q) => ({
            id: q.id,
            number: q.number,
            title: q.title,
            module: q.module,
            points: q.points,
            solved: everyone.filter((p) => p.quests.includes(q.id)).length,
            stuck: everyone.filter((p) => p.completed.length === q.number - 1).length,
          }))
          .sort((a, b) => b.stuck - a.stuck || a.solved - b.solved)
          .slice(0, 5),
      },
      recent_events: allEvents(30).map((e) => ({
        at: e.created_at,
        kind: e.kind,
        detail: e.detail,
      })),
    });
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------- admin */

const teamOr404 = (name) => {
  const p = findByTeam(name);
  if (!p) throw new HttpError(404, 'Équipe inconnue.');
  return p;
};

/** Joueurs en attente d'attestation (uniquement si REQUIRE_ATTESTATION=1). */
api.get('/admin/pending', requireAdmin, (_req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT p.team, p.mode, c.quest_id, c.quest_number, c.completed_at, c.time_ms, c.wrong_flags
        FROM completions c JOIN players p ON p.id = c.player_id
       WHERE c.status = 'pending'
       ORDER BY c.completed_at
    `).all();
    res.json({ pending: rows });
  } catch (e) { next(e); }
});

api.post('/admin/reset/:team', requireAdmin, (req, res, next) => {
  try {
    const p = teamOr404(req.params.team);
    resetPlayer(p.id);
    announce(`reset:${p.team}`);
    res.json({ status: 'reset', team: p.team, mode: p.mode });
  } catch (e) { next(e); }
});

api.post('/admin/delete/:team', requireAdmin, (req, res, next) => {
  try {
    const p = teamOr404(req.params.team);
    deletePlayer(p.id);
    announce(`delete:${p.team}`);
    res.json({ status: 'deleted', team: p.team });
  } catch (e) { next(e); }
});

api.post('/admin/mode/:team', requireAdmin, (req, res, next) => {
  try {
    const mode = String(req.body?.mode ?? '').toLowerCase();
    if (!isMode(mode)) throw new HttpError(400, 'Mode invalide.');
    const p = teamOr404(req.params.team);
    setMode(p.id, mode);
    resetPlayer(p.id); // le score dépend du mode : on repart proprement
    recomputeScore(p.id);
    announce(`mode:${p.team}`);
    res.json({ status: 'ok', team: p.team, mode });
  } catch (e) { next(e); }
});

api.post('/admin/attest/:team/:questId', requireAdmin, (req, res, next) => {
  try {
    if (!config.requireAttestation) {
      throw new HttpError(400, "L'attestation est désactivée (REQUIRE_ATTESTATION=0).");
    }
    const p = teamOr404(req.params.team);
    const result = attest({ player: p, questId: req.params.questId });
    if (!result) throw new HttpError(404, 'Aucune soumission en attente pour cette quête.');
    announceAfter(p.id);
    res.json({ status: 'attested', team: p.team, quest_id: req.params.questId, ...result });
  } catch (e) { next(e); }
});

api.post('/admin/seed', requireAdmin, (_req, res, next) => {
  try {
    const pack = reloadQuestpack();
    announce('seed');
    res.json({ status: 'ok', quests: pack.totalQuests, points: pack.totalPoints });
  } catch (e) { next(e); }
});

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