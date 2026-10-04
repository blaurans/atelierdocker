/**
 * Les garde-fous Markdown ne doivent pas s'appliquer aux blocs de code.
 *
 * Un énoncé qui montre une sortie de commande contient des lignes `#` (les
 * commentaires shell usuels), des `|` (les pipes) et des chevrons (les
 * redirections). Aucune de ces lignes n'est du Markdown — le client ne les rend
 * pas comme telles, il les affiche dans un bloc de code.
 *
 * Sans la distinction, deux règles fausses se déclenchent sur du contenu
 * parfaitement légitime :
 *
 *   - « un seul titre « # » » rejetait tout énoncé montrant `# -> PONG`
 *   - « pas de tableau » aurait rejeté `docker images | head` en début de ligne
 *
 * C'est arrivé en rédigeant l'atelier 6, et le message d'erreur accusait
 * l'auteur d'une faute qu'il n'avait pas commise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Un répertoire temporaire unique est créé **avant** le premier import de
 * `questpack.js`, parce que le module se charge lui-même au démarrage (top-level
 * await) avec `config.questsDir`, et que `config.js` lit la variable
 * d'environnement une seule fois. Un répertoire par test ne marcherait pas : le
 * premier import figerait une chemin qui serait supprimé au test suivant.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RACINE = path.resolve(import.meta.dirname, '..');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-md-'));
process.env.QUESTS_DIR = DIR;

// Le module se charge au démarrage avec `config.questsDir` : il faut donc qu'il
// y ait déjà un fichier **valide**, nommé `m<N>.js`, avant l'import.
fs.writeFileSync(path.join(DIR, 'm1.js'), `export default ${JSON.stringify({
  meta: { slug: 'amorce', module: 1, title: 'Amorce', tagline: 't', icon: 'x' },
  quests: [{
    id: 'm1-00-amorce', order: 1, title: 'Amorce', points: 100,
    flag: 'FLAG{AMORCE}', estMinutes: 10, brief: '# Amorce\n\nUn énoncé minimal, suffisamment long pour passer la validation.',
    teaches: ['amorce'], hints: ['a', 'b', 'c'], checkpoint: 'Compris quand tu le sais.',
    fetchHint: 'docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m1-00-amorce/raw?token=dq_x"',
  }],
})};`);

const { loadQuestpack } = await import('../src/questpack.js');

process.on('exit', () => fs.rmSync(DIR, { recursive: true, force: true }));

let compteur = 0;

/** Charge une quête unique et renvoie le message d'erreur, ou `null`. */
async function valider(quests) {
  // On repart d'un répertoire vide à chaque fois : `loadQuestpack` relit tout
  // le dossier, et les fichiers des tests précédents resteraient sinon.
  for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f));
  fs.writeFileSync(path.join(DIR, `m${++compteur}.js`),
    `export default ${JSON.stringify(quests)};`);
  try {
    await loadQuestpack({ dir: DIR });
    return null;
  } catch (err) {
    return err.message;
  }
}

/** Une quête minimale, complète, dont seul le `brief` change. */
function quete(brief) {
  return {
    meta: { slug: 'test', module: 1, title: 'Test', tagline: 'Test', icon: '🧪' },
    quests: [{
      id: 'm1-01-x',
      order: 1,
      title: 'Une quête de test',
      points: 100,
      flag: 'FLAG{TEST}',
      estMinutes: 10,
      brief,
      teaches: ['test'],
      hints: ['un indice', 'un deuxième', 'un troisième'],
      checkpoint: 'Tu as compris quand tu le sais.',
      fetchHint: 'docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m1-01-x/raw?token=dq_x"',
    }],
  };
}

test('un bloc de code peut contenir des commentaires shell', async () => {
  const erreur = await valider(quete(`# Titre unique

\`\`\`bash
docker run --rm alpine redis-cli PING
# -> PONG
# -> (commentaire shell : ce n'est pas un titre)
\`\`\``));
  assert.equal(erreur, null, `devrait être accepté, mais : ${erreur}`);
});

test('un bloc de code peut contenir des pipes en début de ligne', async () => {
  const erreur = await valider(quete(`# Titre unique

\`\`\`bash
docker images
# | REPOSITORY   TAG   SIZE
# | alpine       latest 7.83MB
\`\`\``));
  assert.equal(erreur, null, `devrait être accepté, mais : ${erreur}`);
});

test('un bloc de code peut contenir des chevrons', async () => {
  const erreur = await valider(quete(`# Titre unique

\`\`\`bash
docker run -d < /dev/null
\`\`\``));
  assert.equal(erreur, null, `devrait être accepté, mais : ${erreur}`);
});

test('deux titres dans la prose sont toujours refusés', async () => {
  const erreur = await valider(quete(`# Premier titre

Un peu de texte.

# Second titre

Encore du texte.`));
  assert.ok(erreur, 'doit être refusé');
  assert.match(erreur, /un seul titre/);
});

test('un tableau dans la prose est toujours refusé', async () => {
  const erreur = await valider(quete(`# Titre

| Colonne | Valeur |
|---|---|
| a | b |`));
  assert.ok(erreur, 'doit être refusé');
  assert.match(erreur, /tableau Markdown/);
});

test('du HTML dans la prose est toujours refusé', async () => {
  const erreur = await valider(quete(`# Titre

Du texte avec <b>du gras HTML</b>.`));
  assert.ok(erreur, 'doit être refusé');
  assert.match(erreur, /HTML interdit/);
});

test('le message de refus indique le nombre de titres trouvés', async () => {
  const erreur = await valider(quete(`# Un

# Deux

# Trois`));
  assert.match(erreur, /3 trouvés/, `le message doit dire combien : ${erreur}`);
});

test('le flag reste interdit, même dans un bloc de code', async () => {
  // Les garde-fou du flag n'ont pas le même champ d'application que ceux du Markdown :
  // afficher le flag dans un exemple de sortie resterait une fuite.
  const erreur = await valider(quete(`# Titre

\`\`\`bash
echo "FLAG{TEST}"
\`\`\``));
  assert.ok(erreur, 'le flag ne doit jamais sortir, même dans un bloc de code');
});