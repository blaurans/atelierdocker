/**
 * Migration : une base créée par une version antérieure doit accepter le code
 * d'aujourd'hui.
 *
 * Le test reproduit exactement le déploiement raté du premier passage en V2 : la
 * base est créée avec le schéma V1 (sans `hints_used`, `check_ok`, `recall_ok`,
 * sans `hint_uses` ni `attempts`), puis le serveur de la version actuelle se
 * connecte dessus. Sans migration, `INSERT INTO completions` échoue sur une
 * colonne absente et le conteneur redémarre en boucle — sans message parlant de
 * migration, seulement « no column named hints_used ».
 *
 * C'est le genre de bug qu'aucun test ne trouve si la base de test est
 * toujours neuve : `CREATE TABLE IF NOT EXISTS` crée les colonnes, et tout se
 * passe bien. Il faut donc partir d'une base *vraiment* ancienne.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RACINE = path.resolve(import.meta.dirname, '..');
const V1 = fs.readFileSync(path.join(RACINE, 'src/schema.sql'), 'utf8');

test('une base V1 se met à niveau au démarrage', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-migration-'));
  const fichier = path.join(dir, 'v1.sqlite');

  const { DatabaseSync } = await import('node:sqlite');
  const ancien = new DatabaseSync(fichier);

  // On rejoue le schéma V1 : mêmes tables, mais sans les colonnes de maîtrise
  // et sans les tables `hint_uses` / `attempts`.
  ancien.exec(V1
    // Les trois colonnes ajoutées en V2.
    .replace(/\n\s*hints_used\s+INTEGER[^,]*,\n/, '\n')
    .replace(/\n\s*check_ok\s+INTEGER[^,]*,\n/, '\n')
    .replace(/\n\s*recall_ok\s+INTEGER[^,]*,\n/, '\n')
    .replace(/\n\s*hints_charged\s+INTEGER[^,]*,\n/, '\n')
    // Et les deux tables. Le motif va jusqu'au `;` de fin d'instruction, ce
    // qui emporte aussi les `CREATE INDEX` qui suivent.
    .replace(/CREATE TABLE IF NOT EXISTS hint_uses[\s\S]*?;/g, '')
    .replace(/CREATE TABLE IF NOT EXISTS attempts[\s\S]*?;/g, '')
    .replace(/CREATE INDEX IF NOT EXISTS idx_hint_uses_player[^;]*;/g, '')
    .replace(/CREATE INDEX IF NOT EXISTS idx_attempts_player[^;]*;/g, ''));

  const avant = ancien.prepare('PRAGMA table_info(completions)').all().map((c) => c.name);
  assert.ok(!avant.includes('hints_used'), 'la base de départ doit être une base V1');

  const tables = ancien.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  assert.ok(!tables.includes('hint_uses'), 'la base de départ ne doit pas avoir hint_uses');

  ancien.exec(`
    INSERT INTO players (id, team, mode, token, secret, score, created_at,
                         registered_at, last_seen, last_ip, last_submit, attested)
    VALUES (1, 'Ancien', 'competitive', 'dq_v1', '', 340,
            '2026-01-01T10:00:00.000Z', '10:00:00', '2026-01-01T10:00:00.000Z', '', '-', '')
  `);
  ancien.close();

  // Le serveur de la version actuelle se connecte sur cette base.
  process.env.DB_FILE = fichier;
  process.env.QUIET = '1';
  const { db } = await import(`../src/db.js?t=${Date.now()}`);

  const apres = db.prepare('PRAGMA table_info(completions)').all().map((c) => c.name);
  // `hints_charged` est dans la liste : sans elle, l'insertion échouerait sur
  // « no column named hints_charged » et le conteneur bouclerait au démarrage.
  for (const col of ['hints_used', 'hints_charged', 'check_ok', 'recall_ok']) {
    assert.ok(apres.includes(col), `completions.${col} doit exister après migration`);
  }

  const tablesApres = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const t of ['hint_uses', 'attempts']) {
    assert.ok(tablesApres.includes(t), `la table ${t} doit être créée`);
  }

  // Le joueur V1 est intact, et ses colonnes V1 sont préservées.
  const joueur = db.prepare('SELECT * FROM players WHERE id = 1').get();
  assert.equal(joueur.team, 'Ancien');
  assert.equal(joueur.score, 340, 'la colonne score survit, pour ne pas perdre l\'historique');

  // Et surtout : l'insertion qui échouait doit maintenant passer.
  db.prepare(`
    INSERT INTO completions
      (player_id, quest_id, quest_number, points, wrong_flags, time_ms,
       hints_used, hints_charged, check_ok, recall_ok, status, completed_at, completed_hh)
    VALUES (1, 'm1-01-x', 1, 100, 0, 1000, 1, 1, 1, 0, 'done', '2026-01-01T10:05:00.000Z', '10:05:00')
  `).run();
  const ligne = db.prepare('SELECT * FROM completions WHERE quest_id = ?').get('m1-01-x');
  assert.equal(ligne.hints_used, 1);
  assert.equal(ligne.hints_charged, 1);
  // Les colonnes de barème V1 gardent leur valeur par défaut, pas NULL.
  assert.equal(ligne.speed_bonus, 0);

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('la migration est idempotente', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-migration2-'));
  const fichier = path.join(dir, 'neuf.sqlite');
  process.env.DB_FILE = fichier;
  process.env.QUIET = '1';

  const { db } = await import(`../src/db.js?t=${Date.now()}`);
  const une = db.prepare('PRAGMA table_info(completions)').all().length;
  db.close();

  const { db: db2 } = await import(`../src/db.js?t=${Date.now()}-bis`);
  const deux = db2.prepare('PRAGMA table_info(completions)').all().length;
  db2.close();

  assert.equal(une, deux, 'un second démarrage ne doit rien ajouter');

  fs.rmSync(dir, { recursive: true, force: true });
});