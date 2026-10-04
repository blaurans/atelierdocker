import { db, now, clock } from './db.js';
import { mastery } from './mastery.js';
import {
  doneOf, wrongFlagCount, markFinished, logEvent, markSubmitTime,
  recordCompletion, setCompletionStatus, doneCount,
} from './repo/arena.js';
import { hintsUsed, chargesSoFar, checksPassedFirstTry } from './repo/progress_repo.js';
import { quests } from './questpack.js';
import { announce } from './events.js';

/**
 * Durée de la quête : temps écoulé depuis l'étape précédente, ou depuis
 * l'inscription pour la première. C'est ce que l'enseignant regarde pour
 * savoir qui galère — le temps reste affiché dans les deux modes, puisque ce
 * n'est pas une mesure de performance mais d'inconfort.
 */
function elapsed(player, previous) {
  const since = previous.length
    ? Date.parse(previous.at(-1).completed_at)
    : Date.parse(player.created_at);
  if (!Number.isFinite(since)) return null;
  const t = Date.now() - since;
  return t > 0 ? t : null;
}

/** Nombre de quêtes par module, tel que défini par le contenu. */
function moduleTotals(pack) {
  const out = {};
  for (const m of pack.modules) out[m.module] = m.quests.length;
  return out;
}

/**
 * Ce qu'une quête apporte, une fois validée.
 *
 * Trois faits, et rien d'autre : a-t-elle demandé un indice, la compréhension
 * a-t-elle été vérifiée, le réflexe restitué. Pas de points, pas de bonus, pas
 * de rang — c'est `mastery.js` qui transforme ces trois faits en ratios.
 */
function questResult(player, quest, done) {
  const hints = hintsUsed(player.id, quest.id);
  // Les indices **payés**. En mode Sans stress le prix est annulé côté serveur
  // (voir `atelier.post('/quests/:id/hint')`), donc cette valeur est nulle : un
  // élève qui a demandé de l'aide sans en payer conserve son autonomie, ce qui
  // est précisément ce que promet le mode.
  //
  // C'est `hints_charged` et non `hints_used` qui décide de l'autonomie. Seule
  // la première compte, sinon le mode Sans stress aurait annulé le prix sans
  // annuler la conséquence — un élève se serait vu retirer son autonomie sans
  // avoir rien payé, et il n'aurait jamais compris pourquoi.
  const charged = chargesSoFar(player.id, quest.id);
  const passed = checksPassedFirstTry(player.id, quest);
  const required = (quest.check ?? []).filter((c) => c.required).length
    + (quest.recall ? 1 : 0);

  return {
    quest_id: quest.id,
    hints_used: hints,
    hints_charged: charged,
    // `autonomous` est le mot important : il dit qu'un élève a réussi sans
    // qu'on l'aide. C'est le seul signal qui survive à la comparaison avec
    // les autres, parce qu'il ne dépend que de lui.
    autonomous: charged === 0,
    check_ok: passed,
    check_total: required,
    understood: required === 0 ? true : passed,
  };
}

/**
 * Enregistre la validation d'une quête.
 *
 * Contrairement à `recomputeScore` de la V1, il n'y a pas de recalcul global :
 * les trois valeurs écrites ici sont des faits, pas des cumuls. Un élève qui
 * reprend une quête après une correction de l'enseignant ne voit pas son
 * autonomie précédemment acquise s'évaporer, et un barème modifié ne réécrit
 * pas l'histoire.
 */
const record = db.transaction(({ player, quest, requireAttestation }) => {
  const previous = doneOf(player.id);
  const timeMs = elapsed(player, previous);
  const at = now();

  if (requireAttestation) {
    const already = db.prepare('SELECT * FROM completions WHERE player_id = ? AND quest_id = ?')
      .get(player.id, quest.id);
    if (already) {
      return { status: already.status, result: null, timeMs, already: true };
    }
  }

  const result = questResult(player, quest, previous);

  recordCompletion({
    player_id: player.id,
    quest_id: quest.id,
    quest_number: quest.number,
    points: quest.points,
    wrong_flags: wrongFlagCount(player.id),
    time_ms: timeMs,
    hints_used: result.hints_used,
    hints_charged: result.hints_charged,
    check_ok: result.check_ok ? 1 : 0,
    recall_ok: result.check_ok && quest.recall ? 1 : 0,
    status: requireAttestation ? 'pending' : 'done',
  });

  if (requireAttestation) {
    logEvent(player.id, 'pending', quest.id);
    return { status: 'pending', result, timeMs };
  }

  markSubmitTime(player.id, at.slice(11, 19));
  logEvent(player.id, 'submit', `${quest.id} hints=${result.hints_used} compris=${result.check_ok}`);
  return { status: 'done', result, timeMs };
});

export const submitQuest = (args) => record(args);

/**
 * L'enseignant appose son attestation : la quête passe en `done`.
 *
 * Le mot de passe était déjà correct à la soumission — l'attestation porte sur
 * ce que l'API ne peut pas vérifier seule (l'élève a-t-il vraiment fait le
 * travail ?). Les trois valeurs de maîtrise sont figées à la soumission et ne
 * sont pas recalculées ici : elles décrivent l'état du travail au moment où il
 * a été fait, pas la décision de l'enseignant.
 */
export const attest = db.transaction(({ player, questId }) => {
  const row = db.prepare('SELECT * FROM completions WHERE player_id = ? AND quest_id = ?')
    .get(player.id, questId);
  if (!row) return null;
  if (row.status === 'done') return { already: true };
  setCompletionStatus(player.id, questId, 'done');
  logEvent(player.id, 'attested', questId);
  return { already: false };
});

export function announceAfter(playerId) {
  const fresh = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
  announce(`player:${fresh?.team ?? playerId}`);
  return fresh;
}

/**
 * Recalcule la maîtrise d'un joueur.
 *
 * Idempotent et déterministe, comme l'était `recomputeScore` : la seule
 * fonction qui écrit ces valeurs, et elle les réécrit entièrement. Un contenu
 * qui gagne une question de compréhension, ou un élève dont l'enseignant valide
 * une quête en attente, se répercutent sans laisser de chiffre périmé.
 */
export function masteryOf(playerId, pack = quests()) {
  const rows = db.prepare(
    `SELECT * FROM completions WHERE player_id = ? AND status = 'done'`
  ).all(playerId);

  const result = mastery({
    completions: rows.map((c) => ({ ...c, module: pack.byId.get(c.quest_id)?.module ?? 0 })),
    totalQuests: pack.totalQuests,
    byModule: moduleTotals(pack),
  });

  if (result.done === pack.totalQuests && pack.totalQuests > 0) {
    markFinished(playerId);
  }

  return result;
}