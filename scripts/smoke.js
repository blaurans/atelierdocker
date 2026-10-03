#!/usr/bin/env node
/**
 * Parcours complet automatisé : joue les 26 missions contre une instance de
 * test, et affiche le barème mission par mission.
 *
 *   node scripts/smoke.js [http://127.0.0.1:PORT]
 *
 * Sert de test d'acceptation manual : le client web n'est pas simulé, mais
 * toutes les requêtes qu'il fait sont rejouées dans le même ordre.
 */
const B = process.argv[2] ?? 'http://127.0.0.1:9317';

const reg = await (await fetch(`${B}/api/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ team: `Smoke_${Date.now() % 100000}`, mode: 'competitive' }),
})).json();

const H = { 'Content-Type': 'application/json', 'X-Arena-Token': reg.token };
const questsNow = async () =>
  (await (await fetch(`${B}/api/quests`, { headers: H })).json()).modules.flatMap((m) => m.quests);

console.log(`Équipe ${reg.team} — token ${reg.token.slice(0, 12)}…\n`);

let total = 0;
let n = 0;
while (true) {
  const open = (await questsNow()).filter((q) => !q.locked && !q.completed);
  if (!open.length) break;
  const q = open[0];
  const res = await (await fetch(`${B}/api/submit`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ flag: q.flag }),
  })).json();

  if (res.status !== 'success') {
    console.error(`échec sur « ${q.title} » : ${res.status} ${res.error ?? ''}`);
    process.exit(1);
  }
  n += 1;
  total += res.points_earned;
  const b = res.breakdown;
  const pad = (x, w = 3) => String(x).padStart(w);
  console.log(
    `n°${String(res.quest_validated).padStart(2)}`,
    (q.title + ' ').padEnd(31, '.'),
    `${pad(b.base)} base`,
    `${b.speed_bonus ? `+${b.speed_bonus} podium` : '        ·'}`.padEnd(10),
    `${b.pace_bonus ? `+${b.pace_bonus} vit.` : '     ·'}`.padEnd(8),
    `= ${pad(res.points_earned)} pts`,
    b.penalty ? `(−${b.penalty} erreurs)` : '',
  );
}

const me = await (await fetch(`${B}/api/me`, { headers: H })).json();
console.log(`\n✅ ${n} missions validées · ${me.progress} · score ${me.score} · terminé ${me.finished}`);
console.log(`   podium conservé à chaque mission car ce joueur est seul : +${n * 60} pts de bonus.`);

const ov = await (await fetch(`${B}/api/overview`)).json();
console.log(`\nPortail : ${ov.competitive.length} compétitif(s), ${ov.normal.length} en mode normal,`);
console.log(`         ${ov.meta.total_quests} missions, ${ov.meta.total_points} points au total.`);