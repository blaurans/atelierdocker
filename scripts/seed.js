#!/usr/bin/env node
/**
 * Réinitialise la base de l'arène.
 *
 *   node scripts/seed.js              # ne fait rien si la base existe
 *   node scripts/seed.js --force      # repart de zéro (lanceurs en salle)
 *   node scripts/seed.js --demo       # crée quelques joueurs de démonstration
 *
 * Par défaut le script refuse d'effacer une base existante : c'est le genre
 * d'outil qu'on lance un vendredi soir par erreur.
 */
import { db, log } from '../src/db.js';
import { wipe, createPlayer, counts } from '../src/repo/arena.js';
import { quests, reloadQuestpack } from '../src/questpack.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const demo = args.includes('--demo');

const pack = args.includes('--reload') ? await reloadQuestpack() : quests();
const before = counts();

log('──────────────────────────────────────────────');
log('🐳  Atelier Docker — préparation de la base');
log(`📚  ${pack.modules.length} modules · ${pack.totalQuests} quêtes · ${pack.totalPoints} points`);
log(`🗄️   joueurs: ${before.players} · validations: ${before.completions}`);

if (before.players > 0 && !force) {
  log('⚠️  La base contient déjà des joueurs.');
  log('   Relance avec --force pour tout effacer, ou laisse tomber si c\'est voulu.');
  process.exit(0);
}

if (force && before.players > 0) {
  wipe();
  log('🧹  Base réinitialisée.');
}

if (demo) {
  const joueurs = [
    ['CyberPhoenix', 'competitive'],
    ['NightOwl', 'competitive'],
    ['LesPostLocal', 'competitive'],
    ['Alice_Bob', 'normal'],
    ['Chloe_Marc', 'normal'],
  ];
  for (const [team, mode] of joueurs) {
    const p = createPlayer({ team, mode, secret: 'demo' });
    log(`👤  ${team} (${mode}) — token ${p.token}`);
  }
  log('🔑  secret des joueurs de démo : « demo »');
}

const after = counts();
log(`✅  Prêt : ${after.players} joueur(s), ${after.completions} validation(s).`);
log('──────────────────────────────────────────────');
db.close();