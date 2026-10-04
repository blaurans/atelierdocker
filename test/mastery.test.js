/**
 * Maîtrise — les trois ratios et le niveau.
 *
 * Ces tests portent sur ce qui a remplacé le score, donc sur la seule chose
 * que la V2 affiche à la place d'un classement. Ils sont stricts sur deux
 * points qui seraient des bugs silencieux : le dénominateur (toujours le jeu
 * entier, jamais le nombre de quêtes faites) et l'impossibilité d'atteindre
 * un haut niveau avec un jeu à peine commencé.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mastery, cohort, levelFor, LEVELS } from '../src/mastery.js';

const completion = (over = {}) => ({
  module: 1,
  hints_used: 0,
  check_ok: 1,
  recall_ok: 1,
  ...over,
});

const byModule = { 1: 4, 2: 3 };

test('maîtrise : rien fait, tout à zéro', () => {
  const m = mastery({ completions: [], totalQuests: 7, byModule });
  assert.equal(m.done, 0);
  assert.equal(m.autonomous, 0);
  // Les ratios d'autonomie sont calculés sur les quêtes *achevées*. À zéro
  // validation, ils sont à 0 et pas « indéfinis » — sinon un élève
  // fraîchement inscrit afficherait 100 % d'autonomie.
  assert.equal(m.autonomy_ratio, 0);
  assert.equal(m.progress_ratio, 0);
  assert.equal(m.level.key, LEVELS[0].key);
});

test('maîtrise : le dénominateur est le jeu entier, pas les validations', () => {
  const m = mastery({ completions: [completion(), completion()], totalQuests: 26, byModule });
  assert.equal(m.done, 2);
  // 2/26, pas 2/2. C'est l'erreur la plus facile à écrire et la plus grave :
  // elle afficherait 100 % de progression à mi-parcours.
  assert.equal(m.progress_ratio, 0.08);
});

test('maîtrise : une quête sans indice vaut pour l\'autonomie', () => {
  const m = mastery({
    completions: [completion(), completion({ hints_used: 1 }), completion({ hints_used: 3 })],
    totalQuests: 3,
    byModule,
  });
  assert.equal(m.hints_used, 4);
  assert.equal(m.autonomous, 1);
  assert.equal(m.autonomy_ratio, 0.33);
});

test('maîtrise : le QCM raté se voit dans le ratio de compréhension', () => {
  const m = mastery({
    completions: [completion({ check_ok: 0 }), completion(), completion()],
    totalQuests: 3,
    byModule,
  });
  assert.equal(m.understood, 2);
  assert.equal(m.comprehension_ratio, 0.67);
});

test('maîtrise : impossible d\'être « Maîtrise » avec un jeu à peine commencé', () => {
  // Une quête sur 26, sans indice : autonomie 100 %, progression 4 %.
  // Le niveau doit rester au premier palier — sinon le portail affiche
  // « Maîtrise » dès la première quête, et le mot perd tout son sens.
  const m = mastery({ completions: [completion()], totalQuests: 26, byModule });
  assert.equal(m.autonomy_ratio, 1);
  assert.equal(m.progress_ratio, 0.04);
  assert.equal(m.level.key, LEVELS[0].key, 'l\'avancement plafonne le niveau');
});

test('maîtrise : l\'autonomie plafonne aussi le niveau', () => {
  // 100 % d'avancement, mais deux indices à chaque quête : autonomie nulle.
  // L'élève a tout fait, mais jamais seul. C'est le cœur du jeu.
  const done = Array.from({ length: 10 }, () => completion({ hints_used: 2 }));
  const m = mastery({ completions: done, totalQuests: 10, byModule });
  assert.equal(m.progress_ratio, 1);
  assert.equal(m.autonomy_ratio, 0);
  assert.equal(m.level.key, 'debout');
});

test('maîtrise : le niveau exige les deux seuils', () => {
  assert.equal(levelFor(0, 0).key, 'debout');
  assert.equal(levelFor(0.2, 0.04).key, 'debout', 'autonomie suffisante, avancement non');
  assert.equal(levelFor(0.2, 0.2).key, 'ranim');
  assert.equal(levelFor(0.6, 0.2).key, 'ranim', 'autonomie suffisante, avancement non');
  assert.equal(levelFor(0.6, 0.3).key, 'autonome');
  assert.equal(levelFor(0.8, 0.6).key, 'travailleur');
  assert.equal(levelFor(0.95, 0.85).key, 'maitre');
  // Un ratio aberrant ne doit pas faire sauter la table.
  assert.equal(levelFor(2, 2).key, 'maitre');
  assert.equal(levelFor(NaN, NaN).key, 'debout');
});

test('maîtrise : le détail par atelier se calcule atelier par atelier', () => {
  const m = mastery({
    completions: [
      completion({ module: 1 }), completion({ module: 1, hints_used: 2 }),
      completion({ module: 2 }), completion({ module: 2 }), completion({ module: 2 }),
    ],
    totalQuests: 7,
    byModule,
  });
  const [m1, m2] = m.modules;
  assert.equal(m1.done, 2);
  assert.equal(m1.total, 4);
  assert.equal(m1.ratio, 0.5);
  assert.equal(m1.autonomous, 1);
  assert.equal(m1.autonomy_ratio, 0.5);

  assert.equal(m2.done, 3);
  assert.equal(m2.total, 3);
  assert.equal(m2.ratio, 1);
  assert.equal(m2.autonomous, 3);
});

test('maîtrise : les ratios sont arrondis à deux décimales', () => {
  const m = mastery({ completions: [completion(), completion(), completion()], totalQuests: 7 });
  assert.equal(m.progress_ratio, 0.43);
  assert.equal(m.autonomy_ratio, 1);
});

test('maîtrise : pas de comparaison entre élèves', () => {
  // Deux élèves, mêmes quêtes, ordres inversés : le résultat est identique.
  const un = mastery({ completions: [completion({ hints_used: 2 }), completion()], totalQuests: 4 });
  const deux = mastery({ completions: [completion(), completion({ hints_used: 2 })], totalQuests: 4 });
  assert.deepEqual(un, deux);
});

test('promotion : les ratios se moyennent, sans exposer les joueurs', () => {
  const rows = [
    completion(), completion(), completion(),          // autonome
    completion({ hints_used: 1 }), completion({ hints_used: 1 }),
    completion({ hints_used: 3 }),
  ];
  const c = cohort(rows, 7);
  assert.equal(c.players, 6);
  assert.equal(c.average_hints, 0.83);
  assert.equal(c.average_autonomy, 0.5);
  // Aucun nom d'équipe dans la synthèse : c'est une vue d'ensemble, pas un
  // classement déguisé.
  assert.equal(Object.keys(c).includes('players_list'), false);
});

test('promotion : l\'atelier le plus costly en indices est remonté', () => {
  const rows = [
    completion({ module: 1 }),
    completion({ module: 2, hints_used: 5 }),
    completion({ module: 2, hints_used: 4 }),
  ];
  const c = cohort(rows, 7);
  assert.equal(c.hardest[0].module, 2);
  assert.equal(c.hardest[0].hints, 9);
});

test('promotion : une promotion vide ne divise pas par zéro', () => {
  const c = cohort([], 7);
  assert.equal(c.players, 0);
  assert.equal(c.average_autonomy, 0);
  assert.equal(c.average_hints, 0);
  assert.deepEqual(c.hardest, []);
});

test('maîtrise : des lignes sans les nouvelles colonnes ne plantent pas', () => {
  // Une base créée avant la V2 : `hints_used` et `check_ok` n'existent pas
  // dans les lignes lues. Le module doit les lire comme absents, pas planter.
  const m = mastery({ completions: [{ module: 1 }], totalQuests: 3, byModule });
  assert.equal(m.hints_used, 0);
  assert.equal(m.autonomous, 1);
  assert.equal(m.understood, 0);
});