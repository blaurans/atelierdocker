/**
 * Pilote Chromium en CDP, avec le WebSocket intégré de Node.
 *
 * Pourquoi : `chromium --screenshot` capture **avant** que le script de la page
 * ait fini. La page est asynchrone — inscription, chargement du programme,
 * hydratation des réponses — donc la capture tombe sur une page vide. Et
 * `--virtual-time-budget` n'aide pas : le temps virtuel avance pendant que les
 * requêtes réseau, elles, prennent du temps réel.
 *
 * CDP est la seule façon de dire « navigue, attends que la page soit prête,
 * exécute ceci, photographie ». Le client WebSocket est dans Node depuis la 22 :
 * aucune dépendance à installer, ce qui compte dans un projet qui n'en a
 * qu'une.
 *
 *   node pilote.mjs <url> [sortie.png] [--wait=selecteur] [--ms=3000]
 *                  [--eval="expr"] [--largeur=1400] [--hauteur=2400]
 */

/**
 * Où poser les captures. Hors du dépôt, et configurable : les PNG de recette
 * n'ont rien à y faire, et le répertoire de travail de l'agent n'existe pas
 * chez l'enseignant.
 */
const SORTIE = process.env.ATELIER_SHOTS ?? '/tmp/atelier-shots';

const [, , url, sortie = '${SORTIE}/shot.png'] = process.argv;
const opt = Object.fromEntries(
  process.argv.slice(4)
    .filter((a) => a.startsWith('--'))
    .map((a) => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }),
);

const PORT = Number(opt.port ?? 9222);
const largeur = Number(opt.largeur ?? 1400);
const hauteur = Number(opt.hauteur ?? 2400);

// ── connexion
const cibles = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = cibles.find((t) => t.type === 'page');
if (!page) { console.error('aucun onglet'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });

let id = 0;
const attentes = new Map();
const evenements = [];

ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && attentes.has(msg.id)) {
    const { ok, ko } = attentes.get(msg.id);
    attentes.delete(msg.id);
    msg.error ? ko(new Error(JSON.stringify(msg.error))) : ok(msg.result);
  } else if (msg.method) {
    evenements.push(msg);
  }
};

const envoyer = (method, params = {}) => new Promise((ok, ko) => {
  id += 1;
  attentes.set(id, { ok, ko });
  ws.send(JSON.stringify({ id, method, params }));
});

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// ── configuration
await envoyer('Page.enable');
await envoyer('Runtime.enable');
await envoyer('Log.enable').catch(() => {});

// Le cache désactivé n'est pas un détail : en production les assets sont
// servis avec `maxAge: 5m`, donc Chromium sert l'ancien `style.css` et le
// pilote mesure fidèlement une feuille de style déjà corrigée. C'est arrivé :
// une règle CSS corrigée et déployée continuait de faire 1385 px de large
// parce que le navigateur gardait la version précédente.
await envoyer('Network.enable');
await envoyer('Network.setCacheDisabled', { cacheDisabled: true });

// Les erreurs console sont le signal le plus utile quand une page ne rend pas :
// sans elles, un échec de module est invisible et `--dump-dom` ne dit rien.
const litConsole = () => evenements
  .filter((e) => e.method === 'Log.entryAdded' || e.method === 'Runtime.exceptionThrown')
  .map((e) => {
    if (e.method === 'Log.entryAdded') return `  [${e.params.entry.level}] ${e.params.entry.text}`;
    // `exceptionDetails.text` ne vaut que « Uncaught » : la vraie cause est
    // dans `exception.description`, qui porte la pile. Sans elle, un échec de
    // module est totalement invisible.
    const d = e.params.exceptionDetails;
    const ou = d.url ? ` (${d.url}:${d.lineNumber})` : '';
    return `  [exception] ${d.exception?.description ?? d.text}${ou}`;
  });

// ── navigation
await envoyer('Emulation.setDeviceMetricsOverride', {
  width: largeur, height: hauteur, deviceScaleFactor: 1, mobile: false,
});
await envoyer('Page.navigate', { url });

// Attendre que la page soit prête : d'abord le chargement, puis le sélecteur
// attendu, puis un temps fixe pour les requêtes qui suivent le rendu.
const debut = Date.now();
while (Date.now() - debut < 25_000) {
  const { result } = await envoyer('Runtime.evaluate', { expression: 'document.readyState' });
  if (result.value === 'complete') break;
  await attendre(150);
}

if (opt.wait) {
  const limite = Date.now() + 25_000;
  let ok = false;
  while (Date.now() < limite) {
    const { result } = await envoyer('Runtime.evaluate', {
      expression: `!!document.querySelector(${JSON.stringify(opt.wait)})`,
    });
    if (result.value) { ok = true; break; }
    await attendre(200);
  }
  if (!ok) console.error(`le sélecteur ${opt.wait} n'est jamais apparu`);
}

await attendre(Number(opt.ms ?? 2500));

// ── évaluations
if (opt.eval) {
  const { result, exceptionDetails } = await envoyer('Runtime.evaluate', {
    expression: opt.eval, awaitPromise: true, returnByValue: true,
  });
  if (exceptionDetails) console.error('  ✗ ' + (exceptionDetails.exception?.description ?? exceptionDetails.text));
  else console.log(typeof result.value === 'string'
    ? result.value
    : JSON.stringify(result.value, null, 2));
}

const console_ = litConsole();
if (console_.length) console.log('\nconsole :\n' + console_.join('\n'));

// ── capture
// `captureBeyondViewport` recompose toute la hauteur de page et laisse des
// couches peintes là où un élément `display: none` se trouvait : la capture
// montre alors un écran qui n'existe plus. Pour une vérification, une capture
// du viewport ne ment pas.
const { data } = await envoyer('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: opt.pleinePage === '1',
});
const { writeFileSync } = await import('node:fs');
writeFileSync(sortie, Buffer.from(data, 'base64'));
console.log(`\ncapture : ${sortie}`);

ws.close();
process.exit(0);
