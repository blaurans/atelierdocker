/**
 * Moteur de score — mode compétitif.
 *
 * Le barème du cahier des charges (100 → 600 + bonus de podium 60/30/15) est
 * conservé tel quel. Deux composantes ont été ajoutées parce que la commande
 * du projet est explicite : « le temps et la qualité comptent pour un score ».
 *
 *   base        = points de la quête (100 à 600)
 *   speed_bonus = 60 / 30 / 15 pour les 1er / 2e / 3e à valider cette quête
 *                 dans toute la promotion (course globale, cf. PDF)
 *   pace_bonus  = jusqu'à +25 % de la base si la quête a été validée plus vite
 *                 que le temps pédagogique recommandé (estMinutes)
 *   penalty     = −5 par faux flag soumis (indice de méthode, pas de chance)
 *
 * En mode normal : ni score, ni bonus, ni pénalité. Le temps est tout de même
 * enregistré en base pour l'enseignant, mais n'entre dans aucun calcul.
 */

export const SPEED_BONUS = [60, 30, 15]; // index 0 = premier à valider
export const PENALTY_PER_WRONG_FLAG = 5;
export const PACE_BONUS_RATIO = 0.25;

/**
 * Bonus de podium pour la position occupée dans la course à cette quête.
 * @param {number} rank 1-indexé
 */
export function speedBonus(rank) {
  if (!Number.isInteger(rank) || rank < 1) return 0;
  return SPEED_BONUS[rank - 1] ?? 0;
}

/**
 * Bonus de rapidité intrinsèque : proportionnel à l'avance sur l'estimation.
 * Une quête validée dans le temps prévu donne 0 ; deux fois plus vite que prévu
 * donne le plafond. Passé deux fois *plus lent*, plus rien.
 *
 * @param {number} timeMs    durée réelle de la quête
 * @param {number} estMinutes durée pédagogique recommandée
 */
export function paceBonus(timeMs, estMinutes) {
  if (!Number.isFinite(timeMs) || !Number.isFinite(estMinutes) || estMinutes <= 0) return 0;
  const speedup = (estMinutes * 60_000) / Math.max(timeMs, 1);
  if (speedup <= 1) return 0;            // dans les temps ou en retard : rien
  return Math.min(1, speedup - 1);      // plafond à deux fois plus rapide
}

/**
 * Calcule le gain d'une quête et le score cumulé.
 *
 * @param {object} args
 * @param {object} args.quest       quête validée
 * @param {number} args.rank        rang global dans la course à cette quête (1 = premier)
 * @param {number} [args.timeMs]    durée de la quête, si chronométrée
 * @param {number} [args.wrongFlags] nombre de faux flags soumis auparavant
 * @param {number} [args.scoreBefore] score déjà acquis par le joueur
 * @param {boolean} [args.competitive]
 */
export function award({ quest, rank, timeMs = null, wrongFlags = 0, scoreBefore = 0, competitive = true }) {
  const base = quest.points;

  if (!competitive) {
    return {
      base,
      speed_bonus: 0,
      pace_bonus: 0,
      penalty: 0,
      points_earned: 0,
      score_total: 0,
      scored: false,
    };
  }

  const speed = speedBonus(rank);
  const paceRatio = paceBonus(timeMs, quest.estMinutes);
  const pace = Math.round(base * PACE_BONUS_RATIO * paceRatio);
  const penalty = Math.max(0, wrongFlags) * PENALTY_PER_WRONG_FLAG;

  // Garde-fou : une quête ne peut jamais rapporter moins que la moitié de sa
  // valeur, même après une série d'erreurs.
  const earned = Math.max(Math.round(base / 2), base + speed + pace - penalty);

  return {
    base,
    speed_bonus: speed,
    pace_bonus: pace,
    penalty,
    points_earned: earned,
    score_total: scoreBefore + earned,
    scored: true,
  };
}

/**
 * Classement. Tri : score décroissant, puis quêtes validées, puis heure de
 * fin croissante. Les égalités parfaites partagent le même rang.
 *
 * @param {Array<{score:number, completed:number[], finished_at?:string|null, team:string}>} rows
 */
export function rank(rows) {
  const sorted = [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ca = a.completed?.length ?? 0;
    const cb = b.completed?.length ?? 0;
    if (cb !== ca) return cb - ca;
    const fa = a.finished_at ?? '9999';
    const fb = b.finished_at ?? '9999';
    if (fa !== fb) return fa < fb ? -1 : 1;
    return a.team.localeCompare(b.team);
  });

  let rank = 0;
  let prevKey = null;
  sorted.forEach((row, i) => {
    const key = `${row.score}|${row.completed?.length ?? 0}|${row.finished_at ?? ''}`;
    if (key !== prevKey) { rank = i + 1; prevKey = key; }
    row.rank = rank;
  });
  return sorted;
}

/** Position d'un joueur dans le classement (null s'il n'est pas classé). */
export function positionOf(ranked, team) {
  const found = ranked.find((r) => r.team.toLowerCase() === String(team).toLowerCase());
  return found?.rank ?? null;
}

/** Le podium : les trois premiers du classement, le reste suit. */
export function podium(ranked) {
  return ranked.slice(0, 3);
}

export function summarize(ranked) {
  const top = ranked[0];
  return {
    players: ranked.length,
    leader: top ? { team: top.team, score: top.score } : null,
    median: median(ranked.map((r) => r.score)),
    finished: ranked.filter((r) => r.finished_at).length,
  };
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}