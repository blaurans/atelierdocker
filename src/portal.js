import { bus, ARENA_CHANGED, announce } from './events.js';
import { __plafonds as plafonds } from './ratelimit.js';
import { mastery, cohort } from './mastery.js';
import { allPlayers, doneOf, counts } from './repo/arena.js';
import { attemptsFor, hintsUsed } from './repo/progress_repo.js';
import { quests } from './questpack.js';
import { config } from './config.js';

/** Nombre de quêtes par module, tel que défini par le contenu. */
function moduleTotals(pack) {
  const out = {};
  for (const m of pack.modules) out[m.module] = m.quests.length;
  return out;
}

/**
 * L'état du portail enseignant.
 *
 * Ce qui a changé par rapport à la V1 : il n'y a plus de classement. Le
 * portail affichait un podium et un tableau trié par score — c'était l'effet
 * le plus spectaculaire, et c'était précisément ce qui mesurait l'inégalité
 * de départ entre élèves plutôt que leur progression.
 *
 * À la place, une ligne par élève avec ses trois ratios, et une colonne par
 * atelier. La question que l'enseignant se pose pendant une séance n'est pas
 * « qui gagne » mais « qui est bloqué, et où ». Cette vue y répond
 * directement : un élève avec 8/26 et 3 indices est en difficulté, un élève
 * avec 8/26 et aucun indice est en avance.
 *
 * On ne classe pas les élèves entre eux — ni par nom, ni par ratio. La seule
 * exception est le tri alphabétique, qui est stable et ne classe personne.
 */
export function overview() {
  const pack = quests();
  const totals = moduleTotals(pack);

  const rows = allPlayers().map((p) => {
    const done = doneOf(p.id);
    const withModule = done.map((c) => ({
      ...c,
      module: pack.byId.get(c.quest_id)?.module ?? 0,
    }));

    const m = mastery({
      completions: withModule,
      totalQuests: pack.totalQuests,
      byModule: totals,
    });

    // Le nombre d'essais par quête sert à l'enseignant : un élève qui a
    // validé une quête en sept essais sait qu'il l'a acquise ; un autre qui a
    // mis un coup et rien plus, moins.
    let attemptsTotal = 0;
    for (const q of done) {
      attemptsTotal += attemptsFor(p.id, q.quest_id).reduce((a, r) => a + r.attempts, 0);
    }

    return {
      team: p.team,
      mode: p.mode,
      done: m.done,
      // Les trois ratios, dans l'ordre où l'enseignant les regarde : où
      // j'en suis, ce que j'ai su faire seul, ce que j'ai compris.
      progress_ratio: m.progress_ratio,
      autonomy_ratio: m.autonomy_ratio,
      comprehension_ratio: m.comprehension_ratio,
      hints_used: m.hints_used,
      level: m.level.key,
      level_name: m.level.name,
      modules: m.modules,
      attempts: attemptsTotal,
      progress: `${done.length}/${pack.totalQuests}`,
      last_submission: p.last_submit,
      finished: !!p.finished_at,
      registered_at: p.registered_at,
      last_ip: p.last_ip || null,
      last_submit_iso: p.last_submit_at || null,
      quests: done.map((c) => c.quest_id),
      last_quest: done.at(-1)?.quest_id ?? null,
    };
  });

  // Tri alphabétique, et rien d'autre. Voir la note sur le classement.
  rows.sort((a, b) => a.team.localeCompare(b.team, 'fr'));

  const allCompletions = allPlayers().flatMap((p) =>
    doneOf(p.id).map((c) => ({
      ...c,
      module: pack.byId.get(c.quest_id)?.module ?? 0,
    })));

  return {
    players: rows,
    meta: {
      total_quests: pack.totalQuests,
      modules: pack.modules.map((m) => ({
        module: m.module, title: m.title, icon: m.icon, tagline: m.tagline,
        count: m.quests.length,
      })),
      cohort: cohort(allCompletions, pack.totalQuests, rows.length),
      server_time: new Date().toISOString(),
      attestation_required: config.requireAttestation,
      ...counts(),
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