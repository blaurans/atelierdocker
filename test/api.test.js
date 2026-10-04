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

const api = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Arena-Token': token } : {}),
      ...headers,
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

test('soumission : la maîtrise progresse et le déverrouillage suit', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'Alice', mode: 'competitive' } });
  const [q1, q2, q3] = pack.quests;

  const r1 = await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, q1), token: reg.token } });
  assert.equal(r1.json.status, 'success');
  assert.equal(r1.json.quest_validated, 1);
  assert.equal(r1.json.completed_count, `1/${pack.totalQuests}`);
  assert.equal(r1.json.mastery.done, 1);
  // Pas de points nulle part : le score est mort.
  assert.equal(r1.json.points_earned, undefined);
  assert.equal(r1.json.score_total, undefined);
  assert.equal(r1.json.breakdown, undefined);
  assert.equal(r1.json.rank, undefined);
  // Validée sans indice, elle compte pour l'autonomie.
  assert.equal(r1.json.quest_result.autonomous, true);
  assert.equal(r1.json.mastery.autonomous, 1);
  assert.equal(r1.json.unlocked_next, q2.id);

  const r2 = await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, q2), token: reg.token } });
  assert.equal(r2.json.mastery.done, 2);
  assert.equal(r2.json.unlocked_next, q3.id);

  // Doublon : refusé, et la maîtrise ne bouge pas.
  const dup = await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, q2), token: reg.token } });
  assert.equal(dup.json.status, 'already_submitted');
  assert.equal(dup.json.mastery, undefined, 'une revalidation ne renvoie pas d\'état');
});

test('soumission normale : mêmes quêtes, mêmes chiffres qu’en Challenge', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'Bob', mode: 'normal' } });

  const r = await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, pack.quests[0]), token: reg.token } });
  assert.equal(r.json.status, 'success');
  assert.equal(r.json.mastery.done, 1);
  assert.equal(r.json.points_earned, undefined);
  assert.equal(r.json.score_total, undefined);

  const me = await api('/api/me', { token: reg.token });
  // Les deux modes mesurent la même chose : il n'y a plus de « zéro point »
  // propre au mode normal, parce qu'il n'y a plus de point du tout.
  assert.equal(me.json.score, undefined);
  assert.equal(me.json.rank, undefined);
  assert.equal(me.json.mastery.done, 1);
  // Le temps, lui, reste visible : c'est une mesure d'inconfort, pas de
  // performance, et l'enseignant en a besoin pendant la séance.
  assert.notEqual(me.json.history[0].time_ms, null);
  assert.equal(me.json.progress, `1/${pack.totalQuests}`);
});

test('un indice est facturé une fois, et seulement une fois', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'Facture', mode: 'competitive' } });
  const q = pack.quests[0];
  const total = q.hint_count;

  // Deux requêtes successives servent deux indices *différents* : l'endpoint
  // sert « le suivant », il n'y a pas d'index demandé. C'est le comportement
  // voulu — un double-clic fait bien perdre deux indices, et c'est pourquoi le
  // bouton est désactivé pendant l'appel.
  const r1 = await api(`/api/quests/${q.id}/hint`, { method: 'POST', token: reg.token });
  const r2 = await api(`/api/quests/${q.id}/hint`, { method: 'POST', token: reg.token });
  assert.equal(r1.json.index, 0);
  assert.equal(r2.json.index, 1);
  assert.notEqual(r1.json.hint, r2.json.hint, 'chaque appel doit servir un indice différent');

  // Une fois épuisé, plus rien — et ce n'est pas une erreur.
  for (let i = 2; i < total; i++) {
    await api(`/api/quests/${q.id}/hint`, { method: 'POST', token: reg.token });
  }
  const epuise = await api(`/api/quests/${q.id}/hint`, { method: 'POST', token: reg.token });
  assert.equal(epuise.status, 200, 'épuisé n\'est pas une erreur HTTP');
  assert.equal(epuise.json.status, 'exhausted');
  assert.equal(epuise.json.hint, null);

  // La ligne en base ne dépasse jamais le nombre d'indices du contenu, quel que
  // soit le nombre d'appels : c'est le serveur qui borne, pas le client.
  const n = db.prepare('SELECT COUNT(*) AS n FROM hint_uses h JOIN players p ON p.id = h.player_id WHERE p.token = ?')
    .get(reg.token).n;
  assert.equal(n, total, `exactement ${total} indices consommés, pas plus`);

  // La quête validée après ces indices n'est pas autonome.
  const flag = secretFor({ token: reg.token }, q);
  const sub = await api('/api/submit', { method: 'POST', body: { flag }, token: reg.token });
  assert.equal(sub.json.quest_result.autonomous, false);
  assert.equal(sub.json.mastery.autonomous, 0);
});

test('le portail ne classe plus les élèves', async () => {
  wipe();
  await api('/api/register', { method: 'POST', body: { team: 'Zen', mode: 'normal' } });
  await api('/api/register', { method: 'POST', body: { team: 'Vite', mode: 'competitive' } });
  const alpha = (await api('/api/register', { method: 'POST', body: { team: 'Alpha', mode: 'competitive' } })).json;
  const bravo = (await api('/api/register', { method: 'POST', body: { team: 'Bravo', mode: 'competitive' } })).json;

  // Alpha valide en premier, donc il passe « devant » au sens de la V1.
  // La seule chose qui doit changer ici est l'absence de classement.
  await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: alpha.token }, pack.quests[0]), token: alpha.token } });
  await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: bravo.token }, pack.quests[0]), token: bravo.token } });

  const ov = await api('/api/overview');
  // Une seule liste, tous modes confondus : le portail ne trie plus par score.
  assert.equal(Array.isArray(ov.json.players), true);
  assert.equal(ov.json.competitive, undefined, 'plus de classement compétitif');
  assert.equal(ov.json.normal, undefined, 'plus de classement normal');

  const noms = ov.json.players.map((p) => p.team);
  assert.deepEqual(noms, [...noms].sort((a, b) => a.localeCompare(b, 'fr')),
    'le seul tri restant est alphabétique');

  // Alpha et Bravo ont validé la même quête, dans le même ordre : mêmes ratios.
  const a = ov.json.players.find((p) => p.team === 'Alpha');
  const b = ov.json.players.find((p) => p.team === 'Bravo');
  assert.equal(a.done, b.done);
  assert.equal(a.autonomy_ratio, b.autonomy_ratio);
  assert.equal(a.rank, undefined, 'aucun rang n\'est attribué');
  assert.equal(a.score, undefined);
  assert.equal(a.completed, undefined, 'plus de liste de numéros de quêtes');
  assert.equal(a.progress_ratio, Math.round((1 / pack.totalQuests) * 100) / 100);
  assert.equal(ov.json.meta.total_quests, pack.totalQuests);
});

test('le portail dit où l\'élève en est, pas qui gagne', async () => {
  wipe();
  const bloquant = (await api('/api/register', { method: 'POST', body: { team: 'Bloque', mode: 'competitive' } })).json;
  const ahead = (await api('/api/register', { method: 'POST', body: { team: 'Ahead', mode: 'competitive' } })).json;

  // Le premier valide trois quêtes sans indice ; le premier en valide une,
  // mais en prenant tous les indices disponibles.
  for (const q of pack.quests.slice(0, 3)) {
    await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: ahead.token }, q), token: ahead.token } });
  }
  const q0 = pack.quests[0];
  for (let i = 0; i < q0.hint_count; i++) {
    await api(`/api/quests/${q0.id}/hint`, { method: 'POST', token: bloquant.token, body: {} });
  }
  await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: bloquant.token }, q0), token: bloquant.token } });

  const ov = (await api('/api/overview')).json;
  const a = ov.players.find((p) => p.team === 'Ahead');
  const b = ov.players.find((p) => p.team === 'Bloque');

  assert.equal(a.done, 3);
  assert.equal(a.hints_used, 0);
  assert.equal(a.autonomy_ratio, 1);
  assert.equal(b.done, 1);
  assert.ok(b.hints_used > 0, 'les indices consommés sont comptés');
  assert.equal(b.autonomy_ratio, 0, 'une quête prise avec des indices ne vaut pas pour l\'autonomie');

  // C'est exactement l'information que l'enseignant cherche : « il est
  // bloqué et il a consommé des indices », pas « il a moins de points ».
  assert.ok(ov.meta.cohort.average_hints > 0);
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

  const me = (await api('/api/me', { token: reg.token })).json;
  assert.equal(me.progress, `1/${pack.totalQuests}`);
  assert.equal(me.mastery.done, 1);
  assert.ok(me.next_quest, 'le serveur propose toujours une suite');

  const q = (await api('/api/quests', { token: reg.token })).json;
  assert.equal(q.modules.flatMap((m) => m.quests).filter((x) => x.locked).length, 0);
});

test('valider dans le désordre ne change rien à la maîtrise', async () => {
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

  // L'ordre de saisie n'a aucune incidence : c'est la garantie qu'un élève
  // qui fait l'atelier 6 avant l'atelier 2 n'est pas lésé, ni avant ni après le
  // remplacement du score.
  assert.equal(ma.progress, mb.progress);
  assert.equal(ma.mastery.done, mb.mastery.done);
  assert.equal(ma.mastery.autonomy_ratio, mb.mastery.autonomy_ratio);
  assert.equal(ma.history.length, 3);
  assert.equal(mb.history.length, 3);
  assert.deepEqual(ma.mastery.modules.map((m) => m.done), mb.mastery.modules.map((m) => m.done));
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
  assert.equal(ov.players[0].last_submission, '-', 'rien de soumis au départ');

  await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, pack.quests[0]), token: reg.token } });

  ov = (await api('/api/overview')).json;
  const heure = ov.players[0].last_submission;
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

test('le tableau de suivi indique le poste de chaque joueur', async () => {
  wipe();
  await api('/api/register', { method: 'POST', body: { team: 'DepuisPoste', mode: 'normal' } });

  const ov = (await api('/api/overview')).json;
  const row = ov.players.find((p) => p.team === 'DepuisPoste');
  assert.ok(row, 'le joueur doit apparaître au suivi');
  assert.ok('last_ip' in row, 'le suivi doit exposer le poste');
  // Le test tourne en local : on ne peut pas exiger l'adresse du poste réel,
  // seulement que le serveur en a bien une et qu'elle a la forme d'une IP.
  assert.match(String(row.last_ip), /^\d+\.\d+\.\d+\.\d+$|^\[?::/,
    `IP inattendue : ${row.last_ip}`);
});

test('un X-Forwarded-For forgé ne maquille pas le poste', async () => {
  wipe();
  await api('/api/register', { method: 'POST', body: { team: 'Forge', mode: 'normal' } });

  const avant = (await api('/api/overview')).json.players
    .find((p) => p.team === 'Forge').last_ip;

  // TRUST_PROXY vaut off dans les tests : l'en-tête ne doit avoir aucun effet.
  await api('/api/overview', { headers: { 'X-Forwarded-For': '8.8.8.8' } });

  const apres = (await api('/api/overview')).json.players
    .find((p) => p.team === 'Forge').last_ip;
  assert.notEqual(apres, '8.8.8.8', 'une IP forgée ne doit jamais être retenue');
  assert.equal(apres, avant);
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
  assert.equal((await api('/api/me', { token: reg.token })).json.mastery.done, 1);

  const reset = await api('/api/admin/reset/AReprendre', { method: 'POST' });
  assert.equal(reset.status, 200);

  const me = (await api('/api/me', { token: reg.token })).json;
  assert.equal(me.mastery.done, 0, 'la maîtrise repart de zéro');
  assert.equal(me.mastery.autonomy_ratio, 0);
  assert.equal(me.progress, `0/${pack.totalQuests}`, 'la progression repart de zéro');
  // Le joueur reste inscrit, mais il n'a plus de rang : il n'y en a plus.
  assert.equal(me.team, 'AReprendre');
  assert.equal(me.rank, undefined);

  assert.equal((await api('/api/admin/reset/Inexistant', { method: 'POST' })).status, 404);
});

test('changer de mode efface le parcours', async () => {
  wipe();
  const { json: reg } = await api('/api/register', { method: 'POST', body: { team: 'Converti', mode: 'competitive' } });
  await api('/api/submit', { method: 'POST', body: { flag: secretFor({ token: reg.token }, pack.quests[0]), token: reg.token } });

  const r = await api('/api/admin/mode/Converti', { method: 'POST', body: { mode: 'normal' } });
  assert.equal(r.json.mode, 'normal');

  const me = (await api('/api/me', { token: reg.token })).json;
  assert.equal(me.mode, 'normal');
  // Les validations obtenues sous les règles de l'autre mode ne sont pas
  // conservées : elles seraient incohérentes avec les indices consommés et
  // les QCM répondus dans l'autre cadre.
  assert.equal(me.mastery.done, 0);
  assert.equal(me.progress, `0/${pack.totalQuests}`);
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
  // La V1 envoyait un tableau `competitive` trié par score. La V2 envoie une
  // liste `players` unique, triée alphabétiquement : le test le verrouille,
  // sinon un retour accidentel du podium passerait inaperçu.
  assert.match(text, /"players"/);
  assert.doesNotMatch(text, /"competitive":\[/);

  // L'inscription pousse un nouvel état sur le flux ouvert.
  const pushed = reader.read();
  await api('/api/register', { method: 'POST', body: { team: 'SSE', mode: 'competitive' } });
  const next = await Promise.race([
    pushed,
    new Promise((r) => setTimeout(() => r(null), 3000)),
  ]);
  assert.ok(next, 'le flux doit pousser un état au changement');
  assert.match(new TextDecoder().decode(next.value), /"players"/);

  ac.abort();
});