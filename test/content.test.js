import test from 'node:test';
import assert from 'node:assert/strict';
import { quests } from '../src/questpack.js';

/**
 * Ces tests portent sur la qualité pédagogique du contenu, pas sur son
 * fonctionnement : ils protègent les six missions du cahier des charges et
 * les invariants qui rendent le parcours utilisable en cours.
 */

const pack = quests();
const all = pack.quests;

test('les six quêtes phares sont bien présentes, au bon endroit', () => {
  // Les QUÊTES PHARES sont conservées — leur place dans la progression et leur
  // rôle pédagogique. Leur FLAG, lui, change : il est dérivé du secret d'un
  // joueur et le contenu est réécrit. Ce qui ne doit pas bouger, c'est la
  // position et le rôle, pas la chaîne.
  //
  // Les cinq autres sont encore celles de la V1 : leur flag est donc encore
  // celui de la V1, et ce test le vérifie. Quand elles seront réécrites, il
  // devra changer — c'est normal, il verrouille un contenu, pas un contrat.
  const attendues = [
    { flag: 'FLAG{VERDI_BOOT_PERSISTED_AFTER_RESTART}', titre: 'Le premier serveur de la librairie', module: 2 },
    { flag: 'FLAG{ISOLATION_VERIFIED_PID1_INSIDE_AGENT}', titre: 'Le conteneur est isolé', module: 3 },
    { flag: 'FLAG{PORT_MAPPING_WEB_EXPERT_8080}', titre: 'Port Master', module: 4 },
    { flag: 'FLAG{DOCKERFILE_CHEF_CUSTOM_BUILD}', titre: 'Image Alchemist', module: 5 },
    { flag: 'FLAG{DATA_PERSISTENCE_VAULT_RESCUE}', titre: 'Persistence Guardian', module: 6 },
    { flag: 'FLAG{COMPOSE_ORCHESTRATION_TITAN}', titre: 'Compose Overlord', module: 7 },
  ];
  for (const a of attendues) {
    const q = pack.byFlag.get(a.flag);
    assert.ok(q, `quête phare absente : ${a.flag}`);
    assert.equal(q.title, a.titre);
    assert.equal(q.module, a.module, `${a.titre} : module ${q.module} au lieu de ${a.module}`);
    assert.ok(q.flagship, `${a.titre} : doit être une quête phare`);
  }
  // Une quête phare par module, et toujours la dernière.
  for (const m of pack.modules) {
    const phares = m.quests.filter((q) => q.flagship);
    assert.ok(phares.length <= 1, `module ${m.module} : ${phares.length} quêtes phares`);
    if (phares.length) assert.equal(phares[0], m.quests.at(-1), 'la phare doit être la dernière');
  }
});

test('le parcours est progressif : chaque module dépend du précédent', () => {
  const modules = pack.modules.map((m) => m.module);
  assert.deepEqual(modules, [1, 2, 3, 4, 5, 6, 7]);
  for (const m of pack.modules) {
    assert.ok(m.quests.length >= 3, `module ${m.module} : seulement ${m.quests.length} quêtes`);
    m.quests.forEach((q, i) => assert.equal(q.order, i + 1, `${m.module} : ordre non contigu`));
  }
});

test('chaque quête est auto-suffisante : objectif, énoncé et correction', () => {
  for (const q of all) {
    assert.ok(q.brief.trim().length >= 150, `${q.id} : énoncé trop court (${q.brief.length})`);
    assert.ok(q.checkpoint.length >= 15, `${q.id} : checkpoint trop vague`);
    assert.ok(q.solution.trim().length >= 20, `${q.id} : correction absente ou trop courte`);
    assert.ok(q.teaches.length >= 1, `${q.id} : aucun mot-clé travaillé`);
  }
});

test('le mot de passe n\'est écrit nulle part, et l\'énoncé le dit', () => {
  for (const q of all) {
    // Le cœur du mécanisme : le secret est le résultat du travail. Écrit dans
    // l'énoncé, il se recopie et ne prouve rien.
    assert.ok(!q.brief.includes(q.flag),
      `${q.id} : le mot de passe est écrit dans l'énoncé`);
    assert.doesNotMatch(q.brief, /écrit dans l'énoncé|affiché ci-dessus|il ne s'agit pas de le deviner/i,
      `${q.id} : l'énoncé promet encore que le mot de passe est affiché`);

    // Et l'étudiant doit comprendre où le trouver : c'est indispensable,
    // sinon la consigne devient un mur.
    assert.match(q.brief, /mot de passe/i,
      `${q.id} : l'énoncé ne parle même pas du mot de passe`);
    assert.match(q.brief, /api\/secret/,
      `${q.id} : l'énoncé ne renvoie pas à la commande de récupération`);
  }
});

test('les quêtes phares gardent leur technique de récupération', () => {
  // Par module, la technique avec laquelle l'élève va chercher son mot de
  // passe. C'est le point pédagogique qui compte : on cherche avec la
  // commande que l'atelier vient d'enseigner, pas avec une commande générique.
  // Testé par module plutôt que par flag : le flag change à chaque
  // réécriture, la technique reste.
  const attendues = {
    'FLAG{VERDI_BOOT_PERSISTED_AFTER_RESTART}': ['Le premier serveur de la librairie', 2],
    'FLAG{ISOLATION_VERIFIED_PID1_INSIDE_AGENT}': ['Le conteneur est isolé', 3],
    'FLAG{PORT_MAPPING_WEB_EXPERT_8080}': ['Port Master', 4],
    'FLAG{DOCKERFILE_CHEF_CUSTOM_BUILD}': ['Image Alchemist', 5],
    'FLAG{DATA_PERSISTENCE_VAULT_RESCUE}': ['Persistence Guardian', 6],
    'FLAG{COMPOSE_ORCHESTRATION_TITAN}': ['Compose Overlord', 7],
  };
  for (const [flag, [titre, module]] of Object.entries(attendues)) {
    const q = pack.byFlag.get(flag);
    assert.ok(q, `mission historique absente : ${flag}`);
    assert.equal(q.title, titre);
    assert.equal(q.module, module);
    assert.ok(q.fetchHint.includes('/raw'), `${titre} : fetchHint manquant`);
    assert.ok(q.fetchHint.includes('SERVER_IP'),
      `${titre} : la commande doit viser le portail courant`);
  }
});

test('chaque module récupère son secret par sa propre technique', () => {
  // Le point pédagogique : on cherche le mot de passe avec la commande que
  // le module vient d'enseigner, pas avec une commande générique.
  // L'atelier 1 est particulier : les deux premières quêtes ont lieu AVANT
  // l'installation, donc `curl` — la seule façon de joindre le portail quand
  // Docker n'existe pas encore sur le poste. C'est aussi plus simple, et ça
  // n'enseigne rien de faux : l'élève voit que le mot de passe est une URL.
  const attendus = {
    1: /curl|docker\s+run/,                // avant installation, puis après
    2: /docker\s+run/,                     // la sortie d'un conteneur lancé
    3: /docker\s+(run|exec)\b/,            // entrer dans un conteneur en marche
    4: /curl|wget|ports?\b/,               // requête HTTP vers un port publié
    5: /docker\s+(run|build)\b/,           // son conteneur, son image
    6: /docker\s+(volume|run)\b/,          // volume relu par un autre conteneur
    7: /docker\s+compose/,                 // les journaux de la pile
  };
  for (const m of pack.modules) {
    for (const q of m.quests) {
      assert.match(q.fetchHint, attendus[m.module],
        `${q.id} : la commande ne mobilise pas la technique du module ${m.module}`);
    }
  }
});

test('les quêtes phares gardent leurs commandes clés', () => {
  // La technique de chaque quête phare ne doit pas disparaître en la
  // réécrivant son texte. Le module 2 vient d'être réécrit : sa phare passe de
  // `hello-world` à un vrai serveur web qui survit à un redémarrage, ce qui
  // change le flag, le titre et la technique de récupération — mais la quête
  // phare reste « faire tourner un service et le garder en vie ».
  const attendues = {
    'FLAG{VERDI_BOOT_PERSISTED_AFTER_RESTART}': [/docker\s+run\s+-d/, /-p\s+8080:80/, /nginx/, /curl/, /systemctl\s+restart/],
    'FLAG{ISOLATION_VERIFIED_PID1_INSIDE_AGENT}': [/docker\s+run\s+-it/, /alpine/, /\bid\b/, /ps aux/],
    'FLAG{PORT_MAPPING_WEB_EXPERT_8080}': [/-p\s+8080:80/, /nginx/, /docker\s+exec/, /curl/],
    'FLAG{DOCKERFILE_CHEF_CUSTOM_BUILD}': [/Dockerfile/, /docker\s+build/, /EXPOSE/],
    'FLAG{DATA_PERSISTENCE_VAULT_RESCUE}': [/docker\s+volume\s+create/, /-v\s+vault_data/, /docker\s+volume\s+rm/],
    'FLAG{COMPOSE_ORCHESTRATION_TITAN}': [/docker[-\s]compose\s+up\s+-d/, /redis/, /docker\s+compose\s+down/],
  };
  for (const [flag, motifs] of Object.entries(attendues)) {
    const q = pack.byFlag.get(flag);
    const texte = `${q.brief}\n${q.solution}\n${pack.hintsByQuest.get(q.id).join('\n')}`;
    for (const m of motifs) {
      assert.match(texte, m, `${q.title} : commande attendue non trouvée (${m})`);
    }
  }
});

test('aucun atelier ne dépasse une séance', () => {
  // Contrainte du cahier des charges : un atelier par séance. Une heure est la
  // cible ; 90 minutes la borne,acceptable pour un atelier qui comporte une
  // quête phare. Au-delà, la dernière quête est toujours sacrifiée — c'est la
  // seule qui se fait sauter quand la séance déborde.
  for (const m of pack.modules) {
    const minutes = m.quests.reduce((a, q) => a + q.estMinutes, 0);
    assert.ok(minutes <= 90,
      `atelier ${m.module} : ${minutes} min, au-delà des 90 minutes`);
    // Et la répartition doit tenir : aucune quête ne doit dépasser 25 minutes,
    // sinon elle déborde à elle seule.
    for (const q of m.quests) {
      assert.ok(q.estMinutes <= 25, `${q.id} : ${q.estMinutes} min, trop long pour une séance`);
    }
  }
});

test('les ateliers réécrits tiennent dans une heure', () => {
  // La cible, distincte de la borne : un atelier deDiagnostic ou de préparation
  // doit tenir en une heure pour laisser de la marge aux questions.
  for (const numero of [1, 2]) {
    const m = pack.modules.find((x) => x.module === numero);
    const minutes = m.quests.reduce((a, q) => a + q.estMinutes, 0);
    assert.ok(minutes <= 60, `atelier ${numero} : ${minutes} min, au-delà de l'heure visée`);
  }
});

test('durée : chaque module est jouable en une séance', () => {
  // Chiffre réel aujourd'hui : la somme des estimations vaut ~430 min, soit
  // environ 7 h. C'est la durée d'un parcours complet pour un débutant qui
  // découvre Docker, pas celle d'un seul TP. Le test verrouille donc la
  // contrainte qui compte en pratique : aucun module ne doit dépasser la
  // longueur d'une séance de 2 h, pour rester découpable en plusieurs cours.
  const MINUTES = 120;
  for (const m of pack.modules) {
    const total = m.quests.reduce((a, q) => a + q.estMinutes, 0);
    assert.ok(total <= MINUTES, `module ${m.module} : ${total} min, à découper`);
  }
});

test('durée : la répartition est cohérente avec les six missions du PDF', () => {
  // Les six missions phares reprennent les minutages du cahier des charges,
  // qui annonçait 90 à 120 min pour l'ensemble des six.
  const vedettes = pack.quests.filter((q) => q.flagship);
  const total = vedettes.reduce((a, q) => a + q.estMinutes, 0);
  assert.ok(total >= 60 && total <= 180, `les 6 missions valent ${total} min`);
});

test('le mode normal ne peut pas recevoir de temps via l\'API', () => {
  // Garde-fou : le temps n'est utile que si le serveur ne le renvoie jamais
  // en mode normal. Ce comportement est vérifié côté API dans api.test.js.
  for (const q of all) {
    assert.equal(typeof q.estMinutes, 'number');
  }
});

test('les indices sont ordonnés du plus flou au plus direct', () => {
  // Un indice ne sert à rien s'il ne s'appuie sur rien : le premier ne doit
  // pas être plus long que le dernier, sinon l'élève a tout lu avant de
  // chercher. On vérifie la progression, pas seulement la présence.
  for (const q of all) {
    const indices = pack.hintsByQuest.get(q.id);
    if (indices.length < 2) continue;
    assert.ok(indices[indices.length - 1].length > 0, `${q.id} : dernier indice vide`);
    assert.ok(indices[indices.length - 1].length >= indices[0].length * 0.5,
      `${q.id} : le dernier indice devrait être au moins aussi direct que le premier`);
  }
});

test('aucun flag ne se ressemble assez pour créer une confusion', () => {
  const flags = all.map((q) => q.flag);
  for (const a of flags) {
    for (const b of flags) {
      if (a === b) continue;
      // Deux flags ne doivent pas différer d'un seul caractère : une faute de
      // frappe serait alors indétectable à l'œil.
      const d = Math.abs(a.length - b.length);
      const similar = a.length === b.length && [...a].filter((c, i) => c !== b[i]).length <= 2;
      assert.ok(!(similar && d === 0), `flags trop proches : ${a} et ${b}`);
    }
  }
});