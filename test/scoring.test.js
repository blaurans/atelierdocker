import test from 'node:test';
import assert from 'node:assert/strict';
import { speedBonus, paceBonus, award, rank, positionOf } from '../src/scoring.js';

const quest = (points, estMinutes = 10) => ({ points, estMinutes, id: 'q', number: 1, title: 'Q' });

test('bonus de podium : 60 / 30 / 15 puis plus rien', () => {
  assert.equal(speedBonus(1), 60);
  assert.equal(speedBonus(2), 30);
  assert.equal(speedBonus(3), 15);
  assert.equal(speedBonus(4), 0);
  assert.equal(speedBonus(99), 0);
  assert.equal(speedBonus(0), 0);
  assert.equal(speedBonus(null), 0);
});

test('bonus de rapidité : nul dans les temps, plafonné au double du prévu', () => {
  const q = quest(100, 10); // 600 000 ms prévues
  assert.equal(paceBonus(600_000, 10), 0, 'exactement dans les temps → 0');
  assert.equal(paceBonus(1_200_000, 10), 0, 'deux fois trop lent → 0');
  assert.equal(paceBonus(900_000, 10), 0, 'un tiers plus lent → 0 (plancher à 50 %)');
  assert.ok(paceBonus(300_000, 10) > 0, 'deux fois plus rapide → positif');
  assert.equal(paceBonus(0, 10), 1, 'instantané → plafond');
  assert.equal(paceBonus(NaN, 10), 0);
  assert.equal(paceBonus(1000, 0), 0);
});

test('award : le total inclut base + podium + rapidité − pénalités', () => {
  const q = quest(200, 10);
  const fast = award({ quest: q, rank: 1, timeMs: 300_000, wrongFlags: 0, scoreBefore: 0 });
  assert.equal(fast.base, 200);
  assert.equal(fast.speed_bonus, 60);
  assert.ok(fast.pace_bonus > 0);
  assert.equal(fast.points_earned, 200 + 60 + fast.pace_bonus);
  assert.equal(fast.score_total, fast.points_earned);

  const penalised = award({ quest: q, rank: 4, timeMs: 600_000, wrongFlags: 3, scoreBefore: 200 });
  assert.equal(penalised.speed_bonus, 0);
  assert.equal(penalised.penalty, 15);
  assert.equal(penalised.points_earned, 200 - 15);
  assert.equal(penalised.score_total, 385);
});

test('award : jamais moins que la moitié de la valeur de la quête', () => {
  const q = quest(600, 10);
  const r = award({ quest: q, rank: 50, timeMs: 9_000_000, wrongFlags: 500, scoreBefore: 0 });
  assert.equal(r.points_earned, 300);
});

test('award : le mode normal ne rapporte rien', () => {
  const r = award({ quest: quest(400, 5), rank: 1, timeMs: 1000, wrongFlags: 0, competitive: false });
  assert.equal(r.points_earned, 0);
  assert.equal(r.score_total, 0);
  assert.equal(r.scored, false);
});

test('classement : score, puis quêtes, puis heure de fin', () => {
  const rows = [
    { team: 'A', score: 100, completed: [1], finished_at: null },
    { team: 'B', score: 300, completed: [1, 2], finished_at: null },
    { team: 'C', score: 300, completed: [1, 2, 3], finished_at: '2026-01-01T10:00:00.000Z' },
    { team: 'D', score: 300, completed: [1, 2], finished_at: '2026-01-01T09:00:00.000Z' },
  ];
  const r = rank(rows);
  assert.deepEqual(r.map((x) => x.team), ['C', 'D', 'B', 'A']);
  assert.deepEqual(r.map((x) => x.rank), [1, 2, 3, 4]);
  // D et B ont le même score et le même nombre de quêtes : D a fini avant.
  assert.equal(positionOf(r, 'D'), 2);
  assert.equal(positionOf(r, 'inconnu'), null);
});

test('classement : les égalités parfaites partagent le même rang', () => {
  const rows = [
    { team: 'A', score: 100, completed: [1], finished_at: null },
    { team: 'B', score: 100, completed: [1], finished_at: null },
    { team: 'C', score: 50, completed: [1], finished_at: null },
  ];
  const r = rank(rows);
  assert.deepEqual(r.map((x) => x.rank), [1, 1, 3]);
});

test('award est idempotent : rejouer le même gain ne dérive pas', () => {
  const q = quest(300, 12);
  const once = award({ quest: q, rank: 2, timeMs: 400_000, wrongFlags: 1, scoreBefore: 0 });
  const twice = award({ quest: q, rank: 2, timeMs: 400_000, wrongFlags: 1, scoreBefore: once.score_total });
  assert.equal(twice.points_earned, once.points_earned);
  assert.equal(twice.score_total, once.score_total * 2);
});