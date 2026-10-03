import test from 'node:test';
import assert from 'node:assert/strict';

// La base de test est jetable : chaque run repart de zéro.
process.env.DB_FILE = `/tmp/dq-test-${process.pid}-${Date.now()}.sqlite`;
process.env.QUIET = '1';
// Les tests enchaînent les appels depuis une seule adresse : les plafonds de
// débit, qui existent pour la vraie salle, les bloqueraient. Ils sont testés
// séparément dans test/ratelimit.test.js.
process.env.RATE_LIMIT = 'off';

const { createApp } = await import('../src/server.js');
const { db } = await import('../src/db.js');
const { wipe } = await import('../src/repo/arena.js');
const { quests } = await import('../src/questpack.js');
const { secretFor } = await import('../src/secret.js');

// Programme chargé une fois : `wipe()` ne vide que la base, pas le contenu.
const pack = quests();

const app = createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => {
  server.close();
  db.close();
});

const api = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Arena-Token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

test('healthz répond', async () => {
  const { status, json } = await api('/healthz');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
});

test('inscription : refus sans équipe ou avec un mode invalide', async () => {
  assert.equal((await api('/api/register', { method: 'POST', body: { mode: 'competitive' } })).status, 400);
  assert.equal((await api('/api/register', { method: 'POST', body: { team: 'A' } })).status, 400);
  assert.equal((await api('/api/register', { method: 'POST', body: { team: 'A', mode: 'nope' } })).status, 400);
});

test('inscription : création puis ré-inscription idempotente', async () => {
  const first = await api('/api/register', { method: 'POST', body: { team: 'CyberPhoenix', mode: 'competitive' } });
  assert.equal(first.status, 201);
  assert.equal(first.json.status, 'created');
  assert.match(first.json.token, /^dq_[a-f0-9]{40}$/);

  const again = await api('/api/register', { method: 'POST', body: { team: 'CyberPhoenix', mode: 'competitive' } });
  assert.equal(again.status, 200);
  assert.equal(again.json.status, 'exists');
  assert.equal(again.json.token, first.json.token, 'le token doit être stable');
});

test('inscription : un secret protège le pseudo', async () => {
  await api('/api/register', { method: 'POST', body: { team: 'Securise', mode: 'normal', secret: 'abc' } });
  const bad = await api('/api/register', { method: 'POST', body: { team: 'Securise', mode: 'normal', secret: 'xxx' } });
  assert.equal(bad.status, 409);
  const good = await api('/api/register', { method: 'POST', body: { team: 'Securise', mode: 'normal', secret: 'abc' } });
  assert.equal(good.status, 200);
});

test('soumission : flag inconnu rejeté et tracé', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'Alice', mode: 'competitive' } });

  const bad = await api('/api/submit', { method: 'POST', body: { flag: 'FLAG{NOPE}', token: reg.token } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /invalide/i);
});

test('soumissioncompetitive : barème, score cumulé et déverrouillage', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'Alice', mode: 'competitive' } });
  const [q1, q2, q3] = pack.quests;

  const r1 = await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, q1), token: reg.token } });
  assert.equal(r1.json.status, 'success');
  assert.equal(r1.json.quest_validated, 1);
  assert.ok(r1.json.points_earned >= q1.points, 'le podium ne peut pas faire perdre de points');
  assert.equal(r1.json.score_total, r1.json.points_earned);
  assert.equal(r1.json.breakdown.base, q1.points);
  assert.equal(r1.json.completed_count, `1/${pack.totalQuests}`);
  assert.equal(r1.json.unlocked_next, q2.id);

  const r2 = await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, q2), token: reg.token } });
  assert.equal(r2.json.score_total, r1.json.score_total + r2.json.points_earned);
  assert.equal(r2.json.unlocked_next, q3.id);

  // Doublon : refusé, et le score ne bouge pas.
  const dup = await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, q2), token: reg.token } });
  assert.equal(dup.json.status, 'already_submitted');
  assert.equal(dup.json.score_total, r2.json.score_total);
});

test('soumission normale : mêmes quêtes, zéro point, pas de temps', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'Bob', mode: 'normal' } });

  const r = await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, pack.quests[0]), token: reg.token } });
  assert.equal(r.json.status, 'success');
  assert.equal(r.json.points_earned, 0);
  assert.equal(r.json.score_total, 0);
  assert.equal(r.json.breakdown, null);
  assert.equal(r.json.time_display, null);

  const me = await api('/api/me', { token: reg.token });
  assert.equal(me.json.score, null);
  assert.equal(me.json.rank, null);
  assert.equal(me.json.history[0].time_display, null, 'le temps ne doit pas sortir de l’API en mode normal');
  assert.equal(me.json.progress, `1/${pack.totalQuests}`);
});

test('le classement place le compétitif devant et isole les deux modes', async () => {
  wipe();
  const zen = (await api('/api/register', { method: 'POST', body: { team: 'Zen', mode: 'normal' } })).json;
  await api('/api/register', { method: 'POST', body: { team: 'Vite', mode: 'competitive' } });
  // Zen valide la même quête, mais en mode normal : il doit apparaître dans le
  // tableau de suivi, pas au podium.
  await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: zen.token }, pack.quests[0]), token: zen.token } });

  // Deux compétitifs valident la quête 1 ; le second est deuxième.
  const a = (await api('/api/register', { method: 'POST', body: { team: 'Alpha', mode: 'competitive' } })).json;
  const b = (await api('/api/register', { method: 'POST', body: { team: 'Bravo', mode: 'competitive' } })).json;
  const ra = await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: a.token }, pack.quests[0]), token: a.token } });
  const rb = await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: b.token }, pack.quests[0]), token: b.token } });

  assert.equal(ra.json.breakdown.speed_bonus, 60);
  assert.equal(rb.json.breakdown.speed_bonus, 30);

  const ov = await api('/api/overview');
  assert.equal(ov.json.competitive.length, 3); // Vite, A, B
  assert.equal(ov.json.normal.length, 1);      // Zen
  assert.equal(ov.json.normal[0].score, 0, 'le mode normal ne porte pas de score');
  assert.deepEqual(ov.json.normal[0].completed, [1]);
  assert.equal(ov.json.meta.total_quests, pack.totalQuests);
  assert.ok(ov.json.competitive.every((p) => typeof p.rank === 'number'));
});

test('par défaut aucune mission n\'est verrouillée', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'Libre', mode: 'normal' } });

  const q = (await api('/api/quests', { token: reg.token })).json;
  assert.equal(q.linear_progression, false);
  const flat = q.modules.flatMap((m) => m.quests);
  assert.equal(flat.filter((x) => x.locked).length, 0,
    'un étudiant bloqué doit pouvoir consulter n\'importe quelle mission');
});

test('on peut valider une mission tardive sans avoir fait les précédentes', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'Chasseur', mode: 'competitive' } });

  // Mission n° 26, le boss final, en premier.
  const boss = pack.quests.at(-1);
  const r = await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, boss), token: reg.token } });
  assert.equal(r.json.status, 'success', 'aucun contrôle d\'ordre ne doit bloquer');
  assert.equal(r.json.quest_validated, boss.number);
  assert.equal(r.json.breakdown.base, boss.points, 'le barème est inchangé');

  // Le score cumule, et les missions manquantes restent accessibles.
  const me = (await api('/api/me', { token: reg.token })).json;
  assert.equal(me.score, r.json.score_total);
  assert.equal(me.progress, `1/${pack.totalQuests}`);
  assert.ok(me.next_quest, 'le serveur propose toujours une suite');

  const q = (await api('/api/quests', { token: reg.token })).json;
  assert.equal(q.modules.flatMap((m) => m.quests).filter((x) => x.locked).length, 0);
});

test('valider dans le désordre ne fausse ni le score ni le classement', async () => {
  wipe();
  const a = (await api('/api/register', { method: 'POST', body: { team: 'OrdreA', mode: 'competitive' } })).json;
  const b = (await api('/api/register', { method: 'POST', body: { team: 'OrdreB', mode: 'competitive' } })).json;

  // A valide dans l'ordre, B valide à l'envers.
  for (const q of pack.quests.slice(0, 3)) {
    await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: a.token }, q), token: a.token } });
  }
  for (const q of [...pack.quests].slice(0, 3).reverse()) {
    await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: b.token }, q), token: b.token } });
  }

  const ma = (await api('/api/me', { token: a.token })).json;
  const mb = (await api('/api/me', { token: b.token })).json;

  // Les points de base sont indépendants de l'ordre : les deux joueurs ont
  // validé les mêmes trois missions, donc la même base cumulée.
  assert.equal(ma.progress, mb.progress);
  assert.equal(ma.history.length, 3);
  assert.equal(mb.history.length, 3);
  const base = (me) => me.history.reduce((a, h) => a + h.points, 0);
  assert.equal(base(ma), base(mb));
  assert.equal(base(ma), pack.quests.slice(0, 3).reduce((a, q) => a + q.points, 0));

  // L'écart de score ne peut venir que des bonus, pas de l'ordre de saisie.
  // A est arrivé premier sur chaque quête (60 pts de podium), B deuxième
  // (30 pts). Le bonus de rapidité dépend aussi du temps, donc on borne large.
  const podium = (me) => me.history.reduce((a, h) => a + h.speed_bonus, 0);
  assert.equal(podium(ma), 3 * 60, 'A a été premier sur les trois');
  assert.equal(podium(mb), 3 * 30, 'B a été deuxième sur les trois');
  assert.equal(ma.score - base(ma) - podium(ma), ma.history.reduce((a, h) => a + h.pace_bonus, 0));
  assert.equal(mb.score - base(mb) - podium(mb), mb.history.reduce((a, h) => a + h.pace_bonus, 0));

  // Le podium attribue bien les bonus aux premiers arrivants.
  const ra = (await api('/api/leaderboard/competitive')).json.leaderboard;
  assert.equal(ra.length, 2);
  assert.ok(ra[0].rank === 1 && ra[1].rank === 2);
});

test('un visiteur anonyme voit le programme mais tout verrouillé', async () => {
  const q = (await api('/api/quests')).json;
  const flat = q.modules.flatMap((m) => m.quests);
  assert.ok(flat.length > 0);
  assert.ok(flat.every((x) => x.locked === false), 'le contenu reste lisible sans compte');
  assert.equal(q.mode, null);
});

test('le portail suit la dernière soumission', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'Horodatage', mode: 'competitive' } });
  assert.equal(reg.last_submission, undefined);

  let ov = (await api('/api/overview')).json;
  assert.equal(ov.competitive[0].last_submission, '-', 'rien de soumis au départ');

  await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, pack.quests[0]), token: reg.token } });

  ov = (await api('/api/overview')).json;
  const heure = ov.competitive[0].last_submission;
  assert.match(heure, /^\d{2}:\d{2}:\d{2}$/, `horodatage inattendu : « ${heure} »`);
});

test('la correction n\'est envoyée qu\'après validation', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'Copieur', mode: 'normal' } });

  const before = (await api('/api/quests', { token: reg.token })).json;
  const q1 = before.modules.flatMap((m) => m.quests)[0];
  assert.equal(q1.solution, null,
    'la correction ne doit pas circuler avant la validation : un étudiant pourrait la lire dans l\'onglet réseau');

  await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, q1), token: reg.token } });

  const after = (await api('/api/quests', { token: reg.token })).json;
  assert.ok(after.modules.flatMap((m) => m.quests)[0].solution?.length > 20,
    'la correction est transmise une fois la mission validée');
});

test('un visiteur anonyme ne reçoit aucune correction', async () => {
  const q = (await api('/api/quests')).json;
  const flat = q.modules.flatMap((m) => m.quests);
  assert.ok(flat.every((x) => x.solution === null));
});

test('sans token, submit et me sont refusés', async () => {
  wipe();
  assert.equal((await api('/api/submit', { method: 'POST', body: { flag: 'FLAG{X}' } })).status, 404);
  assert.equal((await api('/api/me')).status, 401);
});

test('l\'administration permet de remettre un joueur à zéro', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'AReprendre', mode: 'competitive' } });
  await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, pack.quests[0]), token: reg.token } });
  assert.equal((await api('/api/me', { token: reg.token })).json.score > 0, true);

  const reset = await api('/api/admin/reset/AReprendre', { method: 'POST' });
  assert.equal(reset.status, 200);

  const me = (await api('/api/me', { token: reg.token })).json;
  assert.equal(me.score, 0);
  assert.equal(me.progress, `0/${pack.totalQuests}`, 'la progression repart de zéro');
  assert.equal(me.rank, 1, 'le joueur reste inscrit et reclassé');

  assert.equal((await api('/api/admin/reset/Inexistant', { method: 'POST' })).status, 404);
});

test('changer de mode remet le score à zéro', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'Converti', mode: 'competitive' } });
  await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, pack.quests[0]), token: reg.token } });

  const r = await api('/api/admin/mode/Converti', { method: 'POST', body: { mode: 'normal' } });
  assert.equal(r.json.mode, 'normal');

  const me = (await api('/api/me', { token: reg.token })).json;
  assert.equal(me.mode, 'normal');
  assert.equal(me.score, null, 'le mode normal ne porte aucun score');
});

test('le flux SSE pousse un état au changement', async () => {
  wipe();
  const ac = new AbortController();
  const res = await fetch(`${base}/api/live`, { signal: ac.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');

  const reader = res.body.getReader();
  const first = await reader.read();
  const text = new TextDecoder().decode(first.value);
  assert.match(text, /event: overview/);
  assert.match(text, /"competitive"/);

  await api('/api/register', { method: 'POST', body: { team: 'SSE', mode: 'competitive' } });
  ac.abort();
});