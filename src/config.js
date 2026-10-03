import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

const bool = (v, dflt = false) => {
  if (v === undefined || v === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

const int = (v, dflt) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : dflt;
};

export const config = {
  port: int(process.env.PORT, 8000),
  host: process.env.HOST || '0.0.0.0',
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'arena.sqlite'),

  /** Clé d'administration : `X-Arena-Admin`. Vide = administration ouverte (lab). */
  adminKey: process.env.ADMIN_KEY || '',

  /** Durée de vie d'une session de jeu, en ms. */
  sessionTtlMs: int(process.env.SESSION_TTL_MIN, 240) * 60_000,

  /** Intervalle du keepalive SSE, en ms. */
  sseKeepaliveMs: int(process.env.SSE_KEEPALIVE_MS, 25_000),

  /**
   * Si vrai, une quête n'est validée que si l'enseignant a apposé son
   * attestation dans le tableau de bord (`POST /api/admin/attest`).
   * Par défaut faux : le portail est autonome, comme dans le cahier des charges.
   */
  requireAttestation: bool(process.env.REQUIRE_ATTESTATION, false),

  /**
   * Progression strictement linéaire — guidage d'affichage uniquement.
   *
   * Par défaut `false` : toutes les missions sont accessibles d'emblée. Un
   * étudiant bloqué sur la mission 7 peut aller lire la 12, et valider dans
   * l'ordre qu'il veut. Bloquer l'accès est un choix, pas une aide — et en
   * mode normal, une vraie entrave à l'apprentissage.
   *
   * Mettez `1` si vous voulez que le plan ne montre que la mission suivante
   * comme ouverte (dépannage de TP, progression évaluée au fil de l'eau).
   * Le barème et les scores sont identiques dans les deux cas.
   *
   * Ce n'est PAS une contrainte serveur : `/api/submit` ne regarde que le
   * flag, donc un appel direct validerait n'importe quelle mission dans les
   * deux modes. C'est assumé — punir l'étudiant qui utilise `curl` comme
   * documenté n'apporterait rien. Pour une vraie contrainte, voir
   * `requireAttestation`.
   */
  linearProgression: bool(process.env.LINEAR_PROGRESSION, false),

  publicDir: path.join(ROOT, 'public'),
  /** Surchargable pour tester ou servir un barème alternatif sans rebuild. */
  questsDir: process.env.QUESTS_DIR || path.join(ROOT, 'content', 'quests'),
  templatesDir: path.join(ROOT, 'content', 'templates'),
};

export const MODES = /** @type {const} */ (['competitive', 'normal']);

export const isMode = (v) => MODES.includes(String(v ?? '').trim().toLowerCase());