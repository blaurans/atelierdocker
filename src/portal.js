import { bus, ARENA_CHANGED, announce } from './events.js';
import { __plafonds as plafonds } from './ratelimit.js';
import { rank, summarize } from './scoring.js';
import { allPlayers, doneOf, counts } from './repo/arena.js';
import { quests } from './questpack.js';
import { config } from './config.js';

/** Construit l'état du portail, strictement dans la forme du cahier des charges. */
export function overview() {
  const pack = quests();
  const rows = allPlayers().map((p) => {
    const done = doneOf(p.id);
    const questNumbers = done.map((c) => c.quest_number);
    return {
      team: p.team,
      mode: p.mode,
      score: p.mode === 'competitive' ? p.score : 0,
      completed: questNumbers,
      last_submission: p.last_submit,
      finished: !!p.finished_at,
      registered_at: p.registered_at,
      // method="progress" garde la forme "3/6" attendue par le portail.
      progress: `${questNumbers.length}/${pack.totalQuests}`,
      // champs additionnels, ignorés par un client construit sur le PDF.
      quests: done.map((c) => c.quest_id),
      last_quest: done.at(-1)?.quest_id ?? null,
      // Poste du dernier appel : indispensable pour l'enseignant, qui doit
      // savoir quel machine est derrière quel binôme quand un élève ne
      // répond pas. `null` si l'on n'a aucune information (joueur jamais
      // revenu, ou base créée avant l'existence de cette colonne).
      last_ip: p.last_ip || null,
    };
  });

  const competitive = rank(rows.filter((r) => r.mode === 'competitive'));
  const normal = rows
    .filter((r) => r.mode === 'normal')
    .sort((a, b) => b.completed.length - a.completed.length || a.team.localeCompare(b.team));

  return {
    competitive,
    normal,
    meta: {
      total_quests: pack.totalQuests,
      total_points: pack.totalPoints,
      bareme: pack.bareme,
      modules: pack.modules.map((m) => ({
        module: m.module, title: m.title, icon: m.icon, tagline: m.tagline,
        count: m.quests.length,
        points: m.quests.reduce((a, q) => a + q.points, 0),
      })),
      server_time: new Date().toISOString(),
      attestation_required: config.requireAttestation,
      ...summarize(competitive),
    },
  };
}

/** SSE : pousse `overview` à chaque changement, plus un keepalive régulier. */
export function liveHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send('overview', overview());

  const onChange = ({ reason }) => send('overview', { ...overview(), reason });
  bus.on(ARENA_CHANGED, onChange);

  const keepalive = setInterval(() => res.write(': ping\n\n'), config.sseKeepaliveMs);

  const close = () => {
    clearInterval(keepalive);
    bus.off(ARENA_CHANGED, onChange);
  };
  req.on('close', close);
  res.on('close', close);
}

export { announce };