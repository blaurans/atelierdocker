import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { renderMarkdown } from '../public/md.js';

/**
 * Le rendu Markdown est le seul endroit où du contenu rédactionnel touche au
 * DOM. Ces tests vérifient le sous-ensemble supporté et, surtout, que le
 * contenu ne peut pas injecter de HTML.
 */
/**
 * On n'installe que `document` : c'est la seule globale qu'utilise
 * public/md.js. Exposer en plus `window` active le MutationObserver interne
 * de linkedom, qui n'a pas de document propriétaire valide dans ce contexte et
 * fait échouer `appendChild` — un artefact du DOM de test, pas du code testé.
 */
const dom = parseHTML('<!doctype html><html><body></body></html>');
globalThis.document = dom.document;

const render = (src) => {
  const host = dom.document.createElement('div');
  host.appendChild(renderMarkdown(src));
  return host;
};

test('rend les titres, paragraphes et listes', () => {
  const box = render('# Titre\n\nUn paragraphe.\n\n- un\n- deux\n\n1. premier\n2. second');
  assert.equal(box.querySelectorAll('h3').length, 1);
  assert.equal(box.querySelector('h3').textContent, 'Titre');
  assert.equal(box.querySelectorAll('p').length, 1);
  assert.equal(box.querySelectorAll('ul li').length, 2);
  assert.equal(box.querySelectorAll('ol li').length, 2);
});

test('rend le code inline et les blocs bash', () => {
  const box = render('Tape `docker ps` puis :\n\n```bash\ndocker run -d nginx\n```');
  assert.equal(box.querySelector('p code').textContent, 'docker ps');
  const pre = box.querySelector('pre code');
  assert.equal(pre.textContent, 'docker run -d nginx');
  assert.equal(pre.dataset.lang, 'bash');
});

test('rend le gras, l\'italique et les liens', () => {
  const box = render('**gras** *ital* [doc](https://docs.docker.com)');
  assert.equal(box.querySelector('strong').textContent, 'gras');
  assert.equal(box.querySelector('em').textContent, 'ital');
  const a = box.querySelector('a');
  assert.equal(a.getAttribute('href'), 'https://docs.docker.com');
  assert.equal(a.textContent, 'doc');
  assert.equal(a.getAttribute('target'), '_blank');
});

test('neutralise le HTML : les balises restent du texte', () => {
  const box = render('Attention <script>alert(1)</script> et <img src=x onerror=alert(1)>');
  assert.equal(box.querySelectorAll('script').length, 0, 'aucun script ne doit être créé');
  assert.equal(box.querySelectorAll('img').length, 0, 'aucune image ne doit être créée');
  assert.match(box.textContent, /<script>/, 'la balise reste visible comme texte');
});

test('neutralise les liens dangereux', () => {
  const box = render('[clic](javascript:alert(1))');
  // Le schéma jjavascript n'est pas accepté par le renderer : le lien reste
  // du texte.
  assert.equal(box.querySelectorAll('a').length, 0);
});

test('ne casse pas sur une entrée vide ou bizarre', () => {
  assert.doesNotThrow(() => render(''));
  assert.doesNotThrow(() => render(null));
  assert.doesNotThrow(() => render('```bash\nbloc sans fermeture'));
  assert.doesNotThrow(() => render('- \n1. \n# \n'));
});

test('préserve les accents et les apostrophes du contenu français', () => {
  const box = render("Rends-tu **l'image** ? Étape n° 3 à l'étape 6 : 25 % de plus.");
  assert.match(box.textContent, /Rends-tu l'image \? Étape n° 3 à l'étape 6 : 25 % de plus\./);
});