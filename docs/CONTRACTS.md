# Contrats partagés — Atelier Docker

Ce document est la source de vérité pour le schéma de quêtes, le contrat d'API et
la mesure de la maîtrise. Tout le code doit s'y conformer.

Trois choses ont changé depuis la V1 (Docker Ops Race, gelée sur `v1.0.0`) :

1. **Il n'y a plus de points ni de classement.** Les sections 1.4 et 3, qui
   décrivaient le barème, ne sont plus des règles mais un historique.
2. **Les indices sont payants**, et leur contenu ne sort plus par `/api/quests`.
3. **La compréhension est vérifiée** : questions à choix fermé, et réflexe à
   restituer.

---

## 1. Schéma d'une quête

Les quêtes vivent dans `content/quests/m<N>.js`. Chaque fichier exporte **un objet**
`{ meta, quests: [...] }` en **ESM**.

```js
export default {
  meta: {
    slug: 'm1-preparer-le-terrain',
    module: 1,
    title: 'Préparer le terrain',
    tagline: 'Installer Docker et vérifier qu\'il répond',
    icon: '🔧',
  },
  quests: [ /* ... */ ],
};
```

### Champs d'une quête

| Champ | Type | Contraintes |
|---|---|---|
| `id` | string | kebab-case unique dans tout le jeu, ex. `m1-01-diagnostiquer` |
| `order` | number | entier ≥ 1, unique **par module**, trié croissant |
| `title` | string | 3 à 60 caractères |
| `points` | number | entier 25 → 600. Voir § 1.4 — vestige, plus lu |
| `flag` | string | `FLAG{...}` en MAJUSCULES, `A-Z0-9_` à l'intérieur. **Unique dans tout le jeu** |
| `estMinutes` | number | entier 2 → 25, temps *indicatif* pedagogique |
| `brief` | string | Markdown. La mission à réaliser. Voir § 1.1 |
| `hints` | string[] | 0 à 3 indices, du plus flou au plus direct. Voir § 1.5 |
| `charge` | object | ce que coûte chaque indice. Voir § 1.5. Optionnel |
| `check` | object[] | 0 à 3 questions de compréhension. Voir § 1.6 |
| `recall` | object | un réflexe à restituer. Voir § 1.7 |
| `solution` | string | Bloc ```` ```bash ```` avec la correction complète |
| `teaches` | string[] | 1 à 5 mots-clés de vocabulaire Docker vus dans la quête |
| `checkpoint` | string | 1 phrase : « Comment savoir que j'ai réussi ? » |
| `fetchHint` | string | **Obligatoire.** La commande qui va chercher le mot de passe, avec l'URL du portail. Voir § 1.3 |

### 1.1 Anatomie de `brief`

Le `brief` est rendu côté client par un mini-renderer Markdown. **Sous-ensemble
supporté, rien d'autre** :

- `# ` → `h3` (titre de la quête)
- paragraphes
- `- ` → listes à puces
- `1. ` → listes ordonnées
- ```bash … ``` → bloc de code
- `**gras**`, `*italique*`, `` `code` ``
- `[texte](url)` — uniquement des URL http(s)

⚠️ Interdit : les tableaux, les images, le HTML, les listes imbriquées, les
titres `#` multiples. Le validateur (`npm test`) rejette les breaches.

### 1.2 Mot de passe : à chercher, jamais recopier

### 1.3 Interdiction de mentionner le mot de passe

Le validateur rejette tout `brief` qui contient le flag ou qui promet qu'il est
affiché.

### 1.4 Points — vestige

`points` existe encore dans le schéma et reste validé, mais **plus rien ne le lit**.
Les invariants arithmétiques associés (multiple de 100 par module, somme
croissante, quête phare = multiple de 100) restent appliqués, pour que les
contenus existants se chargent sans réécriture.

Ils disparaitront avec le contenu : quand le barème n'est plus utilisé, le
contraindre n'a plus de sens et gêne la réécriture des ateliers. Les valeurs
actuelles sont rappelées ici pour référence.

| Quête phare | Module | Points |
|---|---|---|
| `Initial Boot` | 2 | 100 |
| `Infiltration Interactive` | 3 | 200 |
| `Port Master` | 4 | 300 |
| `Image Alchemist` | 5 | 400 |
| `Persistence Guardian` | 5 | 500 |
| `Compose Overlord` | 7 | 600 |

### 1.5 Indices : payants, et jamais dans le payload

C'est la règle la plus importante de ce document.

**Le contenu des indices ne sort pas par `GET /api/quests`.** La réponse ne
porte que `hint_count` (un nombre). Le texte sort par :

```
POST /api/quests/:id/hint
```

qui écrit une ligne dans `hint_uses` avant de répondre. Les indices vivent donc
dans `pack.hintsByQuest`, **hors** des objets de quête — c'est ce qui rend la
fuite impossible par oubli : il faudrait un accès explicite à cette table.

Un élève ouvre l'onglet réseau, il voit `hint_count: 3` et trois boutons. Il ne
peut pas lire les indices sans les prendre, et les prendre les engage.

**`charge`** décrit le prix :

```js
charge: {
  perHint: 1,          // entier 0 à 10, informatif
  autonomy: [1, 1, 0], // coût du 1er, du 2e, du 3e indice
}
```

Invariants vérifiés par `src/questpack.js` :

- `autonomy` a exactement autant d'entrées que `hints`.
- **Le dernier indice est toujours gratuit.** Un élève bloqué n'a jamais le
  droit de rester coincé : l'enseignant a dit qu'il serait disponible en salle,
  et on ne transforme pas la disponibilité en variable d'ajustement.

Le coût ne s'exprime pas en points — il n'y en a plus. Il s'exprime en
**autonomie** : la part de quêtes validées sans indice. Une quête prise avec des
indices compte pour la progression, pas pour l'autonomie.

### 1.6 `check` — compréhension vérifiée

```js
check: [{
  id: 'm1-01-liste-vide',        // kebab-case, unique dans la quête
  kind: 'mcq',                    // 'mcq' | 'boolean'
  prompt: 'Sur une machine neuve, laquelle de ces listes est vide ?',
  choices: ['docker images', 'docker ps', 'les deux'],
  answer: 1,                      // index dans `choices`, ou booléen si kind='boolean'
  explanation: 'Une image est un modèle figé ; sans lancement, aucun conteneur.',
  required: true,
}]
```

Invariants :

- 0 à 3 questions par quête.
- `explanation` est **obligatoire** et fait au moins 15 caractères. Une question
  sans justification n'enseigne rien.
- `explanation` ne doit pas figurer mot pour mot dans le `brief` : l'élève la
  lirait avant d'avoir cherché.
- La réponse ne **bloque pas** la validation. `required: true` signifie
  simplement que cette question compte pour le ratio de compréhension.

C'est un choix : punir un élève qui a cherché le punit de chercher moins. L'écart
est visible par l'enseignant (`attempts` en base), pas par un zéro.

### 1.7 `recall` — le réflexe, pas l'identité

```js
recall: {
  id: 'm1-01-ps',
  prompt: 'Quelle commande liste les conteneurs en marche ?',
  accept: ['docker ps', 'ps'],
  hint: 'Deux lettres, la commande de lecture des processus en marche.',
}
```

On compare des **jetons**, pas des chaînes : la réponse est juste si elle
*contient* l'un des `accept`. « je pense que c'est docker ps » compte juste.

C'est le choix inverse de « répondre par la commande ». On ne demande pas de
retranscrire `docker run -p 8080:80 nginx` — l'ordre des flags n'est pas le
réflexe, l'option est. Un élève qui écrit la commande complète et se trompe
d'ordre passe, et c'est voulu.

Invariants :

- `accept` fait 1 à 4 entrées.
- `hint` est obligatoire : l'élève doit pouvoir corriger sa réponse. Il ne
  contient **jamais** le mot accepté (vérifié par le validateur).
- `hint` n'est envoyé qu'après une réponse fausse.

---

## 2. Contrat d'API

Base : `https://atelierdocker.laurans.org`. JSON en entrée et sortie, sauf
indication contraire.

### 2.1 `POST /api/register`

```jsonc
{ "team": "Alice", "mode": "normal" }
```

`mode` vaut `competitive` ou `normal`. Les valeurs sont un contrat d'API — les
élèves s'inscrivent en ligne de commande — mais **l'écran affiche « Challenge »
et « Sans stress »** (`MODE_LABELS` dans `src/config.js`).

Réponse 201 :

```jsonc
{
  "status": "created",             // created | exists
  "team": "Alice",
  "mode": "normal",
  "token": "dq_…",                 // 40 hex, jamais regeneré
  "last_submission": "-",
  "registered_at": "14:02:11"
}
```

### 2.2 `POST /api/submit`

```jsonc
{ "team": "Alice", "flag": "FLAG{…}", "secret": "…" }
```

`team` + `secret` **ou** en-tête `X-Arena-Token` (ou `?token=` en query
string). Réponse :

```jsonc
{
  "status": "success",              // success | already_submitted | pending
  "mode": "competitive",
  "quest_validated": 15,            // numéro de la quête dans le parcours
  "quest_title": "Port Master",
  "mastery": {                      // la mesure, pas un score
    "done": 15, "total_quests": 26,
    "autonomous": 12, "understood": 13, "hints_used": 9,
    "progress_ratio": 0.58, "autonomy_ratio": 0.8,
    "comprehension_ratio": 0.87,
    "level": { "key": "autonome", "name": "Autonome" }
  },
  "quest_result": {                 // ce que CETTE quête a rapporté
    "hints_used": 1,
    "autonomous": false,
    "check_ok": true
  },
  "completed_count": "15/26",
  "finished": false,
  "unlocked_next": "m5-01-…",
  "time_display": "1 min 12 s",
  "message": "Quête 15 validée, avec 1 indice. 15/26 quêtes accomplies."
}
```

**Aucun champ de point.** Ni `points_earned`, ni `score_total`, ni `breakdown`,
ni `rank`. Un client qui les attend ne les recevra pas — c'est volontaire, un
`points_earned: 0` laisserait croire que le score existe encore.

`status: "pending"` signifie que `REQUIRE_ATTESTATION=1` : le mot de passe est
correct mais la quête n'est pas acquise tant que l'enseignant n'a pas appelé
`POST /api/admin/attest/:team/:questId`.

### 2.3 `GET /api/overview`

Une liste, tous modes confondus, **triée alphabétiquement**. Aucun classement :
le tri alphabétique est le seul tri, et il ne classe personne.

```jsonc
{
  "players": [{
    "team": "Alice",
    "mode": "normal",
    "done": 15,
    "progress_ratio": 0.58,
    "autonomy_ratio": 0.8,          // part de quêtes validées sans indice
    "comprehension_ratio": 0.87,    // part validée avec les QCM réussis
    "hints_used": 9,
    "level": "autonome", "level_name": "Autonome",
    "modules": [ { "module": 1, "total": 4, "done": 4,
                   "autonomous": 3, "understood": 4,
                   "ratio": 1, "autonomy_ratio": 0.75 } ],
    "attempts": 18,
    "progress": "15/26",
    "last_submission": "14:02:11",
    "finished": false,
    "registered_at": "13:58:00",
    "last_ip": "192.168.38.42"
  }],
  "meta": {
    "total_quests": 26,
    "modules": [ { "module": 1, "title": "Préparer le terrain", "count": 4 } ],
    "cohort": { "players": 12,           // inscrits
                "started": 11,            // ont validé au moins une quête
                "started_ratio": 0.92,
                "average_autonomy": 0.62, "average_hints": 1.4,
                "hardest": [ { "module": 3, "hints": 41 } ] },
    "attestation_required": false,
    "server_time": "2026-…"
  }
}
```

`meta.cohort.hardest` liste les ateliers par **indices consommés**, pas par
échec de validation. Un atelier court et maîtrisé génère moins d'indices qu'un
atelier long et difficile, sans que ce soit un signal d'alerte.

`last_ip` est le poste du **dernier appel** du joueur. Elle n'est lue depuis
`X-Forwarded-For` que si `TRUST_PROXY=1` : sans proxy réel, se fier à cet
en-tête permettrait à un élève de maquiller son adresse.

### 2.4 Toutes les routes

| Route | Rôle |
|---|---|
| `GET /api/quests` | le programme complet, sans les indices ni les réponses |
| `GET /api/me` | la maîtrise du joueur et son historique |
| `POST /api/register` | inscription, jeton stable |
| `POST /api/submit` | soumission d'un mot de passe |
| `GET /api/overview` | l'état du portail enseignant |
| `GET /api/live` | flux SSE de cet état |
| `GET /api/stats` | synthèse de la promotion |
| `GET /api/commands` | mémento de commandes Docker |
| `GET /api/secret/:questId` | le mot de passe, en JSON |
| `GET /api/secret/:questId/raw` | le mot de passe, en texte brut (pour `wget`) |
| `POST /api/quests/:id/hint` | rend **un** indice, l'enregistre, renvoie ce qu'il a coûté |
| `POST /api/quests/:id/check` | vérifie une réponse de compréhension |
| `POST /api/quests/:id/recall` | vérifie le réflexe, renvoie l'aide si faux |
| `GET /api/quests/:id/attempts` | ce que l'élève a déjà répondu sur cette quête |
| `POST /api/admin/seed` | (ré)initialise le programme |
| `POST /api/admin/reset/:team` | remet un joueur à zéro |
| `POST /api/admin/delete/:team` | supprime une inscription |
| `POST /api/admin/mode/:team` | bascule un joueur de mode — efface son parcours |
| `GET /api/admin/pending` | les soumissions en attente d'attestation |
| `POST /api/admin/attest/:team/:questId` | l'enseignant valide une soumission |

Les trois routes de maîtrise répondent à la règle commune : **ce qui est montré
au client a été demandé au serveur.**

`POST /api/quests/:id/hint` répond :

```jsonc
{
  "status": "ok",                  // ok | already_taken | exhausted
  "index": 0,                      // 0-based
  "hint": "…",                     // null si exhausted
  "autonomy_lost": 1,              // 0 si déjà pris
  "remaining": 1,                  // combien restent
  "free_next": false               // le prochain sera-t-il gratuit ?
}
```

`already_taken` est renvoyé quand la ligne existe déjà : rejouer la même demande
ne coûte **rien** une seconde fois. C'est l'`UNIQUE(player_id, quest_id,
hint_index)` qui le garantit, pas le client.

### 2.5 Accès aux missions

`GET /api/quests` renvoie le programme. Pour une quête donnée, l'API ne transmet
**pas `hints`** — seulement `hint_count` (§ 1.5). Elle transmet `check` (questions et
explications) et `recall` (`prompt` et `accept`, mais **pas** la réponse).

La correction (`solution`) n'est renvoyée que pour les missions validées :
`"solution": done.has(q.id) ? q.solution : null`. Un élève qui la lisait avant
n'aurait rien à faire.

`fetch_hint` est la commande de récupération du mot de passe, avec `SERVER_IP`
et le littéral `dq_xxxxxxxxxxxxxxxx` déjà remplacés par l'origine et le jeton du
joueur. L'origine est complète, protocole compris (§ README § Mise en ligne).

### 2.6 Plafonds de débit

Par IP, fenêtre d'une minute :

| Route | Limite |
|---|---|
| `/api/register` | 12 |
| `/api/submit` | 40 |
| `/api/quests` | 120 |
| `/api/live` | 300 |
| reste de `/api` | 600 |

⚠️ **En salle**, si toutes les VM des élèves sortent par la même adresse (NAT de
l'établissement), c'est la promotion entière qui partage le compteur. Le plafond
de 40/min sur `/api/submit` peut alors renvoyer des 429 à tout le monde en même
temps. Voir README § Salle.

---

## 3. La maîtrise

Ce qui remplace le score. Trois ratios, sur un seul élève, et **aucune
comparaison entre élèves**.

| Mesure | Ce qu'elle compte | Formule |
|---|---|---|
| progression | où j'en suis | `validées / total du jeu` |
| autonomie | ce que j'ai su faire seul | `validées sans indice / validées` |
| compréhension | ce que j'ai compris | `validées avec QCM réussis / validées` |

Deux règles non négociables :

1. **Le dénominateur de la progression est le jeu entier**, jamais le nombre de
   quêtes faites. Un élève à 5/26 est à 19 %, pas à 100 %.
2. **Le niveau exige deux seuils** — autonomie *et* avancement. Sans le second,
   un élève qui réussit sa première quête sans indice (autonomie 100 %) verrait
   « Maîtrise » s'afficher immédiatement. Paliers :

| Palier | autonomie | avancement |
|---|---|---|
| Debout dans le conteneur | 0 | 0 |
| Ça tourne | 10 % | 5 % |
| Autonome | 50 % | 25 % |
| Geste sûr | 75 % | 50 % |
| Maîtrise | 90 % | 80 % |

`src/mastery.js` est la seule source de ces chiffres. `time_ms` est conservé :
le temps n'entre dans aucun ratio, mais l'enseignant en a besoin pour voir qui
galère.

---

## 4. Conventions de code

### Pile

Un seul module de production, `express`. La base est `node:sqlite`, le module
natif de Node — **pas** `better-sqlite3`, écarté parce qu'il demande une
compilation native, donc un `python3`, un `make` et un `g++` dans l'image.
`linkedom` est une devDependency : il sert aux tests de rendu.

`src/db.js` enveloppe `node:sqlite` avec un compteur de profondeur pour les
transactions imbriquables (`BEGIN` au niveau 0, `SAVEPOINT` en dessous), parce
que `node:sqlite` refuse lui-même d'imbriquer.

### Échec au démarrage

Le contenu est chargé au **démarrage du module**, en `await`. Une faute de
frappe dans un flag, un `order` dupliqué ou un `charge` incohérent
**empêche le serveur de démarrer**, avec un message qui nomme le fichier et la
quête. C'est délibéré : un contenu invalide découvert par un élève devant
trente collègues est pire qu'un portail qui ne démarre pas le matin.

### Nommage

Le vocabulaire `arena` (`ARENA_CHANGED`, `X-Arena-Token`, `repo/arena.js`)
reste en place alors que le produit s'appelle Atelier Docker : c'est un contrat
d'API et des noms de fichiers déjà en place, et les renommer coûterait un diff
de plusieurs centaines de lignes pour aucun gain. Le nom de produit a changé ;
l'identifiant technique, non.