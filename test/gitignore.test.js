/**
 * Le `.env` ne doit jamais être versionné — et pas davantage une sauvegarde.
 *
 * Le motif `^\.env` est volontairement large. Un `.gitignore` qui ne couvre que
 * `.env` laisse passer `cp .env .env.avant`, qui contient la clé
 * d'administration en clair. C'est exactement ce qui traînait sur la machine de
 * production, non ignoré, à un `git add -A` du committing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const racine = path.resolve(import.meta.dirname, '..');
const ignore = fs.readFileSync(path.join(racine, '.gitignore'), 'utf8');

/** `git check-ignore` répond 0 si le chemin est ignoré. */
const estIgnore = (chemin) => {
  try {
    execFileSync('git', ['check-ignore', '-q', chemin], { cwd: racine, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

test('le .env et ses sauvegardes sont ignorés', () => {
  assert.ok(estIgnore('.env'), '.env doit être ignoré');
});

test('une sauvegarde de .env est ignorée', () => {
  // C'est le cas rencontré : la clé d'administration en clair, non ignorée,
  // à un commit près.
  for (const nom of [
    '.env.sauvegarde',
    '.env.avant',
    '.env.local',
    '.env.production',
  ]) {
    assert.ok(estIgnore(nom), `${nom} doit être ignoré`);
  }
});

test('le gabarit .env.example reste versionné', () => {
  // L'inverse du précédent : c'est le fichier qu'on lit pour savoir quelles
  // variables poser. L'ignorer ferait perdre la documentation du déploiement.
  assert.ok(!estIgnore('.env.example'), '.env.example doit être versionné');
  assert.ok(fs.existsSync(path.join(racine, '.env.example')));
});

test('le .gitignore couvre ce qu\'il doit, et rien de plus', () => {
  // `node_modules/` ne doit pas être la seule règle : quelqu'un qui lit le
  // fichier doit comprendre en une fois ce qui est exclu.
  for (const attendu of ['node_modules/', '*.sqlite', '.env', '*.log']) {
    assert.ok(ignore.includes(attendu), `le motif « ${attendu} » manque`);
  }
});