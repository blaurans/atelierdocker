/**
 * La session d'administration : un mot de passe, un jeton, un cookie.
 *
 * ## Pourquoi un mot de passe et pas seulement une clé d'en-tête
 *
 * Une clé d'en-tête (`X-Arena-Admin`) ne peut pas servir une page web : le
 * navigateur n'envoie pas d'en-tête arbitraire, et `EventSource` — le mécanisme
 * du flux live — n'en accepte aucun. Les deux obligeraient à mettre la clé dans
 * une URL, où elle finit dans l'historique du navigateur et dans les logs de
 * Caddy.
 *
 * Le mot de passe est donc demandé une fois, échangé contre un jeton signé à
 * durée de vie courte, et transporté dans un cookie `HttpOnly` :
 *
 * - **`HttpOnly`** — une page du portail ne peut pas le lire. Une faille
 *   XSS sur `/` ne donne donc pas accès à l'administration.
 * - **`SameSite=Strict`** — le cookie n'est pas envoyé sur une requête
 *   provenant d'un autre site. C'est ce qui ferme la porte au CSV sur
 *   `POST /api/admin/delete/:pseudo` : un lien malveillant glissé dans une
 *   discussion ne supprime rien.
 * - **`Secure`** dès que la requête arrive en HTTPS.
 *
 * Le mot de passe lui-même **n'est jamais stocké** : il sert à vérifier la
 * signature du jeton présenté, et à comparer — à coût constant, pour ne pas
 * laisser une fenêtre de timing.
 *
 * L'en-tête `X-Arena-Admin` reste accepté : `curl` ne gère pas les cookies, et
 * les scripts de maintenance en dépendent.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

/** Durée de vie d'une session d'administration, en ms. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;   // une journée de cours

const COOKIE = 'dq_admin';

/**
 * Une signature, pas un chiffrement : le jeton ne porte aucun secret, seulement
 * une date et une signature. Il est donc lisible — ce qui est volontaire, on
 * peut inspecter ce qu'on a en main — et falsifiable sans la clé.
 */
const signer = () => createHmac('sha256', config.adminKey).update('dq-admin-v1');

/**
 * Vérifie le mot de passe, sans fuite de temps.
 *
 * On compare deux **hachages**, jamais les chaînes : `timingSafeEqual` lève si
 * les longueurs diffèrent, et surtout la comparaison native s'arrête au
 * premier octet différent — ce qui donne, en mesurant, le nombre de
 * caractères corrects. Sur une URL publique, c'est une mesure de distance
 * gratuite.
 *
 * Le hachage est calculé sur la **seule** entrée variable, avec un préfixe
 * fixe : c'est ce qui rend la comparaison constante. Deux HMAC avec des clés
 * et des messages différents ne se comparent jamais — la clé de l'un serait
 * le mot de passe de l'autre.
 */
const hacher = (s) => createHash('sha256')
  .update('dq-mdp-v1\u0000')
  .update(String(s ?? ''), 'utf8')
  .digest();

export function motDePasseCorrect(candidat) {
  return timingSafeEqual(hacher(candidat), hacher(config.adminKey));
}

/** Fabrique un jeton pour `maintenant`. La forme est `<expiration>.<signature>`. */
export function creerJeton(maintenant = Date.now()) {
  const expire = maintenant + SESSION_TTL_MS;
  return `${expire}.${signer().update(String(expire)).digest('base64url')}`;
}

/** Le jeton est-il valide et non expiré ? */
export function jetonValide(jeton, maintenant = Date.now()) {
  if (typeof jeton !== 'string') return false;
  const i = jeton.indexOf('.');
  if (i <= 0) return false;
  const expire = Number(jeton.slice(0, i));
  if (!Number.isFinite(expire)) return false;
  if (expire <= maintenant) return false;
  const attendu = signer().update(String(expire)).digest('base64url');
  const fourni = jeton.slice(i + 1);
  if (attendu.length !== fourni.length) return false;
  return timingSafeEqual(Buffer.from(attendu), Buffer.from(fourni));
}

const lireCookie = (req, nom) => {
  const brut = req.get('cookie');
  if (!brut) return null;
  for (const part of brut.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === nom) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
};

const bearer = (req) => {
  const h = req.get('authorization');
  return h && /^bearer\s+/i.test(h) ? h.replace(/^bearer\s+/i, '').trim() : null;
};

/** Le jeton présenté par cette requête, quel que soit le canal. */
export function jetonDe(req) {
  return lireCookie(req, COOKIE) || bearer(req) || req.get('x-arena-admin') || null;
}

/**
 * L'en-tête accepte **aussi** le mot de passe en clair.
 *
 * C'est ce que font `curl` et les scripts de maintenance : avant ce changement,
 * `X-Arena-Admin` portait la clé et c'était tout. Le retirer aurait cassé le
 * mémento de commandes, `scripts/nettoie-verif.js`, et les commandes que
 * l'enseignant lance en cours — pour un gain de sécurité nul, puisque le mot
 * de passe transite de toute façon sur la même connexion en TLS.
 *
 * La page, elle, n'utilise jamais ce canal : elle passe par le cookie. C'est
 * le seul chemin qu'un navigateur peut prendre, et il est `HttpOnly`.
 *
 * Le mot de passe en clair n'est accepté **que** par en-tête, pas par cookie
 * ni par query string : un mot de passe dans une URL finit dans l'historique
 * et dans les journaux du proxy.
 */
export function estAdmin(req) {
  const brut = req.get('x-arena-admin');
  if (brut && motDePasseCorrect(brut)) return true;
  const j = jetonDe(req);
  return j ? jetonValide(j) : false;
}

/**
 * Pose le cookie de session.
 *
 * `Secure` seulement quand la requête est déjà en HTTPS : le mettre en local
 * sur `http://localhost` ferait rejeter le cookie par le navigateur, et l'écran
 * admin serait inutilisable en développement.
 */
export function poserCookie(req, res, jeton, maxAgeMs = SESSION_TTL_MS) {
  const attributs = [
    `${COOKIE}=${encodeURIComponent(jeton)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (req.secure || req.protocol === 'https') attributs.push('Secure');
  res.append('Set-Cookie', attributs.join('; '));
}

export function retirerCookie(res) {
  res.append('Set-Cookie',
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export const NOM_COOKIE = COOKIE;
