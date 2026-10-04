import { clientIp } from './ratelimit.js';
import { findByToken, findByTeam, touch } from './repo/arena.js';

/** Erreur HTTP portant un statut, attrapée par le middleware d'erreur. */
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const bearer = (req) => {
  const h = req.get('authorization');
  if (h && /^bearer\s+/i.test(h)) return h.replace(/^bearer\s+/i, '').trim();
  return null;
};

/**
 * Retrouve le joueur à partir de la requête.
 * Trois canaux, dans cet ordre : en-tête `Authorization: Bearer`, en-tête
 * `X-Arena-Token`, puis `?token=` en query string — ce dernier permet
 * `curl` sans en-tête, utile en TP.
 */
export function identify(req) {
  const bodyToken = req.body && typeof req.body === 'object' ? req.body.token : null;
  // `?t=` est la forme courte utilisée par la commande de récupération du
  // mot de passe : elle s'exécute dans un conteneur, qui n'a pas d'en-tête
  // HTTP à envoyer.
  const token = bearer(req)
    || req.get('x-arena-token')
    || req.query.token
    || req.query.t
    || bodyToken
    || null;
  const byToken = findByToken(token);
  if (byToken) {
    // On mémorise le poste : l'enseignant voit ainsi quel machine est
    // derrière quel élève dans le tableau de suivi.
    touch(byToken.id, clientIp(req));
    return byToken;
  }

  // Reprise d'un slot existant : pseudo + secret.
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const team = body.team ?? req.query.team;
  const secret = body.secret ?? req.query.secret;
  if (team) {
    const p = findByTeam(team);
    if (p) {
      if (!p.secret) { touch(p.id, clientIp(req)); return p; }   // slot public
      if (secret && p.secret === String(secret)) {
        touch(p.id, clientIp(req));
        return p;
      }
    }
  }
  return null;
}

/** Middleware : 401 si le joueur n'est pas identifié. */
export function requirePlayer(req, _res, next) {
  const p = identify(req);
  if (!p) return next(new HttpError(401, 'Session inconnue. Reconnecte-toi avec ton token (X-Arena-Token).'));
  req.player = p;
  next();
}

/*
 * L'administration a été déplacée dans `src/routes/admin.js`, avec son jeton de
 * session. Ce ré-export existe pour que les imports existants continuent de
 * fonctionner — mais `requireAdmin` n'est plus défini ici : il faut l'importer
 * de `./routes/admin.js`, sinon on aurait deux règles d'accès.
 */
export { requireAdmin } from './routes/admin.js';