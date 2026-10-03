-- Docker Ops Race — schéma de la base
-- Compatible SQLite 3.24+ (migrations appliquées par src/db.js).

CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY,
  team          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  mode          TEXT    NOT NULL CHECK (mode IN ('competitive', 'normal')),
  token         TEXT    NOT NULL UNIQUE,
  secret        TEXT    NOT NULL DEFAULT '',
  score         INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  registered_at TEXT    NOT NULL,          -- HH:MM:SS, pour l'affichage du portail
  last_seen     TEXT    NOT NULL,
  last_submit   TEXT    NOT NULL DEFAULT '-',
  finished_at   TEXT,
  attested      TEXT    NOT NULL DEFAULT ''  -- JSON: { questId: true }
);

-- Chaque ligne = une quête validée par un joueur. La contrainte UNIQUE
-- est la source de vérité anti-double-validation (l'API renvoie
-- déjà_submitted plutôt que de laisser passer un doublon).
CREATE TABLE IF NOT EXISTS completions (
  id            INTEGER PRIMARY KEY,
  player_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quest_id      TEXT    NOT NULL,
  quest_number  INTEGER NOT NULL,          -- n° de quête dans le parcours (1..N)
  points        INTEGER NOT NULL,
  speed_bonus   INTEGER NOT NULL DEFAULT 0,
  -- Détail du barème, écrit par recomputeScore (src/progress.js), qui est la
  -- seule source de vérité : ces colonnes sont un cache d'affichage.
  pace_bonus    INTEGER NOT NULL DEFAULT 0,
  penalty       INTEGER NOT NULL DEFAULT 0,
  wrong_flags   INTEGER NOT NULL DEFAULT 0,
  time_ms       INTEGER,                   -- null si la quête n'a pas été chronométrée
  status        TEXT    NOT NULL DEFAULT 'done'
                        CHECK (status IN ('done', 'pending')),
  completed_at  TEXT    NOT NULL,
  completed_hh  TEXT    NOT NULL,
  UNIQUE (player_id, quest_id)
);

CREATE INDEX IF NOT EXISTS idx_completions_player ON completions(player_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_players_mode      ON players(mode, score DESC);

-- Journal : sert au débogage et au tableau de bord enseignant.
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY,
  player_id  INTEGER REFERENCES players(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL,
  detail     TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_player ON events(player_id, id DESC);