/**
 * Accès aux tables qui portent la maîtrise : indices consommés et tentatives
 * de compréhension.
 *
 * Isolé de `repo/arena.js` parce que ce sont des tables qui n'existaient pas
 * en V1 et qui ne servent qu'à deux endpoints. Les garder à part rend la
 * frontière lisible : si un jour on les supprime, c'est ce fichier qui
 * disparaît.
 */
import { db, now } from '../db.js';

/**
 * Indices déjà pris par ce joueur sur cette quête.
 *
 * Le résultat est utilisé deux fois : pour savoir quel est le prochain indice
 * à servir, et pour ne pas le facturer deux fois. C'est la ligne en base
 * qui fait foi, pas l'état du client.
 */
export function hintsUsed(playerId, questId) {
  return db.prepare(
    'SELECT COUNT(*) AS n FROM hint_uses WHERE player_id = ? AND quest_id = ?'
  ).get(playerId, questId).n;
}

export function chargesSoFar(playerId, questId) {
  return db.prepare(
    'SELECT COUNT(*) AS n FROM hint_uses WHERE player_id = ? AND quest_id = ? AND charged = 1'
  ).get(playerId, questId).n;
}

/**
 * Enregistre la consommation d'un indice et renvoie ce qu'il a coûté.
 *
 * Idempotent : rejouer la même demande ne coûte rien et ne duplique pas la
 * ligne. Un élève qui reclique trois fois sur « indice suivant » ne doit pas
 * perdre trois fois son autonomie.
 *
 * @returns {{already:boolean, charged:number, nextIndex:number|null, autonomyLost:number}}
 */
export function consumeHint({ playerId, questId, hintIndex, autonomyLost, charged }) {
  const existing = db.prepare(
    'SELECT charged FROM hint_uses WHERE player_id = ? AND quest_id = ? AND hint_index = ?'
  ).get(playerId, questId, hintIndex);

  if (existing) {
    return { already: true, charged: 0, nextIndex: hintIndex + 1, autonomyLost: 0 };
  }

  db.prepare(
    `INSERT INTO hint_uses (player_id, quest_id, hint_index, charged, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(playerId, questId, hintIndex, charged ? 1 : 0, now());

  return { already: false, charged: charged ? 1 : 0, nextIndex: hintIndex + 1, autonomyLost };
}

/**
 * Enregistre une réponse à une question de compréhension ou de réflexe.
 *
 * On conserve la *dernière* réponse, mais on compte les tentatives : c'est ce
 * décompte qui dit à l'enseignant qu'un élève a cherché. Une bonne réponse
 * suivie de trois mauvaises reste « juste » au tableau de bord, avec
 * `attempts: 4` — l'info utile est là.
 *
 * @returns {{correct:boolean, attempts:number, changed:boolean}}
 */
export function recordAttempt({ playerId, questId, kind, itemId, answer, correct }) {
  const prev = db.prepare(
    `SELECT correct, attempts FROM attempts
      WHERE player_id = ? AND quest_id = ? AND kind = ? AND item_id = ?`
  ).get(playerId, questId, kind, itemId);

  const attempts = (prev?.attempts ?? 0) + 1;
  const wasCorrect = prev ? prev.correct === 1 : false;
  const nowIso = now();

  if (prev) {
    // Une réponse correcte ne se dégrade jamais : un élève qui a trouvé puis
    // puis oublié en recopiant ne doit pas perdre son point.
    const keep = wasCorrect || correct;
    db.prepare(
      `UPDATE attempts SET answer = ?, correct = ?, attempts = ?, updated_at = ?
        WHERE player_id = ? AND quest_id = ? AND kind = ? AND item_id = ?`
    ).run(String(answer).slice(0, 200), keep ? 1 : 0, attempts, nowIso,
      playerId, questId, kind, itemId);
    return { correct: keep, attempts, changed: !wasCorrect && keep };
  }

  db.prepare(
    `INSERT INTO attempts (player_id, quest_id, kind, item_id, answer, correct, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(playerId, questId, kind, itemId, String(answer).slice(0, 200),
    correct ? 1 : 0, attempts, nowIso, nowIso);

  return { correct, attempts, changed: correct };
}

/** Réponses déjà données sur cette quête, pour que le client puisse les reafficher. */
export function attemptsFor(playerId, questId) {
  return db.prepare(
    `SELECT kind, item_id, answer, correct, attempts FROM attempts
      WHERE player_id = ? AND quest_id = ?`
  ).all(playerId, questId)
    .map((r) => ({
      kind: r.kind,
      item_id: r.item_id,
      answer: r.answer,
      correct: r.correct === 1,
      attempts: r.attempts,
    }));
}

/** Le joueur a-t-il répondu juste du premier coup à toutes les questions requises ? */
export function checksPassedFirstTry(playerId, quest, hints = 0) {
  const required = (quest.check ?? []).filter((c) => c.required);
  const recall = quest.recall ? [{ id: quest.recall.id, required: true }] : [];

  if (required.length === 0 && recall.length === 0) return true;

  const rows = db.prepare(
    `SELECT kind, item_id, correct, attempts FROM attempts
      WHERE player_id = ? AND quest_id = ?`
  ).all(playerId, quest.id);

  const byId = new Map(rows.map((r) => [`${r.kind}:${r.item_id}`, r]));

  const all = [...required.map((c) => ({ kind: 'check', id: c.id })), ...recall.map((r) => ({ kind: 'recall', id: r.id }))];

  return all.every((item) => {
    const row = byId.get(`${item.kind}:${item.id}`);
    return row && row.correct === 1;
  });
}