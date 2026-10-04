/**
 * Les routes d'administration.
 *
 * Isolées de `api.js` parce qu'elles ont une contrainte que le jeu n'a pas :
 * **rien n'est servi sans jeton valide**. Voir `src/admin_session.js` pour le
 * mécanisme — mot de passe du `.env`, échangé contre un jeton signé, transporté
 * par un cookie `HttpOnly; SameSite=Strict`.
 *
 * Ce qui est protégé ici, et pourquoi c'est plus que « des endpoints » :
 *
 * - `POST /api/admin/delete/:pseudo` supprime une inscription. Sur une URL
 *   publique, sans mot de passe, c'est un bouton que n'importe qui peut
 *   presser.
 * - `GET /api/overview` et `GET /api/live` listent **tous** les élèves, leur
 *   progression et leur adresse IP. C'est la vue de l'enseignant, pas celle du
 *   jeu : elle passe donc derrière le même mot de passe. Un élève n'a jamais
 *   besoin de la voir.
 *
 * L'en-tête `X-Arena-Admin` reste accepté pour `curl` et les scripts de
 * maintenance, qui ne gèrent pas les cookies.
 */
import express from 'express';
import { config } from '../config.js';
import { HttpError } from '../auth.js';
import {
  estAdmin, jetonValide, jetonDe, motDePasseCorrect,
  creerJeton, poserCookie, retirerCookie, SESSION_TTL_MS,
} from '../admin_session.js';
import { overview, liveHandler, announce } from '../portal.js';
import { quests, reloadQuestpack } from '../questpack.js';
import { db } from '../db.js';
import {
  counts, allEvents, findByTeam, deletePlayer, resetPlayer, setMode, logEvent,
} from '../repo/arena.js';
import { attest, announceAfter } from '../progress.js';

export const admin = express.Router();

/* ----------------------------------------------------------------- session */

/**
 * Middleware : administration fermée au verrou.
 *
 * Il n'y a plus de « lab ouvert ». Une clé vide est un déploiement cassé, pas
 * une configuration valide : `src/server.js` refuse de démarrer dans ce cas.
 * Ce garde-fou attrape le cas restant — un `createApp()` monté par un test ou
 * un portage local, sans passer par `start()`.
 */
export function requireAdmin(req, _res, next) {
  if (!config.adminKey) {
    return next(new HttpError(503,
      "Administration indisponible : aucun mot de passe n'est configuré (ADMIN_KEY)."));
  }
  if (estAdmin(req)) return next();
  next(new HttpError(401,
    "Administration fermée. Connecte-toi avec le mot de passe du fichier .env."));
}

/** GET /api/admin/session — la page demande s'il faut le mot de passe. */
admin.get('/admin/session', (req, res) => {
  res.json({
    ok: true,
    authenticated: estAdmin(req),
    ttl_hours: SESSION_TTL_MS / 3_600_000,
  });
});

/**
 * POST /api/admin/session — échange le mot de passe contre un jeton.
 *
 * Le message d'erreur ne dit pas *quoi* a échoué : « champ vide » et « mot de
 * passe faux » rendent la même chose, sinon la page devient un oracle qui
 * valide les fautes de frappe une par une.
 */
admin.post('/admin/session', (req, res, next) => {
  try {
    const mdp = String(req.body?.password ?? '');
    if (!motDePasseCorrect(mdp)) {
      // La tentative est journalisée : une rafale d'échecs est un signal.
      logEvent(null, 'admin-refused', `${req.ip}`);
      throw new HttpError(401, 'Mot de passe incorrect.');
    }
    poserCookie(req, res, creerJeton());
    res.json({
      status: 'ok',
      ttl_hours: SESSION_TTL_MS / 3_600_000,
      message: 'Session ouverte pour la journée.',
    });
  } catch (e) { next(e); }
});

admin.delete('/admin/session', requireAdmin, (_req, res) => {
  retirerCookie(res);
  res.json({ status: 'ok' });
});

/* ------------------------------------------------------------------ teacher */

admin.get('/overview', requireAdmin, (_req, res, next) => {
  try { res.json(overview()); } catch (e) { next(e); }
});

admin.get('/live', requireAdmin, liveHandler);

/**
 * GET /api/stats — les indicateurs de séance.
 *
 * Cette route n'a **jamais fonctionné** : elle lisait `ov.competitive` et
 * `ov.normal`, champs supprimés avec le classement, et levait une exception à
 * chaque appel. Elle est reconstruite sur `ov.players`.
 *
 * Les cinq quêtes listées sont celles sur lesquelles des élèves sont restés
 * **bloqués juste avant** — pas celles qui rapportent le plus de points. La
 * question de l'enseignant en séance est « où est-ce que ça coince ? », et la
 * réponse est l'atelier où l'on s'arrête, pas le palmarès.
 */
admin.get('/stats', requireAdmin, (_req, res, next) => {
  try {
    const pack = quests();
    const ov = overview();
    const tous = ov.players ?? [];
    const minutes = pack.quests.reduce((a, q) => a + (q.estMinutes ?? 0), 0);

    const bloquees = pack.quests
      .map((q) => ({
        number: q.number,
        id: q.id,
        title: q.title,
        module: q.module,
        // « Bloqué sur » la quête n : l'élève a validé n-1 et pas n.
        bloques: tous.filter((p) => p.done === q.number - 1).length,
        resolues: tous.filter((p) => p.quests.includes(q.id)).length,
      }))
      .filter((q) => q.bloques > 0)
      .sort((a, b) => b.bloques - a.bloques || a.number - b.number)
      .slice(0, 5);

    res.json({
      ...counts(),
      by_mode: {
        competitive: tous.filter((p) => p.mode === 'competitive').length,
        normal: tous.filter((p) => p.mode === 'normal').length,
      },
      classroom: {
        moyenne_quetes: tous.length
          ? Math.round((tous.reduce((a, p) => a + (p.done ?? 0), 0) / tous.length) * 10) / 10
          : 0,
        autonomie_moyenne: ov.meta?.cohort?.average_autonomy ?? 0,
        indices_demandes: tous.reduce((a, p) => a + (p.hints_used ?? 0), 0),
        autonomes_sur_8: tous.filter((p) => (p.autonomy_ratio ?? 0) >= 0.75).length,
        // L'atelier le plus consommé d'indices : c'est là qu'il doit aller.
        atelier_le_plus_consomme: ov.meta?.cohort?.hardest?.[0] ?? null,
      },
      quests: { total: pack.totalQuests, minutes, bloquees },
      // Ce qu'il reste à valider lorsque REQUIRE_ATTESTATION est actif. La
      // liste vient des validations en attente, pas des événements : un
      // événement peut avoir été journalisé pour une quête depuis validée.
      pending: config.requireAttestation ? listeEnAttente() : [],
      recent_events: allEvents(30).map((e) => ({
        at: e.created_at, kind: e.kind, detail: e.detail,
      })),
    });
  } catch (e) { next(e); }
});

function listeEnAttente() {
  return allEvents(500)
    .filter((e) => e.kind === 'pending' && e.player_id)
    .slice(0, 20)
    .map((e) => ({ player_id: e.player_id, quest_id: e.detail, at: e.created_at }));
}

/**
 * Les validations en attente d'attestation.
 *
 * La liste vient de la table `completions`, pas des événements : un événement
 * `pending` peut avoir été journalisé pour une quête depuis validée, et
 * l'enseignant verrait un travail à faire qui n'existe plus.
 */
admin.get('/admin/pending', requireAdmin, (_req, res, next) => {
  try {
    if (!config.requireAttestation) {
      throw new HttpError(400, "L'attestation est désactivée (REQUIRE_ATTESTATION=0).");
    }
    const rows = db.prepare(`
      SELECT p.id AS player_id, p.team, p.mode, c.quest_id, c.quest_number,
             c.completed_at, c.time_ms, c.wrong_flags
        FROM completions c JOIN players p ON p.id = c.player_id
       WHERE c.status = 'pending'
       ORDER BY c.completed_at
    `).all();
    res.json({ pending: rows });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------- actions */

const joueur = (req) => {
  const nom = String(req.params.pseudo ?? req.params.team ?? '').trim();
  const p = findByTeam(nom);
  if (!p) throw new HttpError(404, `Aucun joueur « ${nom} » sur ce portail.`);
  return p;
};

/**
 * La remise à zéro : un élève bloqué perd sa progression et recommence.
 *
 * Elle exige une confirmation explicite dans le corps de la requête. Un `curl`
 * oublié, ou un script mal écrit, ne doit pas effacer une séance de travail
 * parce que le pseudo était juste.
 */
admin.post('/admin/reset/:team', requireAdmin, (req, res, next) => {
  try {
    const p = joueur(req);
    if (!/^(oui|vrai|yes|true|1)$/i.test(String(req.body?.confirm ?? '').trim())) {
      throw new HttpError(400,
        'Remise à zéro refusée : il faut {"confirm":"oui"} dans le corps de la requête.');
    }
    resetPlayer(p.id);
    logEvent(p.id, 'admin-reset', `remise à zéro depuis ${req.ip}`);
    announceAfter(p.id);
    res.json({ status: 'ok', pseudo: p.team, message: `${p.team} repart de zéro.` });
  } catch (e) { next(e); }
});

admin.post('/admin/delete/:team', requireAdmin, (req, res, next) => {
  try {
    const p = joueur(req);
    deletePlayer(p.id);
    logEvent(null, 'admin-delete', `${p.team} supprimé depuis ${req.ip}`);
    announce(`delete:${p.team}`);
    res.json({ status: 'ok', pseudo: p.team, message: `${p.team} supprimé.` });
  } catch (e) { next(e); }
});

admin.post('/admin/mode/:team', requireAdmin, (req, res, next) => {
  try {
    const p = joueur(req);
    const mode = String(req.body?.mode ?? '').trim().toLowerCase();
    if (mode !== 'competitive' && mode !== 'normal') {
      throw new HttpError(400, 'Mode invalide : « competitive » ou « normal ».');
    }
    setMode(p.id, mode);
    // Changer de mode en plein atelier efface le parcours. C'est délibéré :
    // une quête validée en Challenge a été validée sous une règle d'autonomie
    // (les indices payaient) qu'elle n'aurait pas à valider en Sans stress
    // (gratuits). Garder les deux à la fois rendrait la mesure illisible.
    resetPlayer(p.id);
    logEvent(p.id, 'admin-mode', `${p.team} passe en ${mode}`);
    announceAfter(p.id);
    res.json({
      status: 'ok', pseudo: p.team, mode,
      message: `${p.team} passe en ${mode === 'competitive' ? 'Challenge' : 'Sans stress'} — son parcours repart de zéro.`,
    });
  } catch (e) { next(e); }
});

admin.post('/admin/attest/:team/:questId', requireAdmin, (req, res, next) => {
  try {
    if (!config.requireAttestation) {
      throw new HttpError(400, "L'attestation est désactivée (REQUIRE_ATTESTATION=0).");
    }
    const p = joueur(req);
    const q = String(req.params.questId ?? '');
    if (!quests().byId.has(q)) throw new HttpError(404, 'Quête inconnue.');
    const result = attest({ player: p, questId: q });
    if (!result) throw new HttpError(404, 'Aucune soumission en attente pour cette quête.');
    announceAfter(p.id);
    res.json({ status: 'attested', pseudo: p.team, quest_id: q, ...result });
  } catch (e) { next(e); }
});

/** Recharge le contenu des quêtes depuis le disque. */
admin.post('/admin/seed', requireAdmin, (_req, res, next) => {
  try {
    const pack = reloadQuestpack();
    announce('seed');
    res.json({ status: 'ok', quests: pack.totalQuests });
  } catch (e) { next(e); }
});

/** Qui parle, par quel canal, et jusqu'à quand. Pour diagnostiquer une session. */
admin.get('/admin/qui', requireAdmin, (req, res) => {
  const j = jetonDe(req);
  res.json({
    status: 'ok',
    canal: req.get('cookie')?.includes('dq_admin') ? 'cookie'
      : req.get('x-arena-admin') ? 'en-tête'
        : 'jeton',
    expire: jetonValide(j) ? Number(String(j).split('.')[0]) : null,
  });
});
