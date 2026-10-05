/**
 * Limitation de débit en mémoire, par adresse IP.
 *
 * Le portail est ouvert sur le réseau de la classe : sans plafond, un seul
 * poste malveillant (ou un script d'élève) peut sature la base et le
 * serveur. La limite est volontairement haute pour ne jamais gêner un élève
 * qui valide plusieurs missions d'affilée, mais assez basse pour rendre une
 * salve inutile.
 *
 * Le compteur est en mémoire : il repart à zéro au redémarrage du conteneur.
 * C'est acceptable ici, ce n'est pas une défense contre une attaque ciblée.
 */

const buckets = new Map();

/** Le portail est-il derrière un reverse proxy qui renseigne X-Forwarded-For ? */
const TRUST_PROXY = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.TRUST_PROXY ?? '').toLowerCase(),
);

/** Purge périodique des compteurs expirés (évite la fuite de mémoire). */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (now - b.started > b.windowMs) buckets.delete(key);
  }
}, 60_000);
sweeper.unref?.();

/**
 * @param {object} options
 * @param {number} options.limit     nombre de requêtes autorisées
 * @param {number} options.windowMs  fenêtre glissante
 * @param {string} options.prefix    espace de noms (par route)
 */
export function rateLimit({ limit = 30, windowMs = 60_000, prefix = 'g' } = {}) {
  // `RATE_LIMIT=off` désactive tout plafond. Réservé aux tests automatisés,
  // qui enchaînent les appels depuis une seule adresse.
  if (String(process.env.RATE_LIMIT ?? '').toLowerCase() === 'off') {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    const ip = clientIp(req);
    const key = `${prefix}:${ip}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now - bucket.started > windowMs) {
      bucket = { started: now, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, limit - bucket.count);
    res.set('X-RateLimit-Limit', String(limit));
    res.set('X-RateLimit-Remaining', String(remaining));

    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.started + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        status: 'error',
        error: `Trop de requêtes. Réessaie dans ${retryAfter} s.`,
      });
    }
    next();
  };
}

/**
 * Adresse du client pour le comptage.
 *
 * `X-Forwarded-For` n'est lu que si `TRUST_PROXY` est explicitement activé.
 * Le portail tourne directement sur le port 8000, sans reverse proxy : dans ce
 * cas se fier à l'en-tête serait une faille, puisque n'importe quel client
 * enverrait une IP de son choix et repartirait avec un compteur neuf. Il faut
 * donc activer `TRUST_PROXY=1` uniquement si l'on place réellement un proxy
 * devant le portail.
 */
/**
 * Adresse du client. Exportée parce que le portail l'affiche dans le tableau
 * de suivi : l'enseignant a besoin de savoir quel poste est derrière quel
 * élève quand un élève ne répond pas.
 *
 * `X-Forwarded-For` n'est lu que si `TRUST_PROXY` est explicitement activé :
 * le portail tourne directement sur le port 8000, sans reverse proxy. Dans ce
 * cas se fier à l'en-tête serait une faille — un client enverrait l'IP de son
 * choix.
 */
export function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = req.get('x-forwarded-for');
    if (fwd) {
      const first = fwd.split(',')[0].trim();
      if (/^[\w.:-]{3,45}$/.test(first)) return first;
    }
  }
  return req.socket?.remoteAddress ?? req.ip ?? 'inconnu';
}

export const __plafonds = {
  register: rateLimit({ limit: 12, windowMs: 60_000, prefix: 'register' }),
  submit: rateLimit({ limit: 40, windowMs: 60_000, prefix: 'submit' }),
  quests: rateLimit({ limit: 120, windowMs: 60_000, prefix: 'quests' }),

  /**
   * Flux live : plafond volontairement haut.
   *
   * Une connexion SSE est **une seule requête qui reste ouverte**, pas un flux
   * de requêtes. Le risque n'est donc pas l'abus de bande passante mais le
   * fait qu'en salle tous les postes partagent la même IP (même NAT). Un
   * plafond bas ferait refuse la 21ᵉ connexion et renverrait un 429 à tout le
   * monde.
   *
   * Pire, le navigateur reconnecte automatiquement un EventSource en échec
   * toutes les ~3 s, soit 20 tentatives par minute : exactement la valeur d'un
   * plafond bas. Le compteur s'épuise, chaque échec en consomme un, et le
   * client reste bloqué indéfiniment. D'où une valeur large, et un Exponential
   * Backoff côté client qui espace les tentatives.
   */
  live: rateLimit({ limit: 300, windowMs: 60_000, prefix: 'live' }),

  api: rateLimit({ limit: 600, windowMs: 60_000, prefix: 'api' }),
};