import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config, ROOT } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

/**
 * Base sur `node:sqlite`, le module natif de Node (>= 22, stable depuis 24).
 *
 * Choix : plutôt que `better-sqlite3`, on utilise le module natif. Zéro
 * dépendance à compiler, donc une image Docker qui n'a besoin ni de
 * `python3`, ni de `make`, ni de `g++` — le portail se copie et se construit
 * partout où Docker existe.
 *
 * Le wrapper ci-dessous reproduit les trois rares methods de better-sqlite3
 * utilisées dans ce projet (`pragma`, `transaction` imbriquable, `prepare`)
 * afin que la couche repository reste lisible.
 */
const raw = new DatabaseSync(config.dbFile);

let depth = 0;

raw.exec('PRAGMA journal_mode = WAL');
raw.exec('PRAGMA foreign_keys = ON');
raw.exec('PRAGMA busy_timeout = 5000');
raw.exec('PRAGMA synchronous = NORMAL');

export const db = {
  prepare: (sql) => raw.prepare(sql),
  exec: (sql) => raw.exec(sql),
  close: () => raw.close(),

  pragma: (statement) => {
    raw.exec(`PRAGMA ${statement}`);
  },

  /**
   * `better-sqlite3` refuse d'imbriquer les transactions. Ici on utilise un
   * compteur de profondeur : le niveau 0 ouvre un BEGIN/COMMIT, les niveaux
   * suivants utilisent un SAVEPOINT. `recomputeScore`, appelé depuis une
   * transaction de `submitQuest`, dépend de ce comportement.
   */
  transaction(fn) {
    return (...args) => {
      const savepoint = `sp_${depth}`;
      if (depth === 0) raw.exec('BEGIN');
      else raw.exec(`SAVEPOINT ${savepoint}`);
      depth += 1;
      try {
        const result = fn(...args);
        depth -= 1;
        if (depth === 0) raw.exec('COMMIT');
        else raw.exec(`RELEASE ${savepoint}`);
        return result;
      } catch (err) {
        depth -= 1;
        if (depth === 0) raw.exec('ROLLBACK');
        else raw.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
        throw err;
      }
    };
  },
};

/** Horloge du jeu : une seule source de temps pour toute l'application. */
export const now = () => new Date().toISOString();

/** Format HH:MM:SS utilisé partout dans le portail (cf. cahier des charges). */
export const clock = (d = new Date()) => d.toTimeString().slice(0, 8);

export const newToken = () => `dq_${crypto.randomBytes(20).toString('hex')}`;

export const log = (...args) => {
  if (process.env.QUIET) return;
  console.log(`[${clock()}]`, ...args);
};

fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  .split(';')
  .map((s) => s.replace(/--[^\n]*/g, '').trim())
  .filter(Boolean)
  .forEach((stmt) => raw.exec(stmt));

/**
 * Migrations « j'ajoute une colonne ».
 *
 * `CREATE TABLE IF NOT EXISTS` ne modifie pas une table existante : une base
 * créée avant une évolution resterait sans la nouvelle colonne, et le premier
 * `SELECT` lèverait une erreur. On ajoute donc les colonnes manquantes au
 * démarrage, ce qui rend le déploiement d'une version à l'autre sans étape
 * manuelle.
 */
function ajouterColonneSiAbsente(table, colonne, definition) {
  const colonnes = raw.prepare(`PRAGMA table_info(${table})`).all();
  if (colonnes.some((c) => c.name === colonne)) return false;
  raw.exec(`ALTER TABLE ${table} ADD COLUMN ${colonne} ${definition}`);
  log(`migration : ${table}.${colonne} ajoutée`);
  return true;
}

ajouterColonneSiAbsente('players', 'last_ip', "TEXT NOT NULL DEFAULT ''");
ajouterColonneSiAbsente('players', 'last_submit_at', 'TEXT');

export { config, ROOT };