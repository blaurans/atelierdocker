import { db, now, clock, newToken } from '../db.js';

/* ------------------------------------------------------------------ players */

const insertPlayer = db.prepare(`
  INSERT INTO players (team, mode, token, secret, last_ip, created_at, registered_at, last_seen)
  VALUES (@team, @mode, @token, @secret, @ip, @at, @hh, @at)
`);

const byTeam = db.prepare('SELECT * FROM players WHERE team = ? COLLATE NOCASE');
const byToken = db.prepare('SELECT * FROM players WHERE token = ?');

export const findByTeam = (team) => byTeam.get(String(team ?? '').trim());
export const findByToken = (token) => (token ? byToken.get(String(token).trim()) : undefined);

export function createPlayer({ team, mode, secret = '', ip = '' }) {
  const at = now();
  const hh = clock();
  const info = insertPlayer.run({
    team: team.trim(),
    mode,
    token: newToken(),
    secret: secret || '',
    ip: ip || '',
    at,
    hh,
  });
  return db.prepare('SELECT * FROM players WHERE id = ?').get(info.lastInsertRowid);
}

export function touch(id, ip = null) {
  if (ip) {
    db.prepare('UPDATE players SET last_seen = ?, last_ip = ? WHERE id = ?')
      .run(now(), ip, id);
  } else {
    db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(now(), id);
  }
}

/**
 * Score cumulé.
 *
 * Conservé en base, mais plus écrit par le jeu : la V2 ne classe plus les
 * élèves. La colonne reste parce que `resetPlayer` et l'export enseignant la
 * référencent encore, et parce qu'une base existante ne se migre pas en
 * supprimant une colonne. Rien dans le portail ne la lit.
 */

export function markFinished(id) {
  db.prepare('UPDATE players SET finished_at = ? WHERE id = ? AND finished_at IS NULL')
    .run(now(), id);
}

export function setMode(id, mode) {
  db.prepare('UPDATE players SET mode = ? WHERE id = ?').run(mode, id);
}

export const setSecret = (id, secret) =>
  db.prepare('UPDATE players SET secret = ? WHERE id = ?').run(secret ?? '', id);

export function setAttested(id, json) {
  db.prepare('UPDATE players SET attested = ? WHERE id = ?').run(json, id);
}

export const allPlayers = () =>
  db.prepare('SELECT * FROM players ORDER BY created_at').all();

export function deletePlayer(id) {
  db.prepare('DELETE FROM players WHERE id = ?').run(id);
}

/* -------------------------------------------------------------- completions */

/**
 * Insertion d'une validation.
 *
 * Ni `speed_bonus`, ni `pace_bonus`, ni `penalty` : ces colonnes sont celles
 * du barème V1, plus rien ne les écrit, et les laisser dans l'INSERT ferait
 * échouer la requête en NOT NULL — c'est exactement ce qui est arrivé. Elles
 * gardent leur DEFAULT 0 en base et les valeurs de la V1 pour les élèves qui
 * avaient commencé avant la bascule.
 */
const insertCompletion = db.prepare(`
  INSERT INTO completions
    (player_id, quest_id, quest_number, points, wrong_flags, time_ms,
     hints_used, hints_charged, check_ok, recall_ok, status, completed_at, completed_hh)
  VALUES
    (@player_id, @quest_id, @quest_number, @points, @wrong_flags, @time_ms,
     @hints_used, @hints_charged, @check_ok, @recall_ok, @status, @at, @hh)
`);

const hasCompletion = db.prepare('SELECT 1 FROM completions WHERE player_id = ? AND quest_id = ?');

/** Seules les validations effectives comptent : 'pending' est exclu. */
const completionsOf = db.prepare(
  `SELECT * FROM completions
    WHERE player_id = ? AND status = 'done'
    ORDER BY completed_at, id`
);
const pendingOf = db.prepare(
  `SELECT * FROM completions
    WHERE player_id = ? AND status = 'pending'
    ORDER BY completed_at, id`
);
const countCompletions = db.prepare(
  `SELECT COUNT(*) AS n FROM completions WHERE player_id = ? AND status = 'done'`
);
const countBadFlags = db.prepare(
  `SELECT COUNT(*) AS n FROM events WHERE player_id = ? AND kind = 'bad_flag'`
);

export const isDone = (playerId, questId) => !!hasCompletion.get(playerId, questId);
export const doneOf = (playerId) => completionsOf.all(playerId);
export const pendingOf_ = (playerId) => pendingOf.all(playerId);
export const doneCount = (playerId) => countCompletions.get(playerId).n;
export const wrongFlagCount = (playerId) => countBadFlags.get(playerId).n;

export const recordCompletion = (args) =>
  insertCompletion.run({
    time_ms: null,
    wrong_flags: 0,
    hints_used: 0,
    hints_charged: 0,
    check_ok: 0,
    recall_ok: 0,
    status: 'done',
    ...args,
    at: now(),
    hh: clock(),
  });

export const setCompletionStatus = (playerId, questId, status) =>
  db.prepare('UPDATE completions SET status = ? WHERE player_id = ? AND quest_id = ?')
    .run(status, playerId, questId);

export const markSubmitTime = (playerId, hh) =>
  db.prepare(
    'UPDATE players SET last_submit = ?, last_submit_at = ?, last_seen = ? WHERE id = ?',
  ).run(hh, now(), now(), playerId);

/* ------------------------------------------------------------------- events */

const insertEvent = db.prepare(
  'INSERT INTO events (player_id, kind, detail, created_at) VALUES (?, ?, ?, ?)'
);
export const logEvent = (playerId, kind, detail = '') => insertEvent.run(playerId, kind, String(detail).slice(0, 500), now());

export const eventsOf = (playerId, limit = 50) =>
  db.prepare('SELECT * FROM events WHERE player_id = ? ORDER BY id DESC LIMIT ?').all(playerId, limit);

export const allEvents = (limit = 200) =>
  db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit);

/* ------------------------------------------------------------------ cleanup */

export function resetPlayer(id) {
  const p = db.transaction(() => {
    db.prepare('DELETE FROM completions WHERE player_id = ?').run(id);
    db.prepare('DELETE FROM events WHERE player_id = ?').run(id);
    db.prepare(`UPDATE players SET score = 0, finished_at = NULL, last_submit = '-',
                last_submit_at = NULL, attested = '' WHERE id = ?`).run(id);
  });
  p();
}

export function wipe() {
  db.transaction(() => {
    db.prepare('DELETE FROM completions').run();
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM players').run();
  })();
}

export const counts = () => ({
  players: db.prepare('SELECT COUNT(*) AS n FROM players').get().n,
  completions: db.prepare('SELECT COUNT(*) AS n FROM completions').get().n,
});