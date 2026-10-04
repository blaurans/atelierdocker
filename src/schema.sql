-- Atelier Docker — schéma de la base
-- Compatible SQLite 3.24+ (migrations appliquées par src/db.js).

CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY,
  team          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  -- Les valeurs restent « competitive » / « normal » : c'est un contrat
  -- d'API, et les élèves s'inscrivent en ligne de commande avec
  -- `{"mode":"competitive"}`. Le libellé affiché est « Challenge » et
  -- « Sans stress » (voir config.js MODES) — l'URL dit la mécanique, l'écran
  -- dit ce que ça veut dire.
  mode          TEXT    NOT NULL CHECK (mode IN ('competitive', 'normal')),
  token         TEXT    NOT NULL UNIQUE,
  secret        TEXT    NOT NULL DEFAULT '',
  score         INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  registered_at TEXT    NOT NULL,          -- HH:MM:SS, pour l'affichage du portail
  last_seen     TEXT    NOT NULL,
  last_ip       TEXT    NOT NULL DEFAULT '',   -- poste du dernier appel
  last_submit   TEXT    NOT NULL DEFAULT '-',
  last_submit_at TEXT,                       -- même chose en ISO complet (UTC)
  finished_at   TEXT,
  attested      TEXT    NOT NULL DEFAULT ''  -- JSON: { questId: true }
);

-- Chaque ligne = une quête validée par un joueur. La contrainte UNIQUE
-- est la source de vérité anti-double-validation (l'API renvoie
-- déjà_submitted plutôt que de laisser passer un doublon).
--
-- `hints_used` est le nombre d'indices consommés SUR CETTE QUÊTE : c'est la
-- mesure d'autonomie. Une quête validée sans indice compte pour la maîtrise
-- « autonome ». Une quête validée après trois indices compte pour la
-- progression, pas pour l'autonomie.
--
-- `check_ok` vaut 1 si les questions de compréhension obligatoires ont été
-- réussies. `recall_ok` vaut 1 si le élève a su restituer le réflexe demandé.
-- Ces deux colonnes sont écrites à la validation, jamais recalculées : une
-- réponse juste l'est au moment où elle est donnée.
CREATE TABLE IF NOT EXISTS completions (
  id            INTEGER PRIMARY KEY,
  player_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quest_id      TEXT    NOT NULL,
  quest_number  INTEGER NOT NULL,          -- n° de quête dans le parcours (1..N)
  points        INTEGER NOT NULL,
  speed_bonus   INTEGER NOT NULL DEFAULT 0,
  pace_bonus    INTEGER NOT NULL DEFAULT 0,
  penalty       INTEGER NOT NULL DEFAULT 0,
  wrong_flags   INTEGER NOT NULL DEFAULT 0,
  time_ms       INTEGER,                   -- null si la quête n'a pas été chronométrée
  hints_used    INTEGER NOT NULL DEFAULT 0,
  check_ok      INTEGER NOT NULL DEFAULT 0,
  recall_ok     INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'done'
                        CHECK (status IN ('done', 'pending')),
  completed_at  TEXT    NOT NULL,
  completed_hh  TEXT    NOT NULL,
  UNIQUE (player_id, quest_id)
);

CREATE INDEX IF NOT EXISTS idx_completions_player ON completions(player_id, completed_at);

-- ── Indices consommés ────────────────────────────────────────────────────────
-- Une ligne par indice demandé. L'UNIQUE(player_id, quest_id, hint_index)
-- est ce qui empêche qu'un double-clic sur le bouton ne facture deux fois le
-- même indice : la demande est idempotente au niveau de la base, pas du
-- client. C'est le serveur qui décide si l'indice est encore disponible —
-- le client ne fait que demander.
CREATE TABLE IF NOT EXISTS hint_uses (
  id          INTEGER PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quest_id    TEXT    NOT NULL,
  hint_index  INTEGER NOT NULL,           -- 0-based : indice n° hint_index+1
  charged     INTEGER NOT NULL DEFAULT 1, -- 0 pour le dernier indice, offert
  created_at  TEXT    NOT NULL,
  UNIQUE (player_id, quest_id, hint_index)
);

CREATE INDEX IF NOT EXISTS idx_hint_uses_player ON hint_uses(player_id, quest_id);

-- ── Compréhension vérifiée ──────────────────────────────────────────────────
-- Une ligne par réponse à une question de compréhension ou de réflexe.
-- Toutes les tentatives sont conservées : l'enseignant a besoin de voir
-- combien de fois l'élève a hésité, pas seulement s'il a fini par trouver.
-- La validation n'est PAS bloquante — c'est délibéré : on ne punit pas
-- un élève qui a cherché, sinon il cherchera moins pour ne pas se tromper.
CREATE TABLE IF NOT EXISTS attempts (
  id          INTEGER PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quest_id    TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('check', 'recall')),
  item_id     TEXT    NOT NULL,           -- quel question / quel réflexe
  answer      TEXT    NOT NULL,           -- ce que l'élève a répondu
  correct     INTEGER NOT NULL,           -- 0 ou 1
  attempts    INTEGER NOT NULL DEFAULT 1, -- nombre de tentatives pour cet item
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  UNIQUE (player_id, quest_id, kind, item_id)
);

CREATE INDEX IF NOT EXISTS idx_attempts_player ON attempts(player_id, quest_id);

-- Journal : sert au débogage et au tableau de bord enseignant.
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY,
  player_id  INTEGER REFERENCES players(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL,
  detail     TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_player ON events(player_id, id DESC);