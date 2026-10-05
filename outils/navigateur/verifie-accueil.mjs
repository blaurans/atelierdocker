/**
 * La page d'accueil est-elle le jeu ?
 *
 * Trois adresses, parce que c'est ce qu'un élève et un enseignant vont
 * réellement taper : la racine, la racine avec l'ancre historique, et une
 * ancre inconnue venue d'un lien.
 */

/**
 * Où poser les captures. Hors du dépôt, et configurable : les PNG de recette
 * n'ont rien à y faire, et le répertoire de travail de l'agent n'existe pas
 * chez l'enseignant.
 */
const SORTIE = process.env.ATELIER_SHOTS ?? '/tmp/atelier-shots';

const base = process.argv[2] ?? 'http://127.0.0.1:8094';
const PORT = Number(process.argv[3] ?? 9245);

const cibles = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(cibles.find((t) => t.type === 'page').webSocketDebuggerUrl);
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
async function jusqua(e, ms = 12000) { const f = Date.now() + ms;
  while (Date.now() < f) { if (await ev(`(()=>{try{return !!(${e})}catch{return false}})()`) === true) return true; await attendre(200); } return false; }
const shoot = async (nom, pleine = true) => {
  const { data } = await envoyer('Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: pleine });
  (await import('node:fs')).writeFileSync(`${SORTIE}/acc-${nom}.png`, Buffer.from(data, 'base64')); };

await envoyer('Page.enable'); await envoyer('Runtime.enable');
await envoyer('Network.enable'); await envoyer('Network.setCacheDisabled', { cacheDisabled: true });
await envoyer('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1250, deviceScaleFactor: 1, mobile: false });

const bilan = [];
const ligne = (k, v) => { const s = `${(k + ' ').padEnd(34, '.')} ${v}`; bilan.push(s); console.log(s); };

for (const [nom, url] of [
  ['racine', `${base}/`],
  ['avec ancre #/', `${base}/#/`],
  ['ancre inconnue', `${base}/#/jeu`],
]) {
  // Un paramètre force le rechargement : sans lui, même URL = pas de reload, et
  // l'app resterait dans l'état précédent. C'est ce qui m'a fait croire un
  // jour que le jeu ne démarrait pas sans ancre.
  await envoyer('Page.navigate', { url: `${url}?r=${Math.random()}` });
  await jusqua("document.readyState === 'complete'");
  await attendre(700);
  await ev('localStorage.clear(); true');

  const vue = await ev(`(() => ({
    gate: !document.querySelector('#gate')?.hidden,
    play: !document.querySelector('#play')?.hidden,
    portal: !!document.querySelector('#portal'),
    titre: document.title,
    cartes: document.querySelectorAll('.mode').length,
    toast: document.querySelector('.toast')?.hidden === false
      ? document.querySelector('.toast').textContent.trim() : '',
  }))()`);
  ligne(`${nom} → jeu`, `gate=${vue.gate} play=${vue.play} cartes=${vue.cartes}`);
  ligne(`${nom} → portail`, vue.portal ? 'PRÉSENT — FAUTE' : 'absent');
  ligne(`${nom} → toast d'erreur`, vue.toast || 'aucun');
  if (nom === 'racine') await shoot('racine');
}

console.log('');
if (errs.length) console.log(`erreurs :\n  ${errs.join('\n  ')}`);
else console.log('aucune erreur console');
ws.close(); process.exit(0);
