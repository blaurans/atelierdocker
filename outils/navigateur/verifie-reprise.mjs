/**
 * Le formulaire de reconnexion, joué dans un vrai navigateur.
 *
 * Le scénario est celui du défaut signalé : un élève en Sans stress qui se
 * reconnecte, avec un secret posé au préalable, et qui doit le ressaisir.
 * Le parcours passe par les pixels — on choisit un mode, on remplit, on
 * envoie — parce qu'un champ masqué ne se voit pas dans une assertion sur le
 * JavaScript.
 */

/**
 * Où poser les captures. Hors du dépôt, et configurable : les PNG de recette
 * n'ont rien à y faire, et le répertoire de travail de l'agent n'existe pas
 * chez l'enseignant.
 */
const SORTIE = process.env.ATELIER_SHOTS ?? '/tmp/atelier-shots';

const base = process.argv[2] ?? 'http://127.0.0.1:8095';
const PORT = Number(process.argv[3] ?? 9240);
const mdp = process.argv[4] ?? 'secret-de-recette';

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
const cliquer = async (sel) => { await ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`); await attendre(250); };
const shoot = async (nom) => { const { data } = await envoyer('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  (await import('node:fs')).writeFileSync(`${SORTIE}/frm-${nom}.png`, Buffer.from(data, 'base64')); };

await envoyer('Page.enable'); await envoyer('Runtime.enable');
await envoyer('Network.enable'); await envoyer('Network.setCacheDisabled', { cacheDisabled: true });
await envoyer('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1150, deviceScaleFactor: 1, mobile: false });

const bilan = [];
const ligne = (k, v) => { const s = `${(k + ' ').padEnd(32, '.')} ${v}`; bilan.push(s); console.log(s); };

// Un élève qui s'inscrit en Challenge AVEC un secret — c'est son profil.
await envoyer('Page.navigate', { url: `${base}/` });
await jusqua("document.readyState === 'complete'");
await ev(`fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ team: 'Reprise', mode: 'competitive', secret: 'mon-secret' }) }).then(r=>r.status)`);

// Il revient en Sans stress : le cas exact du défaut signalé.
await envoyer('Page.navigate', { url: `${base}/#/` });
await jusqua("document.querySelector('#gate .mode-pick')");
await attendre(500);

ligne('formulaire au départ', await ev("document.querySelector('#gateForm').hidden ? 'caché' : 'affiché'"));
ligne('note sous le secret', await ev("(document.querySelector('.gate-form .field-note')?.textContent ?? 'ABSENTE').replace(/\\s+/g,' ').trim().slice(0,50)"));

await cliquer('.mode-norm');
ligne('mode choisi', await ev("document.querySelector('#gateModeLabel').textContent"));

const champ = await ev(`(() => {
  const c = document.querySelector('#gSecret');
  const r = c.getBoundingClientRect();
  return { hidden: c.hidden, visible: r.width > 0 && r.height > 0, largeur: Math.round(r.width) };
})()`);
ligne('champ secret en Sans stress', `hidden=${champ.hidden} visible=${champ.visible} ${champ.largeur}px`);
await shoot('1-sans-stress');

// Bon secret → la session est rendue
await ev(`(() => { document.querySelector('#gTeam').value = 'Reprise';
  document.querySelector('#gSecret').value = 'mon-secret'; return true; })()`);
await envoyer('Runtime.evaluate', { expression:
  "document.querySelector('#gateForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); true" });
await attendre(1200);
ligne("avec le bon secret", await ev(
  "document.querySelector('#play').hidden ? 'toujours sur le formulaire' : 'session ouverte'"));
ligne('progression retrouvée', await ev("document.querySelector('#progressVal')?.textContent ?? '—'"));

// Mauvais secret → un message qui explique quoi faire, et le champ vers lequel aller
await ev(`(() => { localStorage.clear(); return true; })()`);
// Un paramètre-quelconque : sans lui, Chromium ne recharge rien — même URL,
// même ancre — et l'app reste dans l'état précédent. C'est ce qui faisait
// croire que le champ secret était invisible sur ce second passage.
await envoyer('Page.navigate', { url: `${base}/?r=2#/` });
await jusqua("document.querySelector('#gate .mode-pick')");
await attendre(400);
await cliquer('.mode-norm');
await ev(`(() => { document.querySelector('#gTeam').value = 'Reprise';
  document.querySelector('#gSecret').value = 'mauvais'; return true; })()`);
await envoyer('Runtime.evaluate', { expression:
  "document.querySelector('#gateForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); true" });
await attendre(1000);
const err = await ev(`(() => ({
  texte: (document.querySelector('#gateMsg')?.textContent ?? '').replace(/\\s+/g,' ').trim(),
  classe: document.querySelector('#gateMsg')?.className,
  focus: document.activeElement?.id || document.activeElement?.tagName,
  focusable: (() => { const c = document.querySelector('#gSecret');
    const r = c.getBoundingClientRect();
    return { visible: r.width > 0 && r.height > 0, disabled: c.disabled, readonly: c.readOnly }; })(),
}))()`);
ligne('mauvais secret', err.texte.slice(0, 130));
ligne('couleur du message', err.classe.includes('warn') ? 'ambre — reprise de session' : `ROUGE — ${err.classe}`);
ligne("focus après l'erreur", err.focus === 'gSecret' ? 'sur le champ secret' : `ailleurs : ${err.focus}`);
ligne("champ focused", `visible=${err.focusable.visible} disabled=${err.focusable.disabled}`);
ligne("état des écrans", await ev(`JSON.stringify({
  gate: !document.querySelector('#gate').hidden,
  play: !document.querySelector('#play').hidden,
  gateForm: !document.querySelector('#gateForm').hidden,
  gateDisplay: getComputedStyle(document.querySelector('#gate')).display,
  formDisplay: getComputedStyle(document.querySelector('#gateForm')).display,
})`));
await ev(`document.querySelector('#gSecret').focus(); document.querySelector('#gSecret').select(); true`);
await attendre(200);
ligne("focus forcé", await ev("document.activeElement?.id"));
await shoot('2-erreur');

// L'inscription rapide a-t-elle aussi le champ ?
//
// Elle est sur `/admin`, pas sur `/` : elle a suivi le portail quand celui-ci a
// été fermé. Le script visait `#register-section` sur la racine, qui n'existe
// plus — il échouait sur un `null` bien avant d'avoir rien vérifié. L'écran
// `/admin` est servi sans mot de passe (c'est lui *qui est* le formulaire), donc
// le scénario tient, mais il faut s'authentifier pour atteindre le formulaire.
await envoyer('Page.navigate', { url: `${base}/admin` });
await jusqua("document.querySelector('#mdp')");
await attendre(400);
await ev(`(() => { const i = document.querySelector('#mdp'); i.value = ${JSON.stringify(mdp)};
  document.querySelector('#gateForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  return true; })()`);
await jusqua("!document.querySelector('#admin').hidden", 15000);
ligne('écran /admin ouvert', await ev(
  "document.querySelector('#admin').hidden ? 'NON' : 'oui'"));
ligne('formulaire rapide : secret', await ev(
  "document.querySelector('#inSecret') ? 'présent' : 'ABSENT'"));
ligne('inscription rapide : pseudonyme + mode', await ev(`(() => {
  const t = document.querySelector('#inTeam'), m = document.querySelector('#inMode');
  return t && m ? \`prêts (mode=\${m.value})\` : 'ABSENTS';
})()`));
ligne('inscription rapide : envoyée', await ev(`(async () => {
  document.querySelector('#inTeam').value = 'Rapide1';
  document.querySelector('#inSecret').value = 'secret-rapide';
  document.querySelector('#regForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(r=>setTimeout(r,900));
  return (document.querySelector('#regMsg')?.textContent ?? 'RIEN').replace(/\\s+/g,' ').trim().slice(0,60);
})()`));
// le secret a-t-il été pris en compte ?
ligne('le secret protège', await ev(`fetch('/api/register', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ team: 'Rapide1', mode: 'normal' })
}).then(r => r.status)`));
await shoot('3-admin');

console.log('');
if (errs.length) console.log(`erreurs :\n  ${errs.join('\n  ')}`);
ws.close(); process.exit(0);
