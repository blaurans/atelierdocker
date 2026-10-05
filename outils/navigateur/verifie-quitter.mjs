/**
 * Le bouton « Quitter ».
 *
 * Le parcours d'un élève : il s'inscrit, joue, puis presse « Quitter » — parce
 * qu'il rend le poste au suivant, ou qu'il a fini. Ce qu'il doit voir est
 * l'écran d'inscription, pas le jeu.
 *
 * Le bouton est mort depuis le premier commit : il faisait
 * `location.hash = '#/'` puis `route()`, et `route()` relit le jeton du
 * `localStorage` — donc il rouvrait le jeu. Un `confirm` qui promet le
 * contraire est pire que pas de bouton : il fait confiance.
 */

/**
 * Où poser les captures. Hors du dépôt, et configurable : les PNG de recette
 * n'ont rien à y faire, et le répertoire de travail de l'agent n'existe pas
 * chez l'enseignant.
 */
const SORTIE = process.env.ATELIER_SHOTS ?? '/tmp/atelier-shots';

const base = process.argv[2] ?? 'http://127.0.0.1:8094';
const PORT = Number(process.argv[3] ?? 9245);
const equipe = process.argv[4] ?? `Quitter${Date.now() % 10000}`;

// Un onglet neuf, à chaque fois. Un `confirm` natif laissé ouvert bloque le
// renderer de son onglet — et `Page.enable` n'y répond plus jamais. Cibler un
// onglet déjà Anatomie ausend : mieux vaut en créer un.
const neuf = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,
  { method: 'PUT' })).json();
const cibles = [neuf, ...await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()];
const page = cibles.find((t) => t.type === 'page' && t.url === 'about:blank') ?? cibles[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
let id = 0; const att = new Map(); const errs = [];
ws.onmessage = (m) => { const g = JSON.parse(m.data);
  if (g.id && att.has(g.id)) { const { ok, ko } = att.get(g.id); att.delete(g.id);
    g.error ? ko(new Error(JSON.stringify(g.error))) : ok(g.result); }
  else if (g.method === 'Runtime.exceptionThrown')
    errs.push(g.params.exceptionDetails.exception?.description ?? g.params.exceptionDetails.text); };
const envoyer = (m, p = {}) => new Promise((ok, ko) => { id += 1; att.set(id, { ok, ko });
  ws.send(JSON.stringify({ id, method: m, params: p })); });
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(e) { const { result, exceptionDetails } = await envoyer('Runtime.evaluate',
  { expression: e, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error((exceptionDetails.exception?.description ?? exceptionDetails.text).split('\n')[0]);
  return result.value; }
async function jusqua(e, ms = 15000) { const f = Date.now() + ms;
  while (Date.now() < f) { if (await ev(`(()=>{try{return !!(${e})}catch{return false}})()`) === true) return true; await attendre(200); } return false; }
const shoot = async (nom) => { const { data } = await envoyer('Page.captureScreenshot', { format: 'png' });
  (await import('node:fs')).writeFileSync(`${SORTIE}/quit-${nom}.png`, Buffer.from(data, 'base64')); };

await envoyer('Page.enable'); await envoyer('Runtime.enable');
// Si le `confirm` natif s'ouvre malgré le stub, il bloquerait la page — on
// l'accepte automatiquement.
ws.onmessage = ((premier) => (m) => {
  const g = JSON.parse(m.data);
  if (g.method === 'Page.javascriptDialogOpening') {
    envoyer('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    return;
  }
  premier(m);
})(ws.onmessage);
await envoyer('Network.enable'); await envoyer('Network.setCacheDisabled', { cacheDisabled: true });
await envoyer('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1250, deviceScaleFactor: 1, mobile: false });

// Le confirm de la V2 : on le simule, sinon le bouton ne fait rien du tout.
await envoyer('Runtime.evaluate', { expression:
  "globalThis.confirm = () => globalThis.__repondre; true" });

const bilan = [];
const ligne = (k, v) => { const s = `${(k + ' ').padEnd(34, '.')} ${v}`; bilan.push(s); console.log(s); };
const etape = (nom) => { console.log(`… ${nom}`); };

etape('inscription');
// ── s'inscrire et entrer dans le jeu
await envoyer('Page.navigate', { url: `${base}/?r=${Math.random()}` });
await jusqua("document.readyState === 'complete'");
await attendre(500);
await ev(`localStorage.clear(); true`);

await ev(`(async () => {
  document.querySelector('.mode-norm').click();
  document.querySelector('#gTeam').value = ${JSON.stringify(equipe)};
  document.querySelector('#gSecret').value = 'secret-de-quittance';
  document.querySelector('#gateForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return true;
})()`);
await jusqua("!document.querySelector('#play').hidden", 15000);
await attendre(700);
ligne('inscrit et dans le jeu', await ev("!document.querySelector('#play').hidden ? 'oui' : 'NON'"));
ligne('progression', await ev("document.querySelector('#progressVal').textContent"));

etape('pression sur Quitter');
// ── appuyer sur « Quitter »
await ev("globalThis.__repondre = true; document.querySelector('#btnQuit').click(); true");
await attendre(900);

const apres = await ev(`(() => ({
  gate: !document.querySelector('#gate')?.hidden,
  play: !document.querySelector('#play')?.hidden,
  token: !!localStorage.getItem('atelier-docker:v2'),
  team: document.querySelector('#teamName')?.textContent ?? '',
}))()`);
ligne('après « Quitter » · jeu masqué', apres.play ? 'NON — on est encore dedans' : 'oui');
ligne('après « Quitter » · inscription', apres.gate ? 'affichée' : 'NON');
ligne('après « Quitter » · jeton', apres.token ? 'CONSERVÉ' : 'effacé');

etape('rechargement');
// ── et surtout : un rechargement ne doit pas rouvrir la session
await envoyer('Page.navigate', { url: `${base}/?r=${Math.random()}` });
await jusqua("document.readyState === 'complete'");
await attendre(800);
ligne('après rechargement · jeu', await ev("!document.querySelector('#play').hidden ? 'OUVERT — FAUTE' : 'resté sur l\\'inscription'"));
await shoot('apres');

etape('reprise');
// ── revenir avec pseudo + secret : c'est le chemin que le message annonce
await ev(`(async () => {
  document.querySelector('.mode-norm').click();
  document.querySelector('#gTeam').value = ${JSON.stringify(equipe)};
  document.querySelector('#gSecret').value = 'secret-de-quittance';
  document.querySelector('#gateForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return true;
})()`);
const revenu = await jusqua("!document.querySelector('#play').hidden", 12000);
ligne('reprise par pseudo + secret', revenu ? 'la session est retrouvée' : 'NON — progression perdue');

console.log('');
if (errs.length) console.log(`erreurs :\n  ${errs.join('\n  ')}`);
ws.close(); process.exit(0);
