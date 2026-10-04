/**
 * Les trois endpoints de la maîtrise : indice, compréhension, réflexe.
 *
 * Isolés de `api.js` parce qu'ils introduisent une règle commune que la V1
 * n'avait pas : **ce qui est_showé au client a été demandé au serveur**.
 *
 * En V1, les trois indices d'une quête voyageaient dans le payload de
 * `/api/quests`. Le bouton « afficher un indice » ne faisait que déplier un
 * tableau déjà reçu — un élève ouvrait l'onglet réseau et les lisait tous
 * d'un coup. Il était donc impossible de facturer un indice : on ne peut pas
 * prendre quelque chose qui n'a jamais été demandé.
 *
 * Ici le contenu des indices ne sort jamais par `/api/quests`. Il faut
 * passer par `POST /api/quests/:id/hint`, qui écrit une ligne en base. La
 La table est la source de vérité : un double-clic ne coûte rien une seconde
 * fois, et un client qui irait chercher l'indice ailleurs n'obtient rien que
 * le serveur ne lui aurait pas donné.
 */
import express from 'express';
import { HttpError, requirePlayer } from '../auth.js';
import { quests } from '../questpack.js';
import { logEvent } from '../repo/arena.js';
import {
  hintsUsed, chargesSoFar, consumeHint, recordAttempt, attemptsFor,
} from '../repo/progress_repo.js';

export const atelier = express.Router();

/* -------------------------------------------------------------------- hint */

/**
 * Sert UN indice, et le facture.
 *
 * Ordre des indices : l'élève les prend dans l'ordre, du plus flou au plus
 * direct (invariant du contenu). Le serveur ne renvoie pas « l'indice suivant »
 * mais « l'indice n° N » : c'est à lui de dire lequel il veut, et il ne peut
 * pas en sauter un pour aller directement au plus explicite.
 */
atelier.post('/quests/:id/hint', requirePlayer, (req, res, next) => {
  try {
    const pack = quests();
    const quest = pack.byId.get(req.params.id);
    if (!quest) throw new HttpError(404, 'Quête inconnue.');

    const player = req.player;
    const total = quest.hint_count ?? 0;
    if (total === 0) throw new HttpError(400, 'Cette quête n\'a aucun indice.');

    const already = hintsUsed(player.id, quest.id);

    // Un élève qui a déjà pris tous les indices n'en aura pas d'autre : on ne
    // rend pas un 400 « indices épuisés », on renvoie `null` pour que le
    // client affiche « plus aucun indice » sans traiter ça comme une erreur.
    if (already >= total) {
      return res.json({
        status: 'exhausted',
        next_index: null,
        hint: null,
        autonomy_lost: 0,
        remaining: 0,
      });
    }

    const hint = pack.hintsByQuest.get(quest.id)[already];
    const charged = quest.charge?.autonomy?.[already] ?? 1;

    const result = consumeHint({
      playerId: player.id,
      questId: quest.id,
      hintIndex: already,
      autonomyLost: charged,
      charged: charged > 0,
    });

    logEvent(player.id, 'hint', `${quest.id} n°${already + 1}${result.already ? ' (déjà pris)' : ''}`);

    return res.json({
      status: result.already ? 'already_taken' : 'ok',
      index: already,
      hint,
      autonomy_lost: result.already ? 0 : charged,
      // L'élève doit voir ce qu'il vient de perdre, sinon le mode Challenge
      // devient une surprise. Et il doit voir ce qu'il lui reste, pour
      // savoir qu'un dernier indice sera gratuit.
      remaining: total - already - 1,
      free_next: total - already - 1 > 0 && (quest.charge?.autonomy?.[already + 1] ?? 1) === 0,
    });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------- check */

/**
 * Vérifie une réponse de compréhension.
 *
 * Pas de blocage : la quête ne se valide pas moins bien parce qu'un élève a
 * répondu à côté. Ce qui change, c'est la colonne `check_ok` de la
 * validation — donc la maîtrise « compréhension ».
 *
 * `required` décide si cette question compte pour cette colonne. Une
 * question facultative existe pour élargir la discussion : elle rapporte le
 * coup juste sans être posée dans l'évaluation.
 */
atelier.post('/quests/:id/check', requirePlayer, (req, res, next) => {
  try {
    const quest = quests().byId.get(req.params.id);
    if (!quest) throw new HttpError(404, 'Quête inconnue.');

    const item = (quest.check ?? []).find((c) => c.id === req.body?.id);
    if (!item) throw new HttpError(404, 'Question inconnue pour cette quête.');

    const player = req.player;
    const answer = req.body?.answer;
    const correct = item.kind === 'boolean'
      ? answer === item.answer
      : Number(answer) === item.answer;

    const result = recordAttempt({
      playerId: player.id,
      questId: quest.id,
      kind: 'check',
      itemId: item.id,
      answer,
      correct,
    });

    return res.json({
      status: 'ok',
      correct: result.correct,
      attempts: result.attempts,
      required: item.required,
      // L'explication part avec la réponse : c'est elle qui enseigne. Tant que
      // la réponse est fausse, l'élève ne la voit pas — sinon il la lit avant
      // d'avoir cherché, et la question ne sert plus à rien.
      explanation: correct ? item.explanation : null,
    });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ recall */

/**
 * Le réflexe : l'élève restitue une option ou un mot.
 *
 * On compare des jetons, pas des chaînes. « -p », « --publish », « -p 8080 »
 * et « publish » sont acceptés si `accept` les contient — parce que le but
 * n'est pas de vérifier qu'il sait recopier, mais qu'il se souvienne de
 * l'option. Un élève qui écrit la commande entière et se trompe sur l'ordre
 * des flags passe, et c'est voulu : l'ordre des flags n'est pas le réflexe,
 * l'option est.
 *
 * La réponse n'est pas bloquante non plus, mais `attempts` est enregistré —
 * c'est ce décompte qui distingue « il savait » de « il a fini par trouver ».
 */
atelier.post('/quests/:id/recall', requirePlayer, (req, res, next) => {
  try {
    const quest = quests().byId.get(req.params.id);
    if (!quest) throw new HttpError(404, 'Quête inconnue.');
    if (!quest.recall) throw new HttpError(400, 'Cette quête n\'a pas de réflexe à restituer.');

    const player = req.player;
    const raw = String(req.body?.answer ?? '').trim().toLowerCase();
    if (!raw) throw new HttpError(400, 'Réponse vide.');

    const accept = quest.recall.accept.map((a) => a.toLowerCase());
    // On cherche un sous-texte plutôt que l'égalité : « je pense que c'est -p »
    // compte juste, parce que c'est bien -p qu'il a nommé.
    const correct = accept.some((a) => raw.includes(a));

    const result = recordAttempt({
      playerId: player.id,
      questId: quest.id,
      kind: 'recall',
      itemId: quest.recall.id,
      answer: raw,
      correct,
    });

    return res.json({
      status: 'ok',
      correct: result.correct,
      attempts: result.attempts,
      // Le champ d'aide n'est envoyé qu'après une réponse fausse : l'afficher
      // d'emblée, ce serait donner la réponse. Il ne contient jamais le mot
      // accepté (invariant du contenu).
      hint: result.correct ? null : quest.recall.hint,
    });
  } catch (e) { next(e); }
});

/* --------------------------------------------------------------- mes reponses */

/** Ce que l'élève a déjà répondu, pour que l'interface se recharge cohérente. */
atelier.get('/quests/:id/attempts', requirePlayer, (req, res, next) => {
  try {
    const quest = quests().byId.get(req.params.id);
    if (!quest) throw new HttpError(404, 'Quête inconnue.');

    res.json({
      hints_used: hintsUsed(req.player.id, quest.id),
      hint_count: quest.hint_count ?? 0,
      hints_charged: chargesSoFar(req.player.id, quest.id),
      attempts: attemptsFor(req.player.id, quest.id),
    });
  } catch (e) { next(e); }
});