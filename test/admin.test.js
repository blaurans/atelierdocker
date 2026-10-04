import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * La règle d'administration : un mot de passe, dans le `.env`, et rien derrière
 * sans lui.
 *
 * Ce fichier teste trois choses qui n'existaient pas avant :
 *
 * - le serveur **refuse de démarrer** sans mot de passe. Avant, une clé vide
 *   signifiait « lab ouvert » et toutes les routes d'administration répondaient —
 *   y compris la suppression d'inscriptions, sur une URL publique ;
 * - la vue de classe (`/api/overview`, `/api/live`) est derrière le même mot de
 *   passe. Elle liste tous les élèves avec leur adresse IP ;
 * - le mot de passe ne sert qu'à obtenir un jeton, transporté par un cookie
 *   `HttpOnly; SameSite=Strict`, que le JavaScript du portail ne peut pas lire.
 */
process.env.DB_FILE = `/tmp/dq-admin-${process.pid}-${Date.now()}.sqlite`;
process.env.QUIET = '1';
process.env.RATE_LIMIT = 'off';
const MOT_DE_PASSE = 'mot-de-passe-de-test';
process.env.ADMIN_KEY = MOT_DE_PASSE;

const { createApp, verifierAdmin, genererMotDePasse } = await import('../src/server.js');
const { db } = await import('../src/db.js');
const { config } = await import('../src/config.js');
const { wipe } = await import('../src/repo/arena.js');
const {
  motDePasseCorrect, creerJeton, jetonValide,
} = await import('../src/admin_session.js');

const app = createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => { server.close(); db.close(); });

/** Un appel, en gardant les en-têtes de réponse — il faut le `Set-Cookie`. */
const brut = async (path, { method = 'GET', body, key, headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'X-Arena-Admin': key } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status,
    json: await res.json().catch(() => null),
    cookie: res.headers.getSetCookie?.() ?? [],
  };
};

const cookie = (r) => r.cookie.map((c) => c.split(';')[0]).join('; ');

/* --------------------------------------------------------- sans mot de passe */

test('le serveur refuse de démarrer sans mot de passe', () => {
  const avant = config.adminKey;
  try {
    config.adminKey = '';
    assert.equal(verifierAdmin(), false,
      'une clé vide doit faire échouer la vérification');
  } finally {
    config.adminKey = avant;
  }
  assert.equal(verifierAdmin(), true, 'avec un mot de passe, la vérification passe');
});

test('le mot de passe proposé est utilisable', () => {
  const mdp = genererMotDePasse();
  assert.match(mdp, /^[A-Za-z0-9_-]{20,}$/);
  assert.notEqual(mdp, genererMotDePasse(), 'deux mots de passe, jamais identiques');
  // Il n'estacceptable ni en base64 avec `/`, ni avec `=` : ces caractères
  // cassent l'en-tête HTTP et le `.env`.
  assert.doesNotMatch(mdp, /[/+=]/);
});

test('sans clé configurée, l\'administration répond 503 et pas 401', async () => {
  // 503 et non 401 : ce n'est pas un accès refusé, c'est un déploiement cassé.
  // La différence compte dans les logs — un 401 veut dire « mauvais mot de
  // passe », un 503 veut dire « personne n'en a posé ».
  const avant = config.adminKey;
  config.adminKey = '';
  try {
    const r = await brut('/api/overview');
    assert.equal(r.status, 503);
    assert.match(r.json.error, /ADMIN_KEY/);
  } finally {
    config.adminKey = avant;
  }
});

/* ------------------------------------------------------------ la comparaison */

test('le mot de passe se compare correctement, et seulement lui', () => {
  assert.equal(motDePasseCorrect(MOT_DE_PASSE), true);
  assert.equal(motDePasseCorrect('mauvais'), false);
  assert.equal(motDePasseCorrect(''), false);
  assert.equal(motDePasseCorrect(undefined), false);
  assert.equal(motDePasseCorrect(null), false);
  // Une longueur différente ne doit pas lever : c'est le rôle du hachage.
  assert.equal(motDePasseCorrect('x'.repeat(4000)), false);
  assert.equal(motDePasseCorrect(MOT_DE_PASSE + ' '), false);
});

/* ----------------------------------------------------------------- le jeton */

test('un jeton ne vaut que dans la durée annoncée', () => {
  const jeton = creerJeton();
  assert.equal(jetonValide(jeton), true);

  // Faux d'une milliseconde après l'expiration.
  const expire = Number(jeton.split('.')[0]);
  assert.equal(jetonValide(jeton, expire), false);
  assert.equal(jetonValide(jeton, expire - 1), true);

  // Un jeton falsifié : la signature ne correspond plus.
  const [entete] = jeton.split('.');
  assert.equal(jetonValide(`${Number(entete) + 999999999}.falsifie`), false);
  assert.equal(jetonValide('pas-un-jeton'), false);
  assert.equal(jetonValide(''), false);
  assert.equal(jetonValide(null), false);
});

/* ------------------------------------------------------------ ce qui est fermé */

test('la vue de classe exige le mot de passe', async () => {
  // C'est le point de ce changement : `/api/overview` listait tous les élèves
  // et leurs IP, à quiconque trouvait l'adresse.
  for (const chemin of ['/api/overview', '/api/stats']) {
    assert.equal((await brut(chemin)).status, 401, `${chemin} doit être fermé`);
    assert.equal((await brut(chemin, { key: 'mauvais' })).status, 401,
      `${chemin} ne doit pas s'ouvrir sur un mauvais mot de passe`);
    assert.equal((await brut(chemin, { key: MOT_DE_PASSE })).status, 200,
      `${chemin} doit s'ouvrir sur le bon mot de passe`);
  }
});

test('le flux live exige le mot de passe', async () => {
  const ac = new AbortController();
  const refus = await fetch(`${base}/api/live`, { signal: ac.signal });
  assert.equal(refus.status, 401);
  ac.abort();

  const ac2 = new AbortController();
  const ok = await fetch(`${base}/api/live`, {
    signal: ac2.signal, headers: { 'X-Arena-Admin': MOT_DE_PASSE },
  });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /text\/event-stream/);
  ac2.abort();
});

test('toutes les actions d\'administration exigent le mot de passe', async () => {
  wipe();
  const inscrit = (await brut('/api/register', {
    method: 'POST', body: { team: 'Cible', mode: 'normal' },
  })).json;

  const actions = [
    ['POST', '/api/admin/reset/Cible', { confirm: 'oui' }],
    ['POST', '/api/admin/delete/Cible', {}],
    ['POST', '/api/admin/mode/Cible', { mode: 'competitive' }],
    ['POST', '/api/admin/attest/Cible/m1-01-diagnostiquer-la-machine', {}],
    ['POST', '/api/admin/seed', {}],
  ];

  for (const [method, chemin, body] of actions) {
    const sans = await brut(chemin, { method, body });
    assert.equal(sans.status, 401, `${chemin} doit refuser sans mot de passe`);
    assert.match(sans.json.error, /mot de passe/i);
  }

  // Et le joueur est intact : un refus ne doit rien avoir touché.
  const me = (await brut('/api/me', { headers: { 'X-Arena-Token': inscrit.token } })).json;
  assert.equal(me.team, 'Cible');
  assert.equal(me.progress, `0/${27}`);
});

/* ------------------------------------------------------------ la session */

test('le mot de passe est échangé contre un cookie HttpOnly', async () => {
  const mauvais = await brut('/api/admin/session', {
    method: 'POST', body: { password: 'faux' },
  });
  assert.equal(mauvais.status, 401);
  assert.equal(mauvais.cookie.length, 0, 'aucun cookie sur un échec');

  const ok = await brut('/api/admin/session', {
    method: 'POST', body: { password: MOT_DE_PASSE },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.cookie.length, 1);

  const entete = ok.cookie[0];
  assert.match(entete, /^dq_admin=/, 'le cookie porte le jeton');
  assert.match(entete, /HttpOnly/, 'HttpOnly : le JavaScript du portail ne le lit pas');
  assert.match(entete, /SameSite=Strict/, 'SameSite=Strict : aucun envoi depuis un autre site');
  assert.match(entete, /Path=\//);
  // Le mot de passe ne doit se retrouver nulle part dans la réponse.
  assert.doesNotMatch(JSON.stringify(ok.json), new RegExp(MOT_DE_PASSE));
});

test('le mot de passe ne voyage pas dans le cookie, seulement le jeton', async () => {
  const r = await brut('/api/admin/session', {
    method: 'POST', body: { password: MOT_DE_PASSE },
  });
  assert.doesNotMatch(r.cookie[0], new RegExp(MOT_DE_PASSE),
    'le mot de passe en clair dans un cookie : le « HttpOnly » ne protégerait plus rien');
  assert.match(r.cookie[0], /dq_admin=[0-9]+\./, 'un jeton, signé et daté');
});

test('le cookie ouvre la session, et la fermeture la referme', async () => {
  const ouverte = await brut('/api/admin/session', {
    method: 'POST', body: { password: MOT_DE_PASSE },
  });
  const c = cookie(ouverte);

  assert.equal((await brut('/api/overview', { headers: { Cookie: c } })).status, 200,
    'le cookie seul suffit — c\'est lui que le navigateur envoie');

  const fermee = await brut('/api/admin/session', { method: 'DELETE', headers: { Cookie: c } });
  assert.equal(fermee.status, 200);
  assert.match(fermee.cookie[0], /Max-Age=0/, 'la fermeture doit demander au navigateur d\'oublier');

  // Un cookie falsifié ne passe pas.
  const faux = 'dq_admin=99999999999.falsifie';
  assert.equal((await brut('/api/overview', { headers: { Cookie: faux } })).status, 401);
});

test('un cookie volé sur une autre origine ne suffit pas', async () => {
  // SameSite=Strict : le cookie n'est pas envoyé sur une requête initiée par un
  // autre site. On ne peut pas le vérifier depuis le serveur — mais on peut
  // vérifier que l'attribut est bien là, et que c'est lui qui fait le travail.
  const r = await brut('/api/admin/session', {
    method: 'POST', body: { password: MOT_DE_PASSE },
  });
  assert.match(r.cookie[0], /SameSite=Strict/);
  assert.doesNotMatch(r.cookie[0], /SameSite=None/,
    'SameSite=None est l\'inverse exact de ce qu\'on veut');
});

/* ------------------------------------------------------- la remise à zéro */

test('la remise à zéro exige une confirmation explicite', async () => {
  wipe();
  await brut('/api/register', { method: 'POST', body: { team: 'ARepartir', mode: 'normal' } });

  // Avec le mot de passe mais sans confirmation : refus.
  const sans = await brut('/api/admin/reset/ARepartir', {
    method: 'POST', key: MOT_DE_PASSE, body: {},
  });
  assert.equal(sans.status, 400);
  assert.match(sans.json.error, /confirm/);

  // Avec la confirmation : ça passe.
  const avec = await brut('/api/admin/reset/ARepartir', {
    method: 'POST', key: MOT_DE_PASSE, body: { confirm: 'oui' },
  });
  assert.equal(avec.status, 200);
});

test('changer de mode efface le parcours, et le dit', async () => {
  wipe();
  const r = await brut('/api/admin/mode/Converti2', {
    method: 'POST', key: MOT_DE_PASSE, body: { mode: 'normal' },
  });
  assert.equal(r.status, 404, 'un pseudo inconnu reste un 404');

  await brut('/api/register', { method: 'POST', body: { team: 'Converti2', mode: 'competitive' } });
  const ok = await brut('/api/admin/mode/Converti2', {
    method: 'POST', key: MOT_DE_PASSE, body: { mode: 'normal' },
  });
  assert.equal(ok.status, 200);
  // L'écran doit prévenir : perdre sa progression n'est pas évident.
  assert.match(ok.json.message, /recommence|repart de zéro/);
});

/* ----------------------------------------------------------- la page /admin */

test('la page /admin est publique — c\'est elle le formulaire', async () => {
  // La mettre derrière le mot de passe顯示rait `{"error":"…"}` à un enseignant
  // qui ouvre son favori. La page montre le champ à remplir ; ce qu'elle
  // affiche ensuite part par l'API, qui est fermée.
  const r = await fetch(`${base}/admin`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /text\/html/);
  assert.match(r.headers.get('cache-control') ?? '', /no-store/,
    'une page d\'administration ne se met pas en cache : après expiration de la session, un cache la montrerait encore');

  const page = await r.text();
  assert.match(page, /id="mdp"/, 'le champ du mot de passe');
  assert.match(page, /ATELIER_ADMIN_KEY/, 'et il faut dire où le trouver');

  // Le mot de passe ne doit être transmis que par la session : ni stocké, ni
  // lu d'un champ par le reste du code.
  assert.doesNotMatch(page, /adminKey/i, 'la clé ne doit pas apparaître dans la page');
  assert.doesNotMatch(page, /localStorage|sessionStorage/,
    'rien ne doit être stocké côté navigateur : le cookie HttpOnly suffit');
});

test('l\'état de la session est public, le reste ne l\'est pas', async () => {
  // `GET /api/admin/session` doit répondre sans mot de passe : c'est lui qui
  // dit à la page s'il faut le demander. Il ne renvoie rien de sensible.
  const r = await brut('/api/admin/session');
  assert.equal(r.status, 200);
  assert.equal(r.json.authenticated, false);
  assert.deepEqual(Object.keys(r.json).sort(), ['authenticated', 'ok', 'ttl_hours']);
});

test('le journal note les refus de mot de passe', async () => {
  wipe();
  await brut('/api/admin/session', { method: 'POST', body: { password: 'faux' } });
  const r = await brut('/api/stats', { key: MOT_DE_PASSE });
  assert.ok(r.json.recent_events.some((e) => e.kind === 'admin-refused'),
    'une rafale d\'échecs doit laisser une trace : c\'est le seul signal');
});
