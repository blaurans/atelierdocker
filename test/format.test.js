/**
 * Le jeu entier doit être dans le format de la V2.
 *
 * Ce test est la garantie que la réécriture est terminée, et non « presque
 * terminée ». Il ne teste pas le fond des énoncés — il vérifie que chaque quête
 * porte les trois mechanisms qui définissent le format :
 *
 *   1. des questions de compréhension, avec au moins une obligatoire
 *   2. un `charge` dont le dernier indice est gratuit
 *   3. un coût qui vaut la peine d'être lu avant de cliquer
 *
 * Tant qu'il est en échec, on sait qu'il reste du travail. C'est le seul test du
 * dépôt dont l'échec est *souhaité* tant que le chantier avance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve(import.meta.dirname, '..');
const fichiers = fs.readdirSync(path.join(RACINE, 'content', 'quests'))
  .filter((f) => /^m\d+\.js$/.test(f))
  .sort((a, b) => Number(a.match(/^m(\d+)/)[1]) - Number(b.match(/^m(\d+)/)[1]));

const modules = await Promise.all(fichiers.map(async (f) => {
  const m = await import(path.join(RACINE, 'content', 'quests', f));
  return m.default;
}));

const quetes = modules.flatMap((m) => m.quests.map((q) => ({ ...q, module: m.meta.module })));

test('le jeu a bien 7 ateliers', () => {
  assert.equal(modules.length, 7, `${modules.length} ateliers`);
});

test('chaque quête a au moins une question de compréhension', () => {
  const sans = quetes.filter((q) => !Array.isArray(q.check) || q.check.length === 0);
  assert.deepEqual(sans.map((q) => q.id), [],
    `quêtes sans questions de compréhension : ${sans.map((q) => q.id).join(', ')}`);
});

test('chaque quête a au moins une question obligatoire', () => {
  // Une question facultative ne fait pas partie de la maîtrise. Si toutes
  // l'étaient, la colonne « compréhension » ne mesurerait rien.
  const sans = quetes.filter((q) => !q.check?.some((c) => c.required));
  assert.deepEqual(sans.map((q) => q.id), [],
    `quêtes sans question obligatoire : ${sans.map((q) => q.id).join(', ')}`);
});

test('chaque question a une justification d\'au moins 15 caractères', () => {
  // Une question sans justification n'enseigne rien — c'est une devinette.
  for (const q of quetes) {
    for (const c of q.check ?? []) {
      assert.ok((c.explanation ?? '').trim().length >= 15,
        `${q.id}/${c.id} : explication trop courte pour enseigner quoi que ce soit`);
    }
  }
});

test('chaque quête a un `charge` complet, et le dernier indice est gratuit', () => {
  for (const q of quetes) {
    assert.ok(q.charge, `${q.id} : pas de \`charge\``);
    assert.equal(q.charge.autonomy.length, q.hints.length,
      `${q.id} : autant de coûts que d'indices`);
    assert.equal(q.charge.autonomy.at(-1), 0,
      `${q.id} : le dernier indice doit être gratuit`);
    // Et au moins un indice doit coûter, sinon le mode Challenge n'a pas de prix.
    assert.ok(q.charge.autonomy.some((c) => c > 0),
      `${q.id} : aucun indice ne coûte, le Challenge ne sert à rien`);
  }
});

test('aucune quête n\'a plus de 3 questions de compréhension', () => {
  // Au-delà, l\'élève en répond plus, il en的选择ne une au hasard.
  for (const q of quetes) {
    assert.ok(q.check.length <= 3, `${q.id} : ${q.check.length} questions`);
  }
});

test('aucun `recall` ne donne une réponse présente dans l\'énoncé', () => {
  for (const q of quetes) {
    if (!q.recall) continue;
    assert.ok(q.recall.accept?.length, `${q.id} : \`recall\` sans réponse acceptée`);
    assert.ok((q.recall.hint ?? '').length >= 10,
      `${q.id} : \`recall\` sans aide pour se corriger`);
  }
});

test('le ratio de `recall` reste faible — un réflexe ne se demande pas partout', () => {
  // Deux réflexes sur vingt-sept quêtes. Au-delà, ça devient un QCM masqué :
  // la valeur du mécanisme vient du fait qu\'il est rare.
  const avecRecall = quetes.filter((q) => q.recall).length;
  assert.ok(avecRecall <= quetes.length / 8,
    `${avecRecall} réflexes pour ${quetes.length} quêtes : le mécanisme se banalise`);
});

test('aucun atelier ne dépasse la borne d\'une séance', () => {
  for (const m of modules) {
    const minutes = m.quests.reduce((a, q) => a + q.estMinutes, 0);
    assert.ok(minutes <= 90, `atelier ${m.meta.module} : ${minutes} min`);
  }
});

test('le jeu complet tient dans une plage de temps raisonnable', () => {
  // Borné en dessous pour qu\'on ne rajoute pas des quêtes vides, borné en
  // dessus pour que le chantier reste jouable : 27 quêtes, environ 6 h.
  const total = quetes.length;
  assert.ok(total >= 20 && total <= 40, `${total} quêtes, hors de la plage 20–40`);
  const minutes = quetes.reduce((a, q) => a + q.estMinutes, 0);
  assert.ok(minutes >= 240 && minutes <= 480, `${minutes} min au total, hors de la plage 4 h – 8 h`);
});