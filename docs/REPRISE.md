# Reprendre ce projet

Ce document est écrit pour une IA (ou un humain) qui reprend le projet **sans
aucun autre contexte** : ni historique de conversation, ni familiarity avec le
domaine, ni mémoire des décisions prises. Tout ce qu'il faut savoir est ici ou
dans le code.

L'ordre de lecture utile :

1. **ce document**, pour savoir quoi lire ensuite ;
2. `README.md`, le mode d'emploi complet ;
3. `docs/CONTRACTS.md`, la source de vérité du schéma de quêtes et de l'API ;
4. `docs/RELEASE-v1.0.md`, ce que cette version a décidé et où elle s'arrête.

---

## 1. Ce qu'est le produit, en une page

**Atelier Docker** est un serious game d'apprentissage de Docker, destiné à des
étudiants qui n'ont jamais tapé une commande Docker.

**Le contexte pédagogique** (à respecter dans toute évolution) :

- Chaque élève a **sa propre VM Ubuntu Server vierge**. Il travaille **seul**.
  L'enseignant débloque en personne, il n'y a pas d'assistant numérique.
- Le portail ne fait que **valider**. Il ne se connecte jamais au Docker des
  élèves et n'exécute aucune commande à leur place. Tout se tape dans le
  terminal de l'élève, sur sa VM.
- **7 ateliers**, un atelier = un bloc de cours. Cible 60 min, borne dure 90.
- 27 quêtes, ~7 h de contenu indicatif (413 min).
- **Fil rouge** : la librairie Verdi quitte son vieux serveur. Chaque atelier
  est une étape de la migration, et **chaque artefact sert l'étape suivante**.
  L'étudiant doit nommer l'artifact que chaque artifact sert.

**Les deux modes**, choisis à l'inscription :

- `competitive` → affiché **« Challenge »** : les deux premiers indices
  coûtent de l'autonomie.
- `normal` → affiché **« Sans stress »** : tous les indices sont gratuits.

Les deux ateliers sont **identiques** — mêmes quêtes, mêmes questions, mêmes
indices. La seule différence est le prix de l'aide. Les valeurs d'API sont un
contrat (`competitive` / `normal`) ; les libellés sont ce que l'élève lit
(`MODE_LABELS` dans `src/config.js`).

**Pas de score, pas de classement, pas de podium.** C'est un choix pédagogique
assumé : le score mesurait l'inégalité de départ entre élèves, pas leur
progression. À la place, trois mesures qui ne se comparent qu'à soi-même :
progression, autonomie, compréhension. Voir § 5.

**Origine** : ce dépôt est le successeur de `blaurans/seriousdocker`
 (« Docker Ops Race »), gelé sur le tag `v1.0.0` et maintenu. Une partie du
vocabulaire `arena` a survécu dans le code — voir § 9.

---

## 2. Déploiement en production

| | |
|---|---|
| URL publique | `https://atelierdocker.laurans.org` |
| Machine | `ssh ociuc` — aarch64 (Ampere A1), Ubuntu 24.04.5, Docker 29.3.0 |
| Dépôt du serveur | `/app/atelierdocker` (clone du dépôt GitHub) |
| Caddy | conteneur `caddy`, Caddyfile monté depuis `/app/headscale/Caddyfile` |
| Réseau Docker | `headscale_default` (externe, partagé avec Caddy) |
| Volume de données | `atelier-docker-data` |
| Disque | 121 Go, **86 % utilisés** — surveiller |

### Déployer

```bash
ssh ociuc
cd /app/atelierdocker
git fetch && git reset --hard origin/main
docker compose up -d --build
```

Puis vérifier :

```bash
curl -sS https://atelierdocker.laurans.org/healthz
docker ps --filter name=atelier-docker --format '{{.Status}}'
```

### Le bloc Caddy

```
atelierdocker.laurans.org {
    reverse_proxy atelier-docker:8000
}
```

`docker-compose.yml` ne publie **aucun port** : le portail rejoint le réseau
Docker du reverse proxy et n'est atteignable que par lui. Sans ce bloc dans le
Caddyfile, le portail tourne mais reste injoignable.

### La fenêtre de 502

Le déploiement coupe le service pendant ~10 s. Caddy renvoie alors `502 Bad
Gateway` à toute requête — y compris aux commandes de récupération de mot de
passe des élèves. **C'est la cause de deux échecs de CI** : voir § 8.

### Le mot de passe d'administration

```bash
ssh ociuc 'grep ATELIER_ADMIN_KEY /app/atelierdocker/.env'
```

Obligatoire : le serveur refuse de démarrer sans (`src/server.js`,
`verifierAdmin()`). `docker-compose.yml` échoue aussi, sur
`${ATELIER_ADMIN_KEY:?…}`.

---

## 3. Lancer en local

```bash
npm install          # une seule dépendance : express (+ linkedom en dev)
npm test             # 209 tests
npm start            # http://localhost:8000
```

`npm start` sans `ADMIN_KEY` **refuse de démarrer**. En local :

```bash
ADMIN_KEY=mdp npm start
```

Si le portail est derrière un proxy (Caddy en production, `TRUST_PROXY=1`),
sinon non. Un `TRUST_PROXY` activé sans proxy fait reconstruire les commandes
de récupération en `https://` vers le port 443, où rien n'écoute.

Conteneur de recette, avec publication de port :

```bash
docker build -t atelier-docker:test .
docker run -d --name recette -p 127.0.0.1:8094:8000 \
  -e ADMIN_KEY=mdp -e RATE_LIMIT=off -e QUIET=1 atelier-docker:test
```

`RATE_LIMIT=off` : sinon les tests automatisés, qui enchaînent les appels depuis
une seule adresse, se heurtent aux plafonds. `QUIET=1` coupe les logs.

---

## 4. Architecture

### Pile

- **Runtime** : Node ≥ 22.5 (l'image est `node:24-alpine`), ESM partout
  (`"type": "module"`).
- **Serveur** : Express 4. L'unique dépendance de production.
- **Base** : `node:sqlite`, le module **natif** de Node. Pas `better-sqlite3`,
  écarté parce qu'il demande une compilation native (`python3`, `make`, `g++`)
  dans l'image. Conséquence : le code tourne sur Node 22 à 26, et
  `docker build` n'a besoin que de Docker et de npm.
- **Front** : vanilla. Zéro dépendance, zéro CDN, zéro framework, zéro webfont.
  Le jeu doit fonctionner sur un réseau de TP coupé d'Internet.
- **Markdown** : mini-renderer maison (`public/md.js`), rendu par construction
  DOM. Le contenu pédagogique n'est **jamais** interprété comme du HTML.

### Carte des fichiers

```
content/quests/m*.js    les 27 quêtes — données pures, aucune logique
src/
  server.js             createApp() + start() ; montage des routes, statique, erreurs
  config.js             toute la configuration d'environnement, MODES, MODE_LABELS
  db.js                 node:sqlite + migrations « j'ajoute une colonne »
  schema.sql            6 tables, lues au démarrage
  questpack.js          chargement + VALIDATION du contenu (échec au démarrage)
  mastery.js            les trois ratios, les cinq paliers, la synthèse de cohorte
  progress.js           validation d'une quête : écrit des faits, jamais des cumuls
  portal.js             état de la classe + flux SSE (derrière le mot de passe)
  admin_session.js      mot de passe → jeton HMAC → cookie HttpOnly
  auth.js               HttpError, identification du joueur, requirePlayer
  secret.js             dérivation du mot de passe d'une quête (HMAC)
  ratelimit.js          plafonds par IP, clientIp(), lecture de X-Forwarded-For
  events.js             bus d'événements interne (SSE)
  routes/api.js         le parcours de l'élève
  routes/atelier.js     indice, compréhension, réflexe
  routes/admin.js       tout ce qui est fermé + la vue de classe
  repo/arena.js         accès SQLite : joueurs, validations, journal
  repo/progress_repo.js indices consommés, tentatives de compréhension
public/
  index.html + app.js   l'écran des élèves, servi sur `/`
  admin.html + admin.js l'écran de l'enseignant, servi sur `/admin`
  md.js                 mini-renderer Markdown
  style.css             une feuille pour les deux écrans
outils/navigateur/      recette dans un vrai Chromium (CDP) — § 7
test/                   209 tests
docs/
  CONTRACTS.md          source de vérité : schéma de quête + contrat d'API
  RELEASE-v1.0.md       notes de version
scripts/
  check-content.js      le contenu est-il chargeable ?
  check-fetchhints.js   REJOUE les 27 commandes de récupération — demande Docker
  nettoie-verif.js      purge les joueurs de vérification
  smoke.js              joue les 27 quêtes, affiche la maîtrise
  seed.js               réinitialise la base
  inject-fetchhint.js   migration de contenu (utilisé une fois, conservé)
docs/CONTRACTS.md       (voir plus haut)
```

### L'ordre de montage, dans `server.js`

```js
app.get('/healthz', …)
app.use('/api', admin);      // AVANT api
app.use('/api', atelier);
app.use('/api', api);
app.get('/admin', …)         // servie sans mot de passe : c'est le formulaire
app.use(express.static(publicDir))
app.use(GET inconnu → index.html)
```

`admin` **avant** `api` : `/api/overview` et `/api/stats` vivent dans `admin`
et doivent rester derrière le mot de passe. Montées dans l'autre ordre, `api`
les redéfinirait et personne ne le verrait.

---

## 5. Le modèle de mesure

C'est le cœur de la V2. Le remplacer par un score serait une régression.

### Trois ratios, sur un seul élève

| ratio | formule | source |
|---|---|---|
| progression | validées / `totalQuests` (27) | `src/mastery.js` |
| autonomie | validées **sans indice payé** / validées | idem |
| compréhension | validées avec QCM réussis / validées | idem |

Le dénominateur de la progression est **le jeu entier**, jamais le nombre de
quêtes faites. Un élève à 5/27 est à 19 %, pas à 100 %.

### Cinq paliers, deux seuils chacun

```js
LEVELS = [
  { key: 'debout',      name: 'Debout dans le conteneur', min: 0,    minProgress: 0    },
  { key: 'ranim',       name: 'Ça tourne',               min: 0.10, minProgress: 0.05 },
  { key: 'autonome',    name: 'Autonome',                min: 0.50, minProgress: 0.25 },
  { key: 'travailleur',  name: 'Geste sûr',               min: 0.75, minProgress: 0.50 },
  { key: 'maitre',      name: 'Maîtrise',                min: 0.90, minProgress: 0.80 },
];
```

**Les deux seuils sont obligatoires.** Sans `minProgress`, un élève qui réussit
sa première quête sans indice a 100 % d'autonomie et verrait « Maîtrise »
s'afficher à 4 % du jeu.

### Les deux compteurs d'indices

| champ | ce que c'est | qui l'utilise |
|---|---|---|
| `hints_used` | indices **demandés** | l'enseignant, pour voir où ça coince |
| `hints_charged` | indices **payés** | **l'autonomie, et rien d'autre** |

En mode Sans stress, `charged` est 0 (annulation côté serveur) alors que
`hints_used` compte. Compter la consommation aurait annulé le prix sans annuler
la conséquence : l'élève verrait sa maîtrise chuter sans avoir rien payé.

`src/mastery.js` retombe sur `hints_used` quand `hints_charged` est absent —
pour les lignes V1. `src/progress.js` écrit les deux.

---

## 6. Le contrat d'API

Le détail est dans `docs/CONTRACTS.md`. L'essentiel :

### Routes de l'élève — ouvertes

| route | rôle |
|---|---|
| `POST /api/register` | inscription ; `201` créé, `200` existe, `409` secret faux, `400` invalide |
| `GET /api/quests` | le programme — **sans** les indices, **sans** les réponses |
| `GET /api/me` | maîtrise et historique du joueur |
| `POST /api/submit` | soumission d'un mot de passe |
| `GET /api/secret/:questId` | le mot de passe, en JSON |
| `GET /api/secret/:questId/raw` | le mot de passe, en texte brut (pour `wget`) |
| `GET /api/commands` | mémento des commandes |
| `POST /api/quests/:id/hint` | rend **un** indice, l'enregistre, renvoie ce qu'il a coûté |
| `POST /api/quests/:id/check` | vérifie une réponse de compréhension |
| `POST /api/quests/:id/recall` | vérifie le réflexe ; renvoie l'aide si faux |
| `GET /api/quests/:id/attempts` | ce que l'élève a déjà répondu |

### Routes d'enseignant — fermées

`/api/overview`, `/api/live`, `/api/stats`, `/api/admin/*` (session, reset,
delete, mode, attest, pending, seed, qui). Toutes derrière `requireAdmin`.

**`GET /admin` est publique** : la page *est* le formulaire. Ce qui est protégé,
c'est ce qu'elle affiche.

### Deux règles d'API à ne jamais casser

1. **Ce qui est montré au client a été demandé au serveur.** Les indices vivent
   dans `pack.hintsByQuest`, **hors** du graphe d'objets que sérialise
   `/api/quests`. La fuite est impossible par oubli : il faudrait un accès
   explicite à cette table. `check[].answer`, `check[].explanation`,
   `recall[].accept`, `recall[].hint` et `hints` ne sortent jamais (les
   explications et aides, seulement après une bonne / mauvaise réponse).

2. **Le mot de passe n'apparaît dans aucun énoncé.** Il est dérivé par HMAC du
   jeton du joueur (`src/secret.js`), donc unique par couple joueur × quête.
   Chaque mission fournit la commande qui va le chercher, et cette commande
   utilise la technique que le module enseigne.

### Substitution des commandes

`jouable()` dans `src/routes/api.js` remplace, **partout** :

- `https://SERVER_IP` / `http://SERVER_IP` → l'origine vue par l'élève ;
- `dq_xxxxxxxxxxxxxxxx` et `$ARENA_TOKEN` → le jeton du joueur.

Les trois substitutions s'appliquent au `brief` comme à `fetchHint`. Le point
est acquis : une substitution limitée à `fetchHint` a produit un `401` sur la
commande de l'énoncé — un élève copiait une commande qui ne pouvait pas
fonctionner, juste au-dessus de la bonne.

### Authentification

- **Joueur** : `X-Arena-Token`, `Authorization: Bearer`, `?token=`, `?t=`, ou
  `{team, secret}` dans le corps.
- **Administration** : cookie `dq_admin` signé HMAC-SHA256 (`HttpOnly`,
  `SameSite=Strict`, `Secure` si HTTPS), ou `X-Arena-Admin` qui accepte **le mot
  de passe en clair** pour `curl` et les scripts.

---

## 7. Le contenu : sept ateliers

Écrire une quête impose de respecter `docs/CONTRACTS.md` § 1. Le validateur
(`src/questpack.js`) **fait échouer le serveur au démarrage** si quelque chose
manque, et nomme le fichier et la quête. C'est délibéré : un contenu invalide
découvert par un élève devant trente collègues est pire qu'un portail qui ne
démarre pas le matin.

| # | atelier | slug | quêtes |
|---|---|---|---|
| 1 | Préparer le terrain 🔧 | `m1-preparer-le-terrain` | 4 |
| 2 | Récupérer et lancer 📦 | `m2-recuperer-et-lancer` | 4 |
| 3 | Régler en service ⚙️ | `m3-regler-en-service` | 4 |
| 4 | Faire les se parler 🌐 | `m4-faire-les-se-parler` | 4 |
| 5 | Figer la version 📄 | `m5-figer-la-version` | 4 |
| 6 | Ne rien perdre 💾 | `m6-ne-rien-perdre` | 4 |
| 7 | Décrire la pile 📚 | `m7-decrire-la-pile` | 3 |

Chaque fichier `content/quests/m<N>.js` exporte **un objet** `{ meta, quests }`
en ESM. Chaque quête : `id`, `order`, `title`, `points`, `flag`, `estMinutes`,
`brief`, `hints` (0–3), `charge`, `check` (0–3), `recall`, `solution`,
`teaches`, `checkpoint`, **`fetchHint` (obligatoire)**.

### Les invariants qui comptent

- `flag` : `FLAG{MAJUSCULES_ET_TIRETS_BAS}`, unique dans tout le jeu, **jamais
  dans le `brief`**.
- `charge.autonomy` : autant d'entrées que `hints`, **et le dernier vaut 0** —
  un élève bloqué n'a jamais le droit de rester coincé.
- `check[].explanation` : obligatoire, ≥ 15 caractères, et **ne doit pas figurer
  mot pour mot dans le `brief`**.
- `recall.hint` : obligatoire, et ne contient **jamais** un mot de `accept`.
- `fetchHint` : ≥ 20 caractères, vise `/api/secret/<id>/raw`, et cible
  `SERVER_IP` ou `127.0.0.1` **avec** `--network host`.
- Le `brief` est un **sous-ensemble** de Markdown : `# ` (un seul), paragraphes,
  `- `, `1. `, blocs ```` ```bash ````, `**gras**`, `*italique*`, `` `code` ``,
  liens http(s). **Interdits** : tableaux, images, HTML, listes imbriquées,
  plusieurs titres `#`. Le validateur s'applique à la **prose** seulement, pas
  aux blocs de code — un énoncé qui montre une sortie de commande contient
  naturellement des `#` de commentaire et des `|`.
- Le `recall` est rare et volontaire : **deux sur vingt-sept**. Il ne vaut que
  si l'élève doit *retrouver*. Partout ailleurs la commande est donnée et le QCM
  porte la vérification.
- Chaque module : un multiple de 100 points, et **une seule** quête phare (points
  multiples de 100), qui doit être la dernière. La somme croît d'un module à
  l'autre.

### Le `brief` est la seule source pédagogique

Aucun `solution` dans le `brief`, aucun indice dedans, et pas de consigne
demandant une réponse écrite sans champ pour la saisir. Tout ce qui est
interdit est vérifié par `src/questpack.js`.

### Pour ajouter une quête

1. Éditer `content/quests/m<N>.js`.
2. `node scripts/check-content.js && npm test`.
3. Vérifier au navigateur : `node outils/navigateur/verifie-jeu.mjs <url>`.

Le `brief` passe par `public/md.js`, dont le sous-ensemble supporté est
strict. Une syntaxe non rendue disparaît **silencieusement** : c'est le défaut
de rendu le plus facile à manquer.

---

## 8. Les vérifications

```bash
npm test                      # 209 tests — 10 s
npm run check-content         # le contenu est chargeable
npm run smoke                 # joue les 27 quêtes (demande un portail)
npm run check-fetchhints      # REJOUE les 27 commandes — demande Docker
npm run nettoie-verif         # purge les joueurs de vérification
```

### La CI

`.github/workflows/verifications.yml`, sur chaque push et chaque PR :

| job | ce qu'il prouve |
|---|---|
| `tests` | 209 tests, contenu validable, image construite, conteneur qui démarre et sert |
| `commandes` | les **27 commandes de récupération** contre le portail de production — **`main` seulement**, en continu |

Le job `commandes` inscrit un joueur en production. Il le supprime en sortant ;
`nettoie-verif` est le filet pour une exécution interrompue. Il lui faut
`ATELIER_ADMIN_KEY` — **le secret GitHub n'est pas configuré** sur ce dépôt, donc
le ménage ne passe pas et chaque exécution laisse un `Verif_*` à nettoyer à la
main. C'est une chose à corriger.

### Pourquoi le job `commandes` existe

C'est le seul contrôle qui prouve que le jeu marche sur une vraie machine : les
tests unitaires ne lancent pas Docker. Il a attrapé un bug qu'aucun test ne
pouvait voir.

---

## 9. Conventions

- **Échec au démarrage plutôt qu'incohérence en cours de TP.** Le contenu est
  chargé en `await` au chargement du module ; une faute de frappe dans un flag
  empêche le serveur de démarrer, avec un message qui nomme le fichier.
- **Une seule dépendance de production.** Toute complication doit être justifiée
  par un coût mesurable.
- **Nommage** : le vocabulaire `arena` a survécu au changement de nom du
  produit — `ARENA_CHANGED`, `X-Arena-Token`, `X-Arena-Admin`,
  `repo/arena.js`, `ARENA_SALT`, `ARENA_LINEAR`, `ARENA_RATE_LIMIT`,
  `ARENA_ATTESTATION`, `secret.js` (l'en-tête `/api/secret`). C'est un contrat
  d'API ; le renommer coûterait un diff de plusieurs centaines de lignes pour
  aucun gain. **Ne pas le « nettoyer »** : c'est déjà arrivé une fois et le
  diff a été annulé.
- **Les erreurs HTTP** : `HttpError` (statut + message écrit pour être lu) pour
  le volontaire, 500 générique pour le reste. Le handler décide sur
  `err instanceof HttpError`, **pas** sur le statut.
- **`points` est un vestige.** Plus rien ne le lit ; les invariants sont
  maintenus pour que le contenu se charge sans réécriture.
- **Les commentaires expliquent le pourquoi**, pas le quoi. C'est la convention
  dominante du dépôt.

---

## 10. La recette dans un vraie navigateur

`outils/navigateur/` — six scripts CDP, aucune dépendance. **C'est le moyen le
plus important de trouver un défaut d'affichage** : cinq des neuf défauts
corrigés avant la v1.0 étaient invisibles depuis les tests unitaires, qui
exécutent `public/app.js` contre un DOM de substitution.

Voir `outils/navigateur/LISEZ-MOI.md` pour Chromium, les arguments, et les
pièges déjà payés. Les trois qui coûtent le plus cher :

1. **Un `confirm` natif bloque le renderer de son onglet.** `Page.enable` n'y
   répond plus jamais. Créez un onglet neuf à chaque exécution.
2. **Naviguer vers la même URL ne recharge pas la page.** Ajoutez `?r=<aléatoire>`.
   Sans ça, le script rapporte fidèlement un bug déjà corrigé.
3. **`Page.captureScreenshot({captureBeyondViewport: true})` ment.** Elle
   recompose la page et laisse des couches peintes là où un élément
   `display: none` se trouvait. Pour vérifier une présence/absence, capturez le
   **viewport** seul. C'est ce qui a produit une fausse conclusion « le champ
   est invisible ».

---

## 11. L'administration

### La page

`/admin` : mot de passe → tableau de classe (pseudos, progression, autonomie,
compréhension, niveau, IP du poste, indices), statistiques de cohorte, journal
des événements, flux SSE, et quatre actions par joueur (remettre à zéro, changer
de mode, supprimer, attester). Plus un formulaire d'inscription rapide, avec son
champ secret.

`public/admin.js` : `api()` avec relance sur `401` → retour au formulaire,
`lancerFlux()` / `arreterFlux()` pour le SSE, `rendreJoueurs()` / `rendreStats()`,
et `confirmer()` avant toute action destructrice.

### La session

Un mot de passe, échangé contre un jeton HMAC-SHA256
(`<expiration>.<signature>`), dans un cookie `HttpOnly; SameSite=Strict`,
valable 8 h (une journée de cours). Le mot de passe **n'est jamais stocké** : il
sert à vérifier la signature et à comparer — sur deux **hachés SHA-256 à préfixe
fixe**, jamais sur les chaînes, pour ne pas laisser de fenêtre de timing.

### Les scripts de nettoyage

```bash
ssh ociuc 'bash -s' < /tmp/nettoie-comptes.sh
```

Le script lit `ATELIER_ADMIN_KEY` dans `.env`, appelle
`POST /api/admin/delete/<pseudo>`, puis affiche l'état de la classe. Le motif
`/tmp` est celui de l'agent : **ces scripts ne sont pas dans le dépôt**. Les
recréer, ou utiliser `npm run nettoie-verif` qui couvre le cas `Verif_*`.

---

## 12. Vérifier avant de conclure

Cinq défauts sur neuf venaient d'une vérification incomplète, pas d'un raisonnement
faux. L'ordre qui fonctionne :

1. **`npm test`** — les invariants.
2. **`node scripts/check-content.js`** — le contenu est chargeable.
3. **Le conteneur de recette + `outils/navigateur/verifie-jeu.mjs`** — ce que
   l'élève voit vraiment.
4. **`outils/navigateur/verifie-admin.mjs`** — l'écran enseignant, y compris la
   confirmation avant une action destructrice.
5. **Contre la production** — `outils/navigateur/verifie-*.mjs
   https://atelierdocker.laurans.org`, puis nettoyer les joueurs créés.

Ne pas conclure qu'un bouton fonctionne parce que le handler est correct. Ne pas
conclure qu'un élément est absent d'une assertion sur le JavaScript — un champ
`hidden` ne se voit pas dans une assertion, et c'est exactement le défaut qu'il
fallait trouver.

---

## 13. Pièges déjà payés

Liste courte des erreurs récurrentes. Chacune a coûté du temps.

| piège | pourquoi il mord |
|---|---|
| couper du code par numéro de ligne | un appel de fonction non défini est une erreur d'**exécution**, pas de syntaxe : `node --check` ne la voit pas. La première coupe a emporté 368 lignes au lieu de 302, avec `showGate`, `showPlay` et les gestionnaires de mode. **Utiliser un script de coupe à garde-fous**, avec assertions sur les frontières *et* sur les symboles qui doivent survivre. |
| substituer une globale dans un harnais de test | `loadClient` passait `confirm` **en paramètre** à une `new Function` : remplacer `globalThis.confirm` après ne changeait rien, et les tests échouaient en désignant une cause étrangère au code testé. |
| un diagnostic qui n'accuse pas **la** chose | trois fois dans ce projet : `https://https://` au premier commit, « portail injoignable » pour un 401, et vingt-et-une quêtes « cassées » qui fonctionnaient pendant un redéploiement. Un diagnostic doit nommer la subsysteme en cause. |
| lire la sortie d'un shell pour juger une commande | une commande qui reçoit un 502 **sort en 0** : elle a bien tourné. Regarder le statut ne prouve rien ; il faut lire le contenu. |
| `.click()` contre `dispatchEvent` | `.click()` respecte `disabled` ; `dispatchEvent` non. Le premier respecte le comportement réel, le second permet de déclencher ce qui ne se déclencherait pas. |
| `captureBeyondViewport` | laisse des couches peintes là où un élément était masqué. |
| navigation vers la même URL | ne recharge pas — l'app garde son état. |
| `linkedom` n'implémente pas tout | `readOnly` y est `undefined`. Lire l'attribut (`hasAttribute`) plutôt que la propriété. |
| `[hidden]` battu par une règle d'auteur | `.admin-gate { display: grid }` l'emporte sur le `display: none` du navigateur (même spécificité, feuille d'auteur après). D'où `[hidden] { display: none !important }` en ligne 50 de `style.css`. **Ne pas retirer ce `!important`.** |
| `readonly` sur un champ `sr-only` | `display: none` retire l'élément de l'accessibilité ; les gestionnaires de mots de passe ne le voient plus. |

---

## 14. Limites connues, et la suite logique

À traiter dans cet ordre, si le projet continue.

1. **Aucune sauvegarde.** Le volume `atelier-docker-data` est sur le seul disque
   du serveur (86 % utilisés). Pas de copie, pas de réplication. C'est le risque
   le plus élevé du déploiement.
2. **`ATELIER_ADMIN_KEY` n'est pas dans les secrets GitHub.** Le job `commandes`
   laisse donc un `Verif_*` par exécution.
3. **`LINEAR_PROGRESSION` n'est pas une contrainte serveur.** `/api/submit`
   n'accepte que le flag, dans les deux cas. Assumé. Pour une vraie contrainte :
   `ARENA_ATTESTATION=1` — mais alors le portail n'est plus autonome, et
   l'enseignant doit valider chaque quête.
4. **Les quotas sont par IP, pas par jeton.** En salle derrière un NAT, toute la
   promotion partage un compteur : le plafond de 40/min sur `/api/submit` peut
   renvoyer des 429 à tout le monde.
5. **CSS mort** dans `public/style.css` : `.portal-head`, `.portal-body`,
   `.portal-foot`, `.podium`, `.panel-amber`, `.panel-emerald`, `.panel-cyan` —
   des restes du portail supprimé. Cosmétique ; à retirer dans un passage
   propre, pas au fil de l'eau.
6. **Le `recall` n'est présent que sur 2 quêtes sur 27.** Choix délibéré, mais
   un point à reconsidérer si l'enseignant veut plus de mémorisation.
7. **`inject-fetchhint.js`** a servi une fois à migrer le contenu. Il est
   conservé par prudence, mais il n'a plus de raison d'être : le `fetchHint` est
   désormais dans chaque quête, écrit à la main.
8. **Les scripts de nettoyage de production** vivent hors du dépôt. Les mettre
   dans `scripts/` les rendrait disponibles à l'enseignant.

---

## 15. Si tu reprends ce projet

Trois orientations possibles, par ordre de coût :

**Écrire du contenu.** C'est là que le projet a le plus de valeur et le moins
d'obstacle. Un atelier = un bloc de cours ; respecter `docs/CONTRACTS.md` § 1 et
laisser le validateur juger. Le validateur est un professeur exigeant : il vaut
mieux.

**Corriger ce qui coince.** Les neuf défauts de la v1.0 ont tous été trouvés en
jouant, pas en lisant le code. Le premier coup est donc de jouer : ouvrir le
contenu, lire les 27 briefs, les 70 questions, les 81 indices, et chercher ce qui
ne se tient pas. Les deux `recall` sont les candidats les plus probables — il y
en a deux, et la logique en veut plus.

**Améliorer la mesure.** C'est le cœur du projet. Trois questions à poser :
est-ce que l'enseignant sait, pendant la séance, qui est bloqué et où ? Est-ce
que l'élève sait ce qu'il a appris ? Est-ce que la mesure reste comparable à
elle-même d'un atelier à l'autre ? La réponse à la troisième est la plus
difficile, et c'est celle qui compte.

Dans tous les cas : **pousser sur GitHub et sur le serveur d'abord, puis
continuer.** Le portail est en production sur une URL publique ; un changement
non déployé est un changement que personne n'a vu.