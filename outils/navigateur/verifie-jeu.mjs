/**
 * Joue une session complète sur la vraie page, dans un vrai Chromium.
 *
 * Ce que `--dump-dom` et les tests unitaires ne peuvent pas faire : vérifier
 * que ce que l'élève voit est bien ce qu'on croit. Les 70 questions de
 * compréhension étaient dans le contenu, vérifiées par le serveur, et
 * **absentes de l'écran** — aucun test ne l'avait vu, parce que tous
 * testaient du JavaScript avec un DOM de substitution.
 *
 * Le parcours est celui d'un élève : inscription, ouverture de la mission,
 * indice, réponse aux questions, validation, relecture après rechargement.
 *
 *   node verifie-jeu.mjs http://127.0.0.1:8097 [équipe]
 */

const base = process.argv[2] ?? 'http://127.0.0.1:8097';
const equipe = process.argv[3] ?? `Pilote${Date.now() % 10000}`;
const quetes = (process.argv[4] ?? '4,9,21').split(',').map(Number);
const PORT = Number(process.argv[5] ?? 9222);
const cibles = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = cibles.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });

let id = 0;
const attentes = new Map();
const journaux = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && attentes.has(msg.id)) {
    const { ok, ko } = attentes.get(msg.id);
    attentes.delete(msg.id);
    msg.error ? ko(new Error(JSON.stringify(msg.error))) : ok(msg.result);
  } else if (msg.method === 'Log.entryAdded') {
    journaux.push(`[${msg.params.entry.level}] ${msg.params.entry.text}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    journaux.push(`[exception] ${d.exception?.description ?? d.text}`);
  }
};
const envoyer = (method, params = {}) => new Promise((ok, ko) => {
  id += 1; attentes.set(id, { ok, ko });
  ws.send(JSON.stringify({ id, method, params }));
});
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluer(expression) {
  const { result, exceptionDetails } = await envoyer('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(`évaluation : ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
  }
  return result.value;
}

/** Attend qu'une expression devienne vraie. Renvoie false au bout du délai. */

/**
 * Où poser les captures. Hors du dépôt, et configurable : les PNG de recette
 * n'ont rien à y faire, et le répertoire de travail de l'agent n'existe pas
 * chez l'enseignant.
 */
const SORTIE = process.env.ATELIER_SHOTS ?? '/tmp/atelier-shots';

async function attendreQue(expression, ms = 15_000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await evaluer(`(() => { try { return !!(${expression}); } catch { return false; } })()`)) return true;
    await attendre(200);
  }
  return false;
}

await envoyer('Page.enable');
await envoyer('Runtime.enable');
await envoyer('Log.enable').catch(() => {});
// Le cache désactivé n'est pas un détail : sans lui, Chromium sert l'ancien
// `app.js` et le pilote rapporte fidèlement un bug déjà corrigé. C'est arrivé.
await envoyer('Network.enable');
await envoyer('Network.setCacheDisabled', { cacheDisabled: true });
await envoyer('Emulation.setDeviceMetricsOverride', {
  width: 1500, height: 2600, deviceScaleFactor: 1, mobile: false,
});

// ── inscription, par l'API, puis on amorce la session comme le formulaire le fait
await envoyer('Page.navigate', { url: `${base}/` });
await attendreQue('document.readyState === "complete"');
await attendre(600);

const jeton = await evaluer(`(async () => {
  const r = await fetch('/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team: ${JSON.stringify(equipe)}, mode: 'normal' }),
  });
  const d = await r.json();
  localStorage.setItem('atelier-docker:v2',
    JSON.stringify({ token: d.token, team: d.team, mode: d.mode }));
  return d.token;
})()`);

// ── la vraie page, en session
await envoyer('Page.navigate', { url: `${base}/#/` });
await attendreQue('document.readyState === "complete"');
const laCharge = await attendreQue('document.querySelector("#questPanel .quest-head h2")', 20_000);
const { writeFileSync } = await import('node:fs');

const captures = [];
const capture = async (nom) => {
  const { data } = await envoyer('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
  });
  const f = `${SORTIE}/jeu-${nom}.png`;
  writeFileSync(f, Buffer.from(data, 'base64'));
  captures.push(f);
  return f;
};

const bilan = [];
const ligne = (k, v) => bilan.push(`${(k + ' ').padEnd(30, '.')} ${v}`);

ligne('session ouverte', `${equipe} · ${await evaluer('document.querySelector("#teamName")?.textContent')} · ${laCharge ? 'oui' : 'NON'}`);

// ── l'affichage général : plus un point, plus un NaN
const texte = await evaluer('document.body.innerText.replace(/\\s+/g, " ")');
ligne('occurrences de « pts »', (texte.match(/pts/g) ?? []).length);
ligne('« NaN »', texte.includes('NaN'));
ligne('« undefined »', texte.includes('undefined'));
ligne('compteur du programme', await evaluer('document.querySelector("#questMap .map-count")?.textContent'));
ligne('bandeau', await evaluer('document.querySelector("#questMap .map-next-t")?.textContent'));
ligne('mode affiché', await evaluer('document.querySelector("#modeChip")?.textContent'));
ligne('niveau', await evaluer('document.querySelector("#levelVal")?.textContent'));
ligne('autonomie', await evaluer('document.querySelector("#autonomyVal")?.textContent'));

// ── pour chaque quête : les QCM, un indice, une réponse, la validation
for (const n of quetes) {
  await evaluer(`document.querySelectorAll('#questMap .qitem')[${n - 1}]?.click()`);
  await attendreQue(`document.querySelector('#questPanel .quest-head h2')
    && [...document.querySelectorAll('#questMap .qitem')].findIndex(q =>
      q.classList.contains('active')) === ${n - 1}`, 12_000);
  await attendre(700);

  const qcm = await evaluer(`document.querySelectorAll('#questPanel .qcm').length`);
  const choix = await evaluer(`document.querySelectorAll('#questPanel .qcm-choice').length`);
  const reflexe = await evaluer(`!!document.querySelector('#questPanel .recall-input')`);
  const par = await evaluer(`(() => {
    const t = document.querySelector('#questPanel .checkpoint')?.previousElementSibling;
    return t?.className ?? '?';
  })()`);
  const avant = par === 'compr';
  ligne(`quête ${n} · QCM`, `${qcm} carte(s), ${choix} choix${reflexe ? ', réflexe' : ''}`);
  ligne(`quête ${n} · placement`, `point de contrôle → ${par === 'compr' ? 'compréhension' : par} → formulaire`);

  // Un indice, pour voir ce que dit le mode Sans stress.
  await evaluer(`[...document.querySelectorAll('#questPanel button')]
    .find(b => /indice/i.test(b.textContent))?.click()`);
  await attendre(700);
  const cout = await evaluer(`document.querySelector('#questPanel .hint-free, #questPanel .hint-cost')
    ?.textContent?.replace(/\\s+/g, ' ').trim() ?? 'RIEN'`);
  ligne(`quête ${n} · indice`, cout.slice(0, 90));
  if (n === quetes[0]) await capture(`q${n}-indices`);

  // Répondre juste à toutes les questions : le serveur a le contenu, le
  // pilote aussi. On lit la bonne réponse par l'API du secret — non, on
  // triche : on demande la correction de chaque question via le serveur en
  // essaie chaque choix jusqu'à « juste ». C'est ce que ferait un élève.
  const reussies = await evaluer(`(async () => {
    const equipes = [...document.querySelectorAll('#questPanel .qcm')]
      .filter(c => !c.classList.contains('qcm-recall'));
    let justes = 0;
    for (const carte of equipes) {
      for (const b of [...carte.querySelectorAll('.qcm-choice')]) {
        if (b.disabled) { justes += 1; break; }
        b.click();
        await new Promise(r => setTimeout(r, 500));
        if (/Juste/.test(carte.textContent)) { justes += 1; break; }
      }
    }
    return justes;
  })()`);
  ligne(`quête ${n} · questions`, `${reussies}/${qcm} répondues`);
  ligne(`quête ${n} · justification`, await evaluer(
    `document.querySelectorAll('#questPanel .qcm .why').length > 0 ? 'affichée' : 'ABSENTE'`));
  if (n === quetes[0]) await capture(`q${n}-qcm`);

  // Validation
  await evaluer(`(async () => {
    const questId = document.querySelector('#questPanel .fetch-hint')?.dataset?.quest;
    return questId ?? null;
  })()`);
  const flag = await evaluer(`(async () => {
    const actif = [...document.querySelectorAll('#questMap .qitem.active')][0];
    const num = [...document.querySelectorAll('#questMap .qitem')].indexOf(actif) + 1;
    const prog = await (await fetch('/api/quests', {
      headers: { 'X-Arena-Token': ${JSON.stringify(jeton)} },
    })).json();
    const q = prog.modules.flatMap(m => m.quests).find(x => x.number === num);
    const r = await fetch('/api/secret/' + q.id + '/raw?token=' + ${JSON.stringify(jeton)});
    return (await r.text()).trim();
  })()`);
  await evaluer(`(() => {
    const i = document.querySelector('#questPanel #flagInput');
    i.value = ${JSON.stringify(flag)};
    document.querySelector('#questPanel .submit-box')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await attendre(1200);
  // Le bilan est une carte `.success`, posée à l'endroit où l'élève a agi —
  // pas un message dans le formulaire, qui n'existe plus pour une quête
  // validée. C'est exactement le défaut que le premier pilote a trouvé.
  const carte = await evaluer(`(() => {
    const c = document.querySelector('#questPanel .success');
    return c ? c.textContent.replace(/\\s+/g, ' ').trim() : 'RIEN';
  })()`);
  ligne(`quête ${n} · bilan`, carte.slice(0, 170));
  ligne(`quête ${n} · ratios de maîtrise`, await evaluer(
    `[...document.querySelectorAll('#questPanel .success .breakdown li')]
       .map(li => li.textContent.replace(/\\s+/g, ' ').trim()).join(' · ') || 'AUCUN'`));
  ligne(`quête ${n} · mission suivante`, await evaluer(
    `document.querySelector('#questPanel .next-box')?.textContent
       .replace(/\\s+/g, ' ').trim().slice(0, 70) ?? 'ABSENTE'`));
  if (n === quetes[0]) await capture(`q${n}-validation`);
}

// ── rechargement : la réponse doit être relue depuis la base
await envoyer('Page.navigate', { url: `${base}/#/` });
await attendreQue('document.querySelector("#questPanel .quest-head h2")', 20_000);
await attendre(1200);
await evaluer(`[...document.querySelectorAll('#questMap .qitem')].find(q => q.classList.contains('done'))?.click()`);
await attendre(1200);
ligne('après rechargement', await evaluer(`(() => {
  const c = document.querySelector('#questPanel .qcm');
  return c ? (/Juste/.test(c.textContent) ? 'réponse relue (Juste)' : 'RIEN DANS LA BASE')
           : 'aucun QCM rendu';
})()`));
ligne('historique', (await evaluer(
  `document.querySelector('#historyBox')?.textContent.replace(/\\s+/g, ' ').trim() ?? '—'`)
).slice(0, 130));
await capture('historique');

console.log(bilan.join('\n'));
if (journaux.length) console.log(`\nconsole :\n  ${journaux.join('\n  ')}`);
console.log(`\ncaptures :\n  ${captures.join('\n  ')}`);

ws.close();
process.exit(0);
