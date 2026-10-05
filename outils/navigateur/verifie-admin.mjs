/**
 * La page d'administration, jouée dans un vrai Chromium.
 *
 * Le parcours de l'enseignant : mauvais mot de passe, bon mot de passe, la
 * classe s'affiche, un joueur est remis à zéro — avec la confirmation, parce
 * que c'est là que tout se joue.
 */

/**
 * Où poser les captures. Hors du dépôt, et configurable : les PNG de recette
 * n'ont rien à y faire, et le répertoire de travail de l'agent n'existe pas
 * chez l'enseignant.
 */
const SORTIE = process.env.ATELIER_SHOTS ?? '/tmp/atelier-shots';

const base = process.argv[2] ?? "http://127.0.0.1:8096";
const mdp = process.argv[3] ?? "secret-de-recette";
const PORT = Number(process.argv[4] ?? 9230);

const cibles = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(cibles.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
let id = 0; const att = new Map(); const errs = [];
ws.onmessage = (m) => { const g = JSON.parse(m.data);
  if (g.id && att.has(g.id)) { const { ok, ko } = att.get(g.id); att.delete(g.id);
    g.error ? ko(new Error(JSON.stringify(g.error))) : ok(g.result); }
  else if (g.method === 'Runtime.exceptionThrown')
    errs.push(g.params.exceptionDetails.exception?.description ?? g.params.exceptionDetails.text);
  else if (g.method === 'Log.entryAdded' && g.params.entry.level === 'error')
    errs.push(`[console] ${g.params.entry.text}`);
};
const envoyer = (m, p = {}) => new Promise((ok, ko) => { id += 1; att.set(id, { ok, ko });
  ws.send(JSON.stringify({ id, method: m, params: p })); });
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(e) { const { result, exceptionDetails } = await envoyer('Runtime.evaluate',
  { expression: e, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value; }
async function jusqua(e, ms = 15000) { const f = Date.now() + ms;
  while (Date.now() < f) { if (await ev(`(()=>{try{return !!(${e})}catch{return false}})()`)) return true; await attendre(200); } return false; }

await envoyer('Page.enable'); await envoyer('Runtime.enable'); await envoyer('Log.enable').catch(() => {});
await envoyer('Network.enable'); await envoyer('Network.setCacheDisabled', { cacheDisabled: true });
await envoyer('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1500, deviceScaleFactor: 1, mobile: false });

const bilan = [];
// Affiché au fur et à mesure : un plantage au milieu ne doit pas faire perdre
// tout ce qui a déjà été vérifié.
const ligne = (k, v) => { const s = `${(k + ' ').padEnd(34, '.')} ${v}`;
  bilan.push(s); console.log(s); };

// On va d'abord sur la racine : c'est la seule origine où un `fetch` relatif
// fonctionne, et l'inscription est une route publique.
await envoyer('Page.navigate', { url: `${base}/` });
await jusqua("document.readyState === 'complete'");
await attendre(400);

// Trois joueurs, pour que la classe ne soit pas vide à l'écran.
for (const pseudo of ['Camille', 'Dimitri', 'Basile']) {
  await ev(`fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ team: ${JSON.stringify(pseudo)}, mode: 'normal' }) })`);
}

await envoyer('Page.navigate', { url: `${base}/admin` });
await jusqua("document.querySelector('#mdp')");
await attendre(600);

ligne('titre', await ev('document.title'));
ligne('écran du mot de passe', await ev("!document.querySelector('#admin').hidden ? 'caché' : 'affiché'"));
await envoyer('Page.captureScreenshot', { format: 'png' }).then(({ data }) =>
  import('node:fs').then(({ writeFileSync }) => writeFileSync(`${SORTIE}/admin-1-gate.png`, Buffer.from(data, 'base64'))));

// ── mauvais mot de passe
await ev(`(() => { const i = document.querySelector('#mdp'); i.value = 'mauvais';
  document.querySelector('#gateForm').dispatchEvent(new Event('submit', {bubbles:true, cancelable:true})); })()`);
await attendre(900);
ligne('mauvais mot de passe', await ev(`document.querySelector('#gateMsg').textContent.trim()`));
ligne('écran admin après échec', await ev("!document.querySelector('#admin').hidden ? 'OUVERT — FAUTE' : 'toujours fermé'"));
ligne('cookie après échec', await ev('document.cookie.includes("dq_admin") ? "POSÉ — FAUTE" : "aucun"'));

// ── bon mot de passe
await ev(`(() => { const i = document.querySelector('#mdp'); i.value = ${JSON.stringify(mdp)};
  document.querySelector('#gateForm').dispatchEvent(new Event('submit', {bubbles:true, cancelable:true})); })()`);
await jusqua("!document.querySelector('#admin').hidden");
await jusqua("document.querySelectorAll('#playersBody tr').length >= 3", 12000);
await attendre(900);

ligne('message', await ev("document.querySelector('#gateMsg').textContent.trim() || '(écran fermé)'"));
ligne('joueurs dans le tableau', await ev("document.querySelectorAll('#playersBody tr').length"));
ligne('encarts de statistiques', await ev("document.querySelectorAll('#stats .cohort-card').length"));
ligne('barres de ratio', await ev("document.querySelectorAll('#playersBody .ratio-bar').length"));
ligne('boutons d\'action', await ev("document.querySelectorAll('#playersBody .c-right .btn').length"));
ligne('le mot de passe est-il lisible en JS', await ev("document.querySelector('#mdp').value === '' ? 'non (champ vidé)' : 'OUI — FAUTE'"));
ligne('gate masque apres connexion', await ev(
  "getComputedStyle(document.querySelector('#gate')).display === 'none' ? 'oui' : 'NON — VISIBLE'"));
ligne('[object HTMLSpanElement]', await ev(
  "document.body.textContent.includes('object HTML') ? 'PRÉSENT — FAUTE' : 'absent'"));
ligne('journal', await ev("document.querySelectorAll('#eventLog li').length"));
await envoyer('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then(({ data }) =>
  import('node:fs').then(({ writeFileSync }) => writeFileSync(`${SORTIE}/admin-2-classe.png`, Buffer.from(data, 'base64'))));

// ── la confirmation avant remise à zéro
await ev(`document.querySelectorAll('#playersBody tr')[0].querySelectorAll('.btn')[0].click()`);
await attendre(500);
const confirm = await ev("document.querySelector('.confirm-box')?.textContent.replace(/\\s+/g,' ').trim() ?? 'ABSENTE'");
ligne('confirmation avant remise à zéro', confirm.slice(0, 120));
await envoyer('Page.captureScreenshot', { format: 'png' }).then(({ data }) =>
  import('node:fs').then(({ writeFileSync }) => writeFileSync(`${SORTIE}/admin-3-confirmation.png`, Buffer.from(data, 'base64'))));

// on annule : rien ne doit bouger
await ev(`document.querySelector('.confirm-box .btn-ghost').click()`);
await attendre(500);
const apres = await ev(`fetch('/api/overview', { credentials:'same-origin' }).then(r=>r.json()).then(o=>
  o.players.map(p => p.team + ':' + p.progress).join(' '))`);
ligne('classe après annulation', apres);

// ── le filtre
await ev(`(() => { const s = document.querySelector('#search'); s.value = 'cami';
  s.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
await attendre(500);
ligne('filtre « cami »', await ev(
  "(document.querySelector('#playersBody')?.rows?.length ?? '?') + ' ligne(s)'"));

console.log(bilan.join('\n'));
if (errs.length) console.log(`\nerreurs console :\n  ${errs.join('\n  ')}`);
ws.close(); process.exit(0);
