# Contrats partagés — Docker Ops Race

Ce document est la source de vérité pour le schéma de quêtes, le contrat d'API et le
format des scores. Tout le code doit s'y conformer.

---

## 1. Schéma d'une quête

Les quêtes vivent dans `content/quests/m<N>.js`. Chaque fichier exporte **un objet**
`{ meta, quests: [...] }` en **ESM**.

```js
export default {
  meta: {
    slug: 'm1-boot',          // kebab-case, unique
    module: 1,                // 1..7
    title: 'Initial Boot',
    tagline: 'Premier contact avec le moteur',   // 1 ligne, affichée sur la carte
    icon: '🚀',
  },
  quests: [ /* ... */ ],
};
```

### Champs d'une quête (tous obligatoires sauf `hints`, `solution`, `keywords`, `teaches`)

| Champ | Type | Contraintes |
|---|---|---|
| `id` | string | kebab-case unique dans tout le jeu, ex. `m1-01-hello-world` |
| `order` | number | entier ≥ 1, unique **par module**, trié croissant |
| `title` | string | 3 à 60 caractères |
| `points` | number | entier 25 → 600. Voir §1.2 |
| `flag` | string | `FLAG{...}` en MAJUSCULES, `A-Z0-9_` à l'intérieur. **Unique dans tout le jeu** |
| `estMinutes` | number | entier 2 → 25, temps *indicatif* pedagogy |
| `brief` | string | Markdown. La mission à réaliser. Voir §1.1 |
| `hints` | string[] | 0 à 3 indices, du plus flou au plus direct |
| `solution` | string | Bloc ```` ```bash ```` avec la correction complète |
| `teaches` | string[] | 1 à 5 mots-clés de vocabulaire Docker vus dans la quête |
| `checkpoint` | string | 1 phrase : « Comment savoir que j'ai réussi ? » |
| `fetchHint` | string | **Obligatoire.** La commande Docker qui va chercher le mot de passe, avec l'URL du portail. Voir § 1.3 |

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

**Aucun flag n'est stocké dans le contenu.** Le champ `flag` existe toujours
parce que le contenu est validé contre lui, mais il ne sert qu'à l'unification
des doublons et n'est **jamais renvoyé à un joueur**.

Le mot de passe d'une mission est dérivé à la volée par le serveur :

```
secret = "FLAG{" + HMAC_SHA256(ARENA_SALT, jetonDuJoueur + ":" + questId)[:20] + "}"
```

Conséquences :

- il est **différent pour chaque équipe** ;
- il n'apparaît dans aucun énoncé, donc recopier ne prouve rien ;
- seul le titulaire du jeton peut l'obtenir (`/api/secret/:questId`).

Chaque mission indique dans `fetchHint` **la commande qui va le chercher**,
et cette commande utilise la technique que le module enseigne :

| Module | Technique | Le mot de passe sort de… |
|---|---|---|
| 1 | lire un fichier dans un conteneur | `cat` de `/arena/secret.txt` |
| 2 | `docker run` qui affiche du texte | la sortie du conteneur |
| 3 | entrer dans un conteneur en marche | `docker exec` / `docker cp` |
| 4 | requête HTTP vers un port publié | la réponse du serveur web |
| 5 | conteneur construit par l'étudiant | la sortie de son image |
| 6 | volume relu par un second conteneur | le fichier relu après destruction |
| 7 | journaux de la pile Compose | `docker compose logs` |

Rédiger un `fetchHint` :

- **commande complète, copiable**, avec un en-tête sur l'IP du portail ;
- la commande doit **fonctionner telle quelle** sur Docker 20+ ;
- elle doit être **cohérente avec ce que la mission vient d'enseigner** ;
- `SERVER_IP` est remplacé côté client par l'hôte courant.

Exemple (module 4) :

```js
fetchHint: `docker run --rm -p 8080:80 nginx:alpine &
curl -s https://SERVER_IP/api/secret/m4-04-port-master/raw`
```

### 1.3 Interdiction de mentionner le mot de passe

Le validateur rejette tout `brief` qui contient le flag ou qui promet qu'il est
affiché. Un test vérifie en plus qu'aucune mission ne contient de section
« Ton mot de passe ».

### 1.4 Barème de points

Le barème historique du PDF est **préservé à l'identique** pour les six missions
phares. Les quêtes intermédiaires occupent la place libre.

| Quête phare | Module | Points |
|---|---|---|
| `Initial Boot` | 2 | 100 |
| `Infiltration Interactive` | 3 | 200 |
| `Port Master` | 4 | 300 |
| `Image Alchemist` | 5 | 400 |
| `Persistence Guardian` | 6 | 500 |
| `Compose Overlord` | 7 | 600 |

Règles :

- points % 100 == 0 ⇒ c'est une mission phare : elle doit être la **dernière** de
  son module. Une seule par module.
- points % 25 == 0 (tous les autres) ⇒ mission intermédiaire.
- La somme des points d'un module est un **multiple de 100**.
- Les sommes croissent **strictement** d'un module au suivant.

Conséquence arithmétique : avec un intermédiaire plafonné à 75 pts et une
seule phare par module, la seule suite strictement croissante de sommes
compatibles avec 7 modules est **100 / 200 / 300 / 400 / 500 / 600 / 700**. Le
barème réel est donc 2 800 points au total, avec des intermédiaires à
25 + 25 + 50 (module 7 : 50 + 50).

---

## 2. Contrat d'API

Base : `https://atelierdocker.laurans.org`. JSON en entrée et sortie, sauf indication contraire.

### 2.1 `POST /api/register`

```jsonc
// requête
{
  "team": "CyberPhoenix",     // 2..32 caractères, requis
  "mode": "competitive",       // "competitive" | "normal", requis
  "secret": "optional-pass"   // optionnel : pour reprendre un slot existant
}
```

Codes : `201` créé · `200` déjà existant (slot repris) · `400` validation ·
`409` pseudo déjà pris avec un mauvais `secret`.

```jsonc
// réponse 201
{
  "status": "created",
  "team": "CyberPhoenix",
  "mode": "competitive",
  "token": "dq_7f3a…",        // à conserver : c'est la clé d'API
  "message": "Bienvenue dans l'Arena !"
}
```

Le `token` est renvoyé **une seule fois** (au `201`). Les requêtes suivantes
l'authentifient via l'en-tête `X-Arena-Token`, ou `?token=` en query string
(pour rester compatible avec `curl`).

### 2.2 `POST /api/submit`

```jsonc
{ "team": "CyberPhoenix", "flag": "FLAG{…}", "secret": "…" }
```

`team` + `secret` **ou** en-tête `X-Arena-Token` (ou `?token=` en query
string). Réponse :

```jsonc
{
  "status": "success",              // success | already_submitted | pending
  "mode": "competitive",
  "quest_validated": 15,            // numéro de la mission dans le parcours
  "quest_title": "Port Master",
  "points_earned": 435,             // 0 en mode normal
  "breakdown": {                    // null en mode normal
    "base": 300,                    // points de base de la mission
    "speed_bonus": 60,              // 60 / 30 / 15 pour les 3 premiers
    "pace_bonus": 75,               // jusqu'à 25 % de la base, selon la vitesse
    "penalty": 5                    // 5 pts par faux flag
  },
  "score_total": 1023,
  "completed_count": "15/26",
  "rank": 2,                        // rang actuel, ou null en mode normal
  "finished": false,
  "unlocked_next": "m5-01-…",      // id de la mission suivante, ou null
  "time_display": "1 min 12 s",     // null en mode normal
  "message": "Quête 15 validée ! +435 pts — 🥇 premier sur cette quête."
}
```

`status: "pending"` signifie que `REQUIRE_ATTESTATION=1` : le flag est correct
mais le score n'est pas attribué tant que l'enseignant n'a pas appelé
`POST /api/admin/attest/:team/:questId`.

### 2.3 `GET /api/overview`

Retourne **exactement** la forme du PDF, augmentée de champs optionnels qu'un
client construit sur le PDF ignore sans casse.

```jsonc
{
  "competitive": [ { "team": "…", "mode": "competitive", "score": 1023,
                     "completed": [1,2,15], "last_submission": "14:02:11",
                     "finished": false,
                     // ajouts :
                     "rank": 1, "progress": "3/26", "registered_at": "13:58:00",
                     "quests": ["m1-01-…", …], "last_quest": "m4-04-…",
                     "last_ip": "192.168.38.42" } ],
  "normal":      [ { "team": "…", "mode": "normal", "score": 0,
                     "completed": [1,2,3], "last_submission": "14:03:00",
                     "finished": false, "progress": "3/26" } ],
  "meta": { "total_quests": 26, "total_points": 2800, "players": 12,
            "leader": { "team": "…", "score": 1023 }, "median": 415,
            "finished": 4, "bareme": [ … ], "modules": [ … ],
            "attestation_required": false, "server_time": "2026-…" }
}
```

Les cinq champs que le PDF attend (`team`, `mode`, `score`, `completed`,
`last_submission`, `finished`) sont tous présents et ont exactement le même
sens qu'à l'origine.

`last_ip` est le poste du **dernier appel** du joueur, pas celui de son
inscription. L'enseignant s'en sert pour savoir quelle machine est derrière
quel binôme. Elle n'est lue depuis `X-Forwarded-For` que si `TRUST_PROXY=1` :
sans proxy réel, se fier à cet en-tête permettrait à un étudiant de maquiller son
adresse. Une base créée avant l'existence de la colonne affiche `null` — la
migration l'ajoute au démarrage.

### 2.3 bis Accès aux missions

`GET /api/quests` renvoie `locked: false` sur **toutes** les missions par défaut,
et `linear_progression: false` pour l'indiquer. Un étudiant peut donc lire et
valider n'importe quelle mission, dans n'importe quel ordre.

Le drapeau ne sert que si le portail est démarré avec `LINEAR_PROGRESSION=1` :
la seule mission ouverte dans le plan est alors la première non validée (une
mission déjà validée reste relisible). Barème et scores identiques dans les
deux cas.

**Le verrouillage est un guidage d'affichage, pas une porte serveur.**
`/api/submit` ne consulte que le flag : valider une mission « verrouillée »
paris un appel direct reste possible, dans les deux modes. C'est délibéré —
un ordre imposé au niveau de l'API punirait l'étudiant qui utilise `curl`
comme documenté, sans rien apporter. Si vous avez besoin d'une contrainte
réelle, c'est `REQUIRE_ATTESTATION=1` qui l'assure : le flag correct reste en
attente de votre validation.

### 2.4 Autres routes

| Route | Auth | Description |
|---|---|---|
| `GET /api/quests` | non | Programme complet. Anonyme : tout lisible, `locked: false`. Authentifié : verrous réels et `solution` **uniquement pour les missions validées** |
| `GET /api/me` | oui | État du joueur : mode, score, rang, progression, historique, `next_quest` |
| `GET /api/commands` | non | Mémento des commandes, pour la page d'aide |
| `GET /api/leaderboard/:mode` | non | Classement trié |
| `GET /api/live` | non | **SSE** : push `overview` à chaque changement (keepalive 25 s) |
| `GET /api/stats` | `X-Arena-Admin` | Statistiques enseignant, dont les 5 missions les plus redoutées |
| `GET /api/admin/pending` | admin | Soumissions en attente (si `REQUIRE_ATTESTATION=1`) |
| `POST /api/admin/attest/:team/:questId` | admin | Valide une soumission en attente et attribue le score |
| `POST /api/admin/reset/:team` | admin | Remet un joueur à zéro |
| `POST /api/admin/delete/:team` | admin | Supprime un joueur |
| `POST /api/admin/mode/:team` | admin | Change un joueur de mode (remet son score à zéro) |
| `POST /api/admin/seed` | admin | (re)charge les quêtes depuis `content/` |
| `GET /healthz` | non | `{"ok":true,"uptime":…,"players":…,"completions":…}` |

### 2.5 Plafonds de débit

Par IP, fenêtre d'une minute : inscription **12**, soumission **40**, lecture
du programme **120**, flux live **300**, ensemble de l'API **600**. Au-delà,
`429` avec un en-tête `Retry-After`.

Le flux live est plafonné très haut parce qu'une connexion SSE est **une seule
requête qui reste ouverte** : en salle, tous les postes partagent la même IP
(même NAT), et le navigateur reconnecte tout seul un flux en échec toutes les
~3 s, soit 20 tentatives par minute. Un plafond proche de 20 s'épuisait
lui-même et figeait l'indicateur « connexion… » pour toute la classe.

`X-Forwarded-For` n'est pris en compte que si `TRUST_PROXY=1` (à n'activer que
si un vrai reverse proxy est devant le portail). `RATE_LIMIT=off` désactive tout.

Côté client, la reconnexion est pilotée à la main avec un recul exponentiel
(1 s, 2 s, 4 s… borné à 30 s) au lieu de laisser `EventSource` se reconnecter
tout seul.

---

## 3. Format des scores

### 3.1 Points d'une mission validée

```
base   = quest.points                      25 à 600
podium = 60 si ce joueur est le 1er à valider CETTE mission dans le mode
                 compétitif
         30 s'il est le 2e, 15 s'il est le 3e, sinon 0
vitesse= round(base × 0.25 × min(1, max(0, tempsPrévu / tempsRéel − 1)))
malus  = 5 × (nombre de faux flags soumis)
gagné  = max(round(base / 2), base + podium + vitesse − malus)
```

Le podium est **global à la mission, parmi les compétitifs uniquement** : un
joueur en mode normal ne prive pas un compétitif du bonus. Le malus vient de
la commande du projet, « le temps et la qualité comptent pour un score ».

Le plancher à `base / 2` garantit qu'aucune série d'erreurs ne peut réduire
une mission à néant.

### 3.2 Score total

Le score n'est **jamais incrémenté** : il est recalculé depuis l'historique des
validations à chaque soumission (`recomputeScore` dans `src/progress.js`).
Aucune dérive possible, et un barème modifié se répercute proprement. Le
recalcul est idempotent.

### 3.3 Classement

Tri par : `score` desc → `completed.length` desc → `finished_at` asc.
Les égalités parfaites partagent le même `rank`.

### 3.4 Temps

Le chrono est **par mission** : durée écoulée depuis la validation précédente,
ou depuis l'inscription pour la première. En mode normal il est enregistré mais
**jamais renvoyé par l'API** — pas masqué à l'affichage, absent de la réponse.

---

## 4. Conventions de code

- ESM partout (`"type": "module"`).
- **Une seule dépendance de production : `express`.** La base utilise
  `node:sqlite`, le module natif de Node : pas de `better-sqlite3`, donc pas de
  compilation C++ dans l'image Docker. Node ≥ 22.5 requis (22 pour le flag
  `--experimental-sqlite`, 24+ sans flag). `linkedom` est en devDependency, pour
  tester le rendu du client sans navigateur.
- Toute commande SQL passe par un module de `src/repo/`, jamais de SQL inline
  dans les routes.
- `node:sqlite` **n'accepte pas de mélanger `?` et `@nom`** dans un même
  statement : un statement à paramètres nommés n'utilise que des noms.
- Les transactions sont imbriquables via `SAVEPOINT` (`db.transaction` dans
  `src/db.js`) : `recomputeScore`, appelé depuis la transaction de
  `submitQuest`, en dépend.
- Les flags sont comparés **en majuscules, trimés**, insensibles à la casse.
- Le contenu est chargé au démarrage du module (`top-level await`) : un contenu
  invalide **empêche le serveur de démarrer**, avec le détail des erreurs.