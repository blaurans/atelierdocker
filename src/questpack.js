import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';

const F = /^[a-z0-9-]+$/;
const FLAG = /^FLAG\{[A-Z0-9_]+\}$/;

/**
 * Charge et valide le contenu pédagogique depuis content/quests/.
 *
 * Le validateur est volontairement strict : une faute de frappe dans un flag
 * ou un `order` dupliqué doit faire tomber le serveur au démarrage, pas
 * produire un portail incohérent pendant un TP.
 */
export async function loadQuestpack({ dir = config.questsDir } = {}) {
  if (!fs.existsSync(dir)) throw new Error(`Répertoire de quêtes introuvable : ${dir}`);

  const files = fs
    .readdirSync(dir)
    .filter((f) => /^m\d+\.js$/.test(f))
    .sort((a, b) => Number(a.match(/^m(\d+)/)[1]) - Number(b.match(/^m(\d+)/)[1]));

  if (!files.length) throw new Error(`Aucune quête trouvée dans ${dir}`);

  const errors = [];
  const modules = [];
  const quests = [];
  const byFlag = new Map();
  const ids = new Set();

  /**
   * Indices, hors du graphe d'objets.
   *
   * Volontairement à côté du pack plutôt que sur chaque entrée : une entrée
   * de quête est sérialisée telle quelle par `/api/quests`, et il suffit
   * d'une propriété forgotten pour que les trois indices d'un atelier
   * repartent dans le payload. Hors du graphe, la fuite n'est pas évitable
   * par un oubli — elle demanderait un `pack.hintsByQuest.get(...)` explicite.
   */
  const hintsByQuest = new Map();

  for (const file of files) {
    const url = pathToFileURL(path.join(dir, file)).toString();
    const mod = await import(url);
    const pack = mod.default ?? mod;

    const where = `content/quests/${file}`;
    const meta = pack?.meta;
    if (!meta || typeof meta !== 'object') {
      errors.push(`${where} : champ « meta » manquant`);
      continue;
    }
    if (!Array.isArray(pack.quests) || pack.quests.length === 0) {
      errors.push(`${where} : « quests » doit être un tableau non vide`);
      continue;
    }

    const moduleEntry = {
      slug: meta.slug,
      module: Number(meta.module),
      title: String(meta.title ?? ''),
      tagline: String(meta.tagline ?? ''),
      icon: String(meta.icon ?? '📦'),
      quests: [],
    };

    // --- validation par quête -------------------------------------------
    const orders = new Set();
    let modulePoints = 0;

    for (const q of pack.quests) {
      const at = `${where}#${q?.id ?? '?'}`;
      const req = (cond, msg) => { if (!cond) errors.push(`${at} : ${msg}`); return cond; };

      if (!req(typeof q?.id === 'string' && F.test(q.id), 'id manquant ou invalide (kebab-case attendu)')) continue;
      if (ids.has(q.id)) errors.push(`${at} : id dupliqué dans le jeu`);
      ids.add(q.id);

      req(Number.isInteger(q.order) && q.order >= 1, '« order » doit être un entier ≥ 1');
      if (orders.has(q.order)) errors.push(`${at} : « order » dupliqué dans le module ${moduleEntry.module}`);
      orders.add(q.order);

      req(typeof q.title === 'string' && q.title.length >= 3 && q.title.length <= 60,
        '« title » doit faire 3 à 60 caractères');
      req(Number.isInteger(q.points) && q.points >= 25 && q.points <= 600,
        '« points » doit être un entier entre 25 et 600');
      req(q.points % 25 === 0, '« points » doit être un multiple de 25');
      req(typeof q.estMinutes === 'number' && q.estMinutes >= 2 && q.estMinutes <= 25,
        '« estMinutes » doit être entre 2 et 25');
      req(typeof q.brief === 'string' && q.brief.trim().length >= 40, '« brief » trop court');
      req(typeof q.checkpoint === 'string' && q.checkpoint.trim().length >= 10,
        '« checkpoint » manquant — l\'étudiant doit savoir quand il a réussi');
      req(Array.isArray(q.teaches) && q.teaches.length >= 1 && q.teaches.length <= 5,
        '« teaches » doit contenir 1 à 5 mots-clés');
      req(Array.isArray(q.hints) && q.hints.length <= 3, '« hints » : 3 indices maximum');

      // Le Markdown de l'énoncé, pour les garde-fous plus bas : une
      // justification ou une réponse attendue recopiée depuis le « brief »
      // est lisible avant d'avoir cherché, donc elle n'apprend rien.
      const md = q.brief;

      // ── indices payants ──────────────────────────────────────────────
      // `charge` (optionnel, une fois par quête) décrit ce que coûte un indice.
      // L'index 0 est le premier indice, et le dernier est toujours offert :
      // sans sortie gratuite, un élève bloqué n'a plus d'issue et le jeu
      // devient un mur — l'enseignant a dit qu'il serait disponible, on ne
      // peut pas le transformer en variable d'ajustement.
      if (q.charge) {
        const c = q.charge;
        req(Array.isArray(c.autonomy), '« charge.autonomy » doit être un tableau');
        req(Number.isInteger(c.perHint) && c.perHint >= 0 && c.perHint <= 10,
          '« charge.perHint » doit être un entier entre 0 et 10');
        const qHints = Array.isArray(q.hints) ? q.hints.length : 0;
        if (qHints > 0) {
          req((c.autonomy ?? []).length === qHints,
            `« charge.autonomy » doit avoir autant d'entrées que « hints » (${qHints})`);
        }
        if (qHints >= 2) {
          // Index 0-based : le dernier indice est le rang qHints-1, pas
          // qHints-2. L'erreur se paie cher — le refus tombe sur un contenu
          // parfaitement correct, avec un message qui accuse l'auteur.
          req((c.autonomy ?? [])[qHints - 1] === 0,
            'le dernier indice doit être gratuit (autonomy 0) — sinon un élève bloqué n\'a plus de sortie');
        }
      }

      // ── compréhension vérifiée ───────────────────────────────────────
      // `check` : questions à choix fermé. Elles ne bloquent pas la validation
      // — `required` indique seulement si le coup juste doit être obtenu pour
      // que la quête compte comme « comprise ». Un élève a le droit de
      // valider sa quête en échouant au QCM : c'est l'enseignant qui voit
      // l'écart, pas un zéro au compteur.
      if (q.check !== undefined) {
        req(Array.isArray(q.check) && q.check.length <= 3,
          '« check » : 3 questions de compréhension maximum par quête');
        for (const [n, c] of (q.check ?? []).entries()) {
          const at2 = `${at}.check[${n}]`;
          const need = (cond, msg) => { if (!cond) errors.push(`${at2} : ${msg}`); return cond; };
          need(typeof c?.id === 'string' && /^[a-z0-9-]+$/.test(c.id), 'id manquant ou invalide');
          need(c.kind === 'mcq' || c.kind === 'boolean', '« kind » doit être « mcq » ou « boolean »');
          need(typeof c.prompt === 'string' && c.prompt.trim().length >= 10, '« prompt » manquant');
          if (c.kind === 'mcq') {
            need(Array.isArray(c.choices) && c.choices.length >= 2 && c.choices.length <= 4,
              '« choices » doit contenir 2 à 4 propositions');
            need(Number.isInteger(c.answer) && c.answer >= 0 && c.answer < (c.choices?.length ?? 0),
              '« answer » doit être un index valide dans « choices »');
          } else {
            need(typeof c.answer === 'boolean', '« answer » doit être un booléen');
          }
          need(typeof c.explanation === 'string' && c.explanation.trim().length >= 15,
            '« explanation » obligatoire — une question sans justification n\'enseigne rien');
          need(typeof c.required === 'boolean', '« required » doit être un booléen');
          // La justification ne doit pas être recopiée depuis l'énoncé : sinon
          // l'élève peut la lire avant d'avoir cherché.
          if (typeof c.explanation === 'string' && md.includes(c.explanation.trim())) {
            errors.push(`${at2} : « explanation » ne doit pas figurer mot pour mot dans « brief »`);
          }
        }
      }

      // ── réflexe, pas identité ────────────────────────────────────────
      // `recall` : l'élève doit restituer une option ou un mot, pas
      // retranscrire une commande entière. On compare des jetons, pas des
      // chaînes : c'est la seule façon d'accepter « -p » comme « --publish »
      // sans écrire une table d'alias par option.
      if (q.recall !== undefined) {
        const r = q.recall;
        const at2 = `${at}.recall`;
        const need2 = (cond, msg) => { if (!cond) errors.push(`${at2} : ${msg}`); return cond; };
        need2(typeof r.id === 'string' && /^[a-z0-9-]+$/.test(r.id), 'id manquant ou invalide');
        need2(typeof r.prompt === 'string' && r.prompt.trim().length >= 10, '« prompt » manquant');
        need2(Array.isArray(r.accept) && r.accept.length >= 1 && r.accept.length <= 4,
          '« accept » doit contenir 1 à 4 réponses acceptées');
        need2(typeof r.hint === 'string' && r.hint.trim().length >= 10,
          '« hint » obligatoire — l\'élève doit pouvoir corriger sa réponse');
        // La réponse attendue ne doit pas être dans le champ d'aide : sinon
        // on peut juste copier.
        for (const a of (r.accept ?? [])) {
          if (md.includes(a) && a.length >= 3) {
            errors.push(`${at2} : « accept » ne doit pas figurer tel quel dans « brief »`);
          }
        }
      }

      const flag = String(q.flag ?? '').trim().toUpperCase();
      if (!req(FLAG.test(flag), `flag invalide : « ${q.flag} » (attendu FLAG{MAJUSCULES_ET_TIRETS_BAS})`)) continue;
      if (byFlag.has(flag)) errors.push(`${at} : flag dupliqué avec ${byFlag.get(flag).id}`);

      // Garde-fous sur le Markdown supporté par le mini-renderer du client.
      //
      // Ils s'appliquent au **prose**, pas aux blocs de code. Un énoncé qui
      // montre une sortie de commande contient naturellement des lignes
      // commençant par « # » (commentaires shell), des « | » ( pipes) et des
      // chevrons (redirections) — et aucune de ces lignes n'est du Markdown.
      //
      // Sans cette distinction, la règle « un seul titre » rejetait tout énoncé
      // qui montrait une sortie avec les commentaires usuels, et la règle
      // « pas de tableau » aurait rejeté le premier `docker images | head` écrit
      // en début de ligne. C'est arrivé en rédigeant l'atelier 6.
      const prose = md.replace(/```[\s\S]*?```/g, '');

      if (/^\s*\|/m.test(prose)) errors.push(`${at} : tableau Markdown interdit dans « brief »`);
      if (/<\/?[a-z][a-z0-9]*\s*\/?>/i.test(prose)) errors.push(`${at} : HTML interdit dans « brief »`);
      if (/!\[/.test(prose)) errors.push(`${at} : image Markdown interdite dans « brief »`);
      const titres = prose.match(/^#\s+/gm) ?? [];
      if (titres.length > 1) {
        errors.push(`${at} : un seul titre « # » autorisé dans « brief » (${titres.length} trouvés)`);
      }

      // ── le mot de passe ne doit jamais être dans l'énoncé ──────────────
      // Le mot de passe est un résultat du travail, pas une chaîne à recopier.
      // S'il apparaît dans le brief, l'étudiant peut valider sans avoir lancé
      // quoi que ce soit : c'est exactement ce que le jeu s'interdit.
      if (md.includes(flag)) {
        errors.push(`${at} : le flag ne doit pas figurer dans « brief » — il se récupère via fetchHint`);
      }
      if (/il (ne s'agit|n'est) pas de (le )?deviner|écrit dans l'énoncé|affiché dans l'énoncé/i.test(md)) {
        errors.push(`${at} : « brief » ne doit plus annoncer que le flag est affiché`);
      }
      if (/\b(écris|réponds|note ta|explique avec tes mots|formule ta)\b/i.test(md)) {
        errors.push(`${at} : consigne demandant une réponse écrite, sans champ pour la saisir`);
      }

      // ── commande de récupération ────────────────────────────────────────
      const hint = q.fetchHint;
      if (typeof hint !== 'string' || hint.trim().length < 20) {
        errors.push(`${at} : « fetchHint » est obligatoire (commande qui va chercher le mot de passe)`);
      } else {
        if (!hint.includes(`/api/secret/${q.id}/raw`)) {
          errors.push(`${at} : « fetchHint » doit viser /api/secret/${q.id}/raw`);
        }
        // Deux façons de désigner le portail, toutes deux valides :
        // SERVER_IP (l'hôte courant, substitué à l'exécution) ou 127.0.0.1
        // depuis un conteneur en `--network host` — qui fonctionne sur Docker
        // Desktop comme sur un Engine Linux, sans connaître l'IP du serveur.
        const cibleValide = hint.includes('SERVER_IP')
          || (hint.includes('127.0.0.1')
            && (hint.includes('--network host') || hint.includes('network_mode: host')));
        if (!cibleValide) {
          errors.push(`${at} : « fetchHint » doit viser SERVER_IP, ou 127.0.0.1 avec --network host`);
        }
        if (/```/.test(hint)) {
          errors.push(`${at} : « fetchHint » est une commande, pas un bloc Markdown`);
        }
      }

      modulePoints += q.points;

      const entry = {
        id: q.id,
        order: q.order,
        module: moduleEntry.module,
        moduleTitle: moduleEntry.title,
        moduleIcon: moduleEntry.icon,
        title: q.title,
        points: q.points,
        flag,
        estMinutes: q.estMinutes,
        brief: q.brief,
        // Le nombre d'indices, jamais leur contenu : le client doit passer par
        // `POST /api/quests/:id/hint` pour les obtenir, ce qui enregistre la
        // consommation. Voir `hintsByQuest` plus bas.
        hint_count: Array.isArray(q.hints) ? q.hints.length : 0,
        charge: q.charge ?? null,
        check: Array.isArray(q.check) ? q.check : [],
        recall: q.recall ?? null,
        solution: q.solution ?? '',
        teaches: q.teaches ?? [],
        checkpoint: q.checkpoint,
        fetchHint: q.fetchHint,
        flagship: q.points % 100 === 0,
      };
      // Les indices ne sont PAS sur l'entrée : c'est volontaire, et c'est la
      // seule façon d'être sûr qu'ils ne sortiront pas par accident.
      //
      // En V1 ils étaient une propriété de l'entrée, et l'API les renvoyait
      // dans `/api/quests`. Les retirer de l'objet ne suffisait pas — il
      // suffisait d'ajouter un `...q` quelque part pour les réintroduire.
      // Ici ils vivent dans une table à part, hors du graphe d'objets que
      // sérialise le handler. Le serveur y lit, le client n'y touche pas.
      hintsByQuest.set(q.id, Array.isArray(q.hints) ? q.hints : []);
      byFlag.set(flag, entry);
      quests.push(entry);
      moduleEntry.quests.push(entry);
    }

    // --- invariants de module --------------------------------------------
    moduleEntry.quests.sort((a, b) => a.order - b.order);
    const flagships = moduleEntry.quests.filter((q) => q.flagship);

    if (flagships.length > 1) {
      errors.push(`content/quests/${file} : ${flagships.length} quêtes phares (points multiples de 100), une seule attendue`);
    }
    if (flagships.length === 1) {
      const last = moduleEntry.quests.at(-1);
      if (flagships[0] !== last) {
        errors.push(`content/quests/${file} : la quête phare doit être la dernière du module (trouvée « ${flagships[0].id} »)`);
      }
    }
    if (modulePoints % 100 !== 0) {
      errors.push(`content/quests/${file} : la somme des points (${modulePoints}) doit être un multiple de 100`);
    }

    modules.push(moduleEntry);
  }

  // --- invariants globales ----------------------------------------------
  quests.sort((a, b) => a.module - b.module || a.order - b.order);
  quests.forEach((q, i) => { q.number = i + 1; });

  for (let i = 1; i < modules.length; i++) {
    const prev = modules[i - 1];
    const cur = modules[i];
    const p = sum(cur.quests.map((q) => q.points));
    const prevP = sum(prev.quests.map((q) => q.points));
    if (p < prevP) errors.push(`Module ${cur.module} : total de points (${p}) inférieur au module ${prev.module} (${prevP})`);
  }

  if (errors.length) {
    throw new Error(`Contenu de quêtes invalide :\n  - ${errors.join('\n  - ')}`);
  }

  const totalPoints = sum(quests.map((q) => q.points));

  return {
    modules,
    quests,
    byFlag,
    byId: new Map(quests.map((q) => [q.id, q])),
    /** Les indices, que le serveur seul peut lire. */
    hintsByQuest,
    totalQuests: quests.length,
    totalPoints,
    /** Barème figé, tel qu'il est présenté aux joueurs. */
    bareme: quests.map((q) => ({ n: q.number, id: q.id, points: q.points, title: q.title })),
  };
}

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/**
 * Le contenu est chargé au chargement du module (top-level await). Conséquence
 * voulue : une faute de frappe dans un flag ou un `order` dupliqué fait échouer
 * le démarrage du serveur avec un message précis, plutôt que de produire un
 * portail incohérent au milieu d'un TP.
 */
const pack = await loadQuestpack();

/** Programme validé, en cache. Accès synchrone partout. */
export function quests() {
  return pack;
}

/** Recharge depuis le disque (route d'administration `/api/admin/seed`). */
export async function reloadQuestpack() {
  const fresh = await loadQuestpack();
  for (const key of Object.keys(pack)) delete pack[key];
  Object.assign(pack, fresh);
  // byId / byFlag sont des Maps : le rechargement doit les remplacer.
  return pack;
}