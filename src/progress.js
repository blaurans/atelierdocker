import { db, now, clock } from './db.js';
import { award } from './scoring.js';
import {
  doneOf, wrongFlagCount, setScore, markFinished, logEvent, markSubmitTime,
  recordCompletion, setCompletionStatus, globalRankFor, doneCount, persistBreakdown,
} from './repo/arena.js';
import { quests } from './questpack.js';
import { announce } from './events.js';

/**
 * Durée de la quête : temps écoulé depuis l'étape précédente, ou depuis
 * l'inscription pour la première. C'est ce qui alimente le bonus de rapidité.
 * En mode normal le temps est stocké mais jamais lu.
 */
function elapsed(player, previous) {
  const since = previous.length
    ? Date.parse(previous.at(-1).completed_at)
    : Date.parse(player.created_at);
  if (!Number.isFinite(since)) return null;
  const t = Date.now() - since;
  return t > 0 ? t : null;
}

/**
 * Recalcule le score d'un joueur à partir de ses validations.
 *
 * Idempotent et déterministe : c'est la seule fonction qui écrit le score.
 * Utilisée à chaque validation, mais aussi quand l'enseignant valide une
 * quête en attente d'attestation, ou quand un barème change. Le score n'est
 * donc jamais une valeur incrémentale qui peut diverger.
 */
export function recomputeScore(playerId) {
  const pack = quests();
  const rows = db.prepare(
    `SELECT * FROM completions
      WHERE player_id = ? AND status = 'done'
      ORDER BY completed_at, id`
  ).all(playerId);

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
  if (!player) return null;

  const competitive = player.mode === 'competitive';
  let total = 0;
  const breakdown = [];

  for (const row of rows) {
    const quest = pack.byId.get(row.quest_id);
    if (!quest) continue;

    if (!competitive) {
      breakdown.push({ quest_id: row.quest_id, number: row.quest_number, gained: 0 });
      continue;
    }

    const rank = globalRankFor(row.quest_number, row.completed_at, playerId);
    const result = award({
      quest,
      rank,
      timeMs: row.time_ms,
      wrongFlags: row.wrong_flags,
      scoreBefore: total,
      competitive: true,
    });
    total = result.score_total;
    breakdown.push({
      quest_id: row.quest_id,
      number: row.quest_number,
      rank,
      gained: result.points_earned,
      speed_bonus: result.speed_bonus,
      pace_bonus: result.pace_bonus,
      penalty: result.penalty,
    });
    // On persiste le détail du barème : `/api/me` lit l'historique depuis la
    // table, et sans cette écriture le joueur verrait toujours « 0 pts de
    // podium » alors qu'il en a gagné. La valeur est recalculée à chaque
    // passage, donc un barème modifié se répercute aussi.
    persistBreakdown(row.id, result);
  }

  setScore(playerId, total);
  if (rows.length === pack.totalQuests) markFinished(playerId);
  return { score: total, breakdown, finished: rows.length === pack.totalQuests };
}

/**
 * Enregistre la validation d'une quête.
 *
 * @returns {{status:'done'|'pending', rank:number, result:object, player:object, timeMs:number|null}}
 */
const record = db.transaction(({ player, quest, requireAttestation }) => {
  const previous = doneOf(player.id);
  const timeMs = elapsed(player, previous);
  const at = now();
  const wrong = wrongFlagCount(player.id);

  if (requireAttestation) {
    const already = db.prepare('SELECT * FROM completions WHERE player_id = ? AND quest_id = ?')
      .get(player.id, quest.id);
    if (already) {
      return { status: already.status, rank: 0, result: null, timeMs, already: true };
    }
  }

  recordCompletion({
    player_id: player.id,
    quest_id: quest.id,
    quest_number: quest.number,
    points: quest.points,
    // Le détail du barème est écrit par recomputeScore juste après, qui est
    // la seule source de vérité : on ne fige ici aucun bonus calculé à la
    // main, pour éviter deux chiffres qui divergeraient.
    speed_bonus: 0,
    wrong_flags: wrong,
    time_ms: timeMs,
    status: requireAttestation ? 'pending' : 'done',
  });

  if (requireAttestation) {
    logEvent(player.id, 'pending', quest.id);
    return { status: 'pending', rank: 0, result: null, timeMs };
  }

  const result = recomputeScore(player.id);
  const rank = result?.breakdown?.at(-1)?.rank ?? 1;
  markSubmitTime(player.id, at.slice(11, 19));
  logEvent(player.id, 'submit', `${quest.id} rank=${rank}`);
  return { status: 'done', rank, result, timeMs };
});

export const submitQuest = (args) => record(args);

/** L'enseignant appose son attestation : la quête passe en `done` et est scorée. */
export const attest = db.transaction(({ player, questId }) => {
  const row = db.prepare('SELECT * FROM completions WHERE player_id = ? AND quest_id = ?')
    .get(player.id, questId);
  if (!row) return null;
  if (row.status === 'done') return { already: true, score: player.score };
  setCompletionStatus(player.id, questId, 'done');
  logEvent(player.id, 'attested', questId);
  const result = recomputeScore(player.id);
  return { already: false, score: result.score };
});

export function announceAfter(playerId) {
  const fresh = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
  announce(`player:${fresh?.team ?? playerId}`);
  return fresh;
}

export { doneCount };