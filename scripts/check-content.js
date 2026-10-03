#!/usr/bin/env node
/**
 * Vérifie que chaque fichier de quêtes est du JavaScript syntaxiquement valide
 * et chargeable. À lancer après une édition de contenu : `node --check` seul
 * ne suffit pas, il faut aussi l'import dynamique réellement exécuté par
 * src/questpack.js.
 *
 *   node scripts/check-content.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = path.resolve(process.argv[2] ?? 'content/quests');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^m\d+\.js$/.test(f)) : [];

if (!files.length) {
  console.error(`Aucun fichier de quêtes dans ${dir}`);
  process.exit(1);
}

let bad = 0;

for (const file of files) {
  const full = path.join(dir, file);
  process.stdout.write(`${file.padEnd(10)} `);
  try {
    const mod = await import(pathToFileURL(full).href);
    const pack = mod.default;
    const n = pack?.quests?.length ?? 0;
    const title = pack?.meta?.title ?? '(sans titre)';
    console.log(`✅ ${String(n).padStart(2)} quêtes — ${title}`);
  } catch (err) {
    bad += 1;
    const line = (err.stack ?? '').split('\n').find((l) => l.includes(file)) ?? '';
    const where = line.trim().replace(`${full}:`, '');
    console.log(`❌ ${err.message}`);
    if (where) console.log(`           ${where}`);
  }
}

console.log(bad ? `\n${bad} fichier(s) illisible(s).` : '\nTous les fichiers de quêtes sont valides.');
process.exit(bad ? 1 : 0);