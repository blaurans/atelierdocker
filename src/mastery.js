/**
 * Maîtrise — ce qui remplace le score.
 *
 * Le score V1 répondait à « qui a été le plus rapide ? ». C'est une question
 * sur la promotion, pas sur l'élève : le premier d'une classe lente apprend
 * exactement autant que le vingtième d'une classe rapide, et l'affichage dit le
 * contraire. La course servait à remotiver, mais elle mesurait l'inégalité de
 * départ au lieu de la progression.
 *
 * Ce module répond à trois questions, sur un seul élève :
 *
 *   progression  — j'ai validé N quêtes sur M
 *   autonomie    — j'ai validé N quêtes sans prendre un seul indice
 *   compréhension — j'ai validé N quêtes en répondant du premier coup
 *
 * Aucun de ces trois chiffres ne se compare à celui d'un camarade. Il n'y a
 * donc pas de classement : la seule comparaison possible est avec soi-même,
 * d'un atelier à l'autre. C'est un choix, et il a un prix — le portail perd
 * son classement en direct, qui était son effet le plus spectaculaire.
 */

/**
 * Paliers de maîtrise.
 *
 * Chaque palier a **deux** seuils : `min` sur l'autonomie — la part de quêtes
 * réussies sans indice — et `minProgress` sur l'avancement. Les deux sont
 * nécessaires.
 *
 * L'autonomie seule ne suffit pas, et c'est un piège visible : un élève qui
 * réussit sa première quête sans indice a une autonomie de 100 %, donc le
 * palier « Maîtrise » s'afficherait immédiatement. C'est absurde — il a fait
 * 4 % du jeu. Le seuil d'avancement corrige ça : on ne peut pas se réclamer
 * « Maîtrise » avant d'avoir parcouru les quatre cinquièmes du parcours, quoi
 * qu'il ait fait sur le début.
 *
 * L'inverse est vrai aussi : un élève qui a tout validé en prenant trois
 * indices à chaque fois a une autonomie de 0 et plafonnera au premier palier,
 * même avec 100 % d'avancement. C'est voulu — c'est le cœur du jeu.
 */
export const LEVELS = [
  { key: 'debout', name: 'Debout dans le conteneur', min: 0, minProgress: 0 },
  { key: 'ranim', name: 'Ça tourne', min: 0.10, minProgress: 0.05 },
  { key: 'autonome', name: 'Autonome', min: 0.50, minProgress: 0.25 },
  { key: 'travailleur', name: 'Geste sûr', min: 0.75, minProgress: 0.50 },
  { key: 'maitre', name: 'Maîtrise', min: 0.90, minProgress: 0.80 },
];

/**
 * Le palier atteint.
 *
 * @param {number} autonomyRatio part de quêtes validées sans indice
 * @param {number} progressRatio part du jeu validée
 */
export function levelFor(autonomyRatio, progressRatio = 1) {
  const a = Number.isFinite(autonomyRatio) ? autonomyRatio : 0;
  const p = Number.isFinite(progressRatio) ? progressRatio : 0;
  let current = LEVELS[0];
  for (const l of LEVELS) if (a >= l.min && p >= l.minProgress) current = l;
  return current;
}

/**
 * Calcule la maîtrise d'un joueur à partir de ses validations.
 *
 * Idempotent et déterministe, comme l'était `recomputeScore` : c'est la
 * seule fonction qui écrit ces valeurs, et elle les réécrit entièrement à
 * chaque appel. Un barème modifié, une question de compréhension ajoutée en
 * cours d'année ou une réponse rejouée se répercutent donc sans laisse
 * derrière eux de chiffre périmé.
 *
 * @param {object} args
 * @param {Array} args.completions lignes de `completions` au statut `done`
 * @param {number} args.totalQuests nombre total de quêtes du jeu
 * @param {object} [args.byModule] nombre de quêtes par module
 */
export function mastery({ completions = [], totalQuests = 0, byModule = {} }) {
  const done = completions;

  // Autonomie et compréhension sont comptées sur les quêtes qui existaient
  // dans le jeu au moment de la validation — donc sur `totalQuests`, pas sur
  // `done.length`. Un élève ayant validé 5 quêtes sur 26 est à 19 %, même si
  // le jeu n'en compte que 5 aujourd'hui.
  const progressRatio = totalQuests > 0 ? done.length / totalQuests : 0;

  // L'autonomie se mesure sur les indices **payés**, pas sur ceux consommés. En
  // mode Sans stress l'élève peut demander autant d'indices qu'il veut sans en
  // payer aucun : les compter comme une perte d'autonomie contredirait la
  // promesse du mode, et l'élève verrait son score baisser sans avoir rien
  // payé.
  const payes = (c) => (c.hints_charged ?? c.hints_used ?? 0);

  const autonomous = done.filter((c) => payes(c) === 0);
  const understood = done.filter((c) => c.check_ok === 1);
  const reflex = done.filter((c) => c.recall_ok === 1);

  // Autonomie et compréhension se mesurent sur les quêtes *achevées*, sinon
  // un élève à mi-parcours aurait 100 % d'autonomie et le portail afficherait
  // « Maîtrise » à la deuxième quête. Le dénominateur est la progression ;
  // c'est ce qui rend les trois chiffres cohérents entre eux.
  const autonomyRatio = progressRatio > 0 ? autonomous.length / done.length : 0;
  const comprehensionRatio = progressRatio > 0 ? understood.length / done.length : 0;
  const reflexRatio = progressRatio > 0 ? reflex.length / done.length : 0;

  // Deux totaux, parce que l'enseignant veut les deux : ce que ses élèves ont
  // demandé (un atelier qui consomme des indices est un atelier où ça coince)
  // et ce qu'ils ont payé (le mode Challenge est-il activé, et compris ?).
  const hints = done.reduce((a, c) => a + (c.hints_used ?? 0), 0);
  const hintsCharged = done.reduce((a, c) => a + payes(c), 0);

  // Détail par atelier : c'est la vue qui sert au suivi en cours d'année,
  // parce qu'elle dit *où* l'élève en est, pas seulement combien.
  const modules = Object.entries(byModule).map(([module, count]) => {
    const inModule = done.filter((c) => c.module === Number(module));
    const inModuleAutonomous = inModule.filter((c) => payes(c) === 0);
    return {
      module: Number(module),
      total: count,
      done: inModule.length,
      autonomous: inModuleAutonomous.length,
      understood: inModule.filter((c) => c.check_ok === 1).length,
      ratio: count > 0 ? inModule.length / count : 0,
      autonomy_ratio: inModule.length > 0 ? inModuleAutonomous.length / inModule.length : 0,
    };
  });

  return {
    total_quests: totalQuests,
    done: done.length,
    autonomous: autonomous.length,
    understood: understood.length,
    reflex: reflex.length,
    hints_used: hints,
    hints_charged: hintsCharged,
    progress_ratio: round(progressRatio),
    autonomy_ratio: round(autonomyRatio),
    comprehension_ratio: round(comprehensionRatio),
    reflex_ratio: round(reflexRatio),
    level: levelFor(autonomyRatio, progressRatio),
    // Un joueur n'a de niveau qu'à partir du moment où il a terminé quelque
    // chose : avant, il est « debout », jamais « Maîtrise » par accident d'un
    // dénominateur à zéro.
    modules,
  };
}

/**
 * Synthèse pour le portail enseignant : où la promotion en est, et où ça
 * coince.
 *
 * @param {Array} rows les validations, tous joueurs confondus
 * @param {number} totalQuests taille du jeu
 * @param {number} players nombre d'inscrits — passé séparément parce qu'il
 *   n'est pas déductible des validations : un élève inscrit qui n'a rien
 *   validé n'apparaît dans aucune ligne. Sans ce troisième argument, la
 *   synthèse annonçait 3 joueurs pour 2 inscrits.
 */
export function cohort(rows, totalQuests, players = rows.length) {
  const done = rows.map((r) => ({
    module: r.module,
    // Les indices **demandés**, pas seulement les payés : c'est le signal qui
    // dit à l'enseignant où ça coince, et il vaut dans les deux modes.
    hints_used: r.hints_used,
    hints_charged: r.hints_charged,
    check_ok: r.check_ok,
    recall_ok: r.recall_ok,
  }));

  const autonomy = done.filter((c) => (c.hints_charged ?? c.hints_used ?? 0) === 0).length;

  // L'enseignant veut une question simple : « où est-ce que ça coince ? ».
  // La réponse est l'atelier où les indices sont le plus consommés, pas celui
  // où les élèves ont le moins validé — un atelier court et maîtrisé génère
  // moins d'indices qu'un atelier long et difficile, sans que ce soit un
  // signal d'échec.
  const hintsByModule = {};
  for (const c of done) {
    const m = c.module;
    hintsByModule[m] = (hintsByModule[m] ?? 0) + (c.hints_used ?? 0);
  }
  const hardest = Object.entries(hintsByModule)
    .map(([module, hints]) => ({ module: Number(module), hints }))
    .sort((a, b) => b.hints - a.hints)
    .slice(0, 5);

  return {
    players,
    // Le nombre d'inscrits qui ont validé au moins une quête. Complète
    // `players` : un élève inscrit sans rien faire est une information, pas un
    // zéro — et c'est lui qu'il faut aller voir en début de séance.
    started: rows.length > 0 ? players : 0,
    total_quests: totalQuests,
    // La part d'inscrits déjà underrepresented. Hors de 0 et 1 dès qu'un seul
    // élève a commencé, donc on arrondit pour ne pas afficher un pourcentage
    // trompeur à trois personnes.
    started_ratio: players > 0 ? round(Math.min(1, rows.length / players)) : 0,
    average_autonomy: done.length ? round(autonomy / done.length) : 0,
    average_hints: done.length
      ? round(done.reduce((a, c) => a + (c.hints_used ?? 0), 0) / done.length)
      : 0,
    hardest,
  };
}

const round = (x) => Math.round(x * 100) / 100;