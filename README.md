# 🐳 Atelier Docker

Serious game d'apprentissage de Docker **pour des étudiants qui n'ont jamais
tapé une commande Docker**. 7 ateliers, 27 quêtes, deux modes au choix dès
l'inscription.

Ce qui a changé par rapport à Docker Ops Race : il n'y a plus de points ni de
classement. À la place, trois mesures qui ne se comparent qu'à soi-même —
la **progression**, l'**autonomie** (des quêtes réussies sans indice) et la
**compréhension** (des quêtes validées avec les questions justes). Les indices
sont payants, et la compréhension est vérifiée.

Successeur de [Docker Ops Race](https://github.com/blaurans/seriousdocker), dont
la V1 est gelée sur le tag `v1.0.0`. Cette V2 change ce qui compte :
l'ordre des ateliers, le fil rouge qui les relie, et la façon dont la
compréhension est vérifiée.

## Mise en ligne

Le portail est en production sur **https://atelierdocker.laurans.org**, servi
par Caddy (TLS automatique) devant le conteneur.

Trois adresses, et c'est tout :

| adresse | pour qui |
|---|---|
| `https://atelierdocker.laurans.org` | **les élèves.** C'est la page d'accueil : elle ouvre directement l'écran de choix de mode |
| `https://atelierdocker.laurans.org/#/` | les mêmes, par l'ancienne adresse — elle fonctionne encore |
| `https://atelierdocker.laurans.org/admin` | **l'enseignant.** Derrière le mot de passe du `.env` |

```bash
cp .env.example .env
$EDITOR .env          # ATELIER_ADMIN_KEY est obligatoire
docker compose up -d --build
```

Puis, côté reverse proxy, un bloc de plus dans le Caddyfile :

```
atelierdocker.laurans.org {
    reverse_proxy atelier-docker:8000
}
```

Le `docker-compose.yml` **ne publie aucun port** : le portail rejoint le
réseau Docker du reverse proxy (`headscale_default`) et n'est atteignable que
par lui. Sans cette ligne dans le Caddyfile, le portail tourne mais reste
injoignable ; sans `ATELIER_ADMIN_KEY`, le compose refuse de démarrer.

### Portail en local, sans proxy

Pour travailler sur le code, il faut repasser par une publication de port. La
copier dans un `compose.override.yml` — jamais dans le fichier versionné :

```yaml
services:
  atelier:
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      TRUST_PROXY: "0"
```

```bash
docker compose up -d --build
```

Le portail répond alors sur `http://127.0.0.1:8000`, en `http` : `TRUST_PROXY`
vaut `0` parce qu'aucun proxy ne renseigne `X-Forwarded-Proto`. En recouvrant
ce `0` à `1` sans proxy, les commandes de récupération de mot de passe
partiraient en `https` vers le port 443 de la machine locale, où rien n'écoute.

---

## Ce que fait l'étudiant

Il choisit un mode, puis joue les missions sur **son propre Docker**, en
tapant les commandes dans son terminal habituel. Le portail ne fait que
valider.

### Aucun verrou, dans les deux modes

Les 27 missions sont accessibles dès la première seconde. Un étudiant bloqué
sur la mission 7 peut lire la 12, consulter une correction antérieure, ou
attaquer directement le boss final. **Vous validez dans l'ordre que vous voulez.**

Le bandeau « Par où continuer » au programme propose une suite, mais n'oblige
à rien. **L'ordre de validation ne change rien** à la maîtrise : c'est vérifié
par un test, parce que c'était l'effet du bonus de podium en V1.

Si vous préférez une progression linéaire (dépannage de TP, ou progression
évaluée au fil de l'eau) :

```bash
echo "ARENA_LINEAR=1" >> .env && docker compose up -d
```

À noter : c'est un **guidage d'affichage**, pas une contrainte. Le plan ne
montre que la mission suivante comme ouverte, mais un appel direct à
`/api/submit` validerait quand même n'importe quel flag. C'est volontaire :
un ordre imposé côté serveur punirait l'étudiant qui utilise `curl` comme
documenté, sans rien apporter. Pour une contrainte réelle, c'est
`ARENA_ATTESTATION=1` — chaque flag correct attend alors votre validation.

|  | ⚡ Challenge | 🧘 Sans stress |
|---|---|---|
| Temps affiché | oui, par quête | oui |
| Indices | **payants** — coûtent de l'autonomie | gratuits |
| Classement | aucun | aucun |
| Contenu | identique | identique |

**Les deux modes partagent exactement le même contenu et les mêmes mesures.** La
seule différence est le prix des indices. C'est tout.

Un élève en Sans stress n'a donc pas « un mode sans points » : il a le même jeu
que les autres. Ce qui change, c'est qu'il peut demander de l'aide sans que ça
se voie. C'est le mode par défaut quand le professeur est là.

Et aucun mode ne classe les élèves. La seule liste du portail est triée
alphabétiquement.

---

## Le parcours

| Module | Quêtes | Points | Durée | Le student y apprend |
|---|---|---|---|---|
| 1 · 🧭 Les fondamentaux | 3 | 100 | ~35 min | image ≠ conteneur, `docker ps`, `--help` |
| 2 · 📦 Images & premier conteneur | 4 | 200 | ~45 min | `pull`, `run --rm`, couches, **Initial Boot** |
| 3 · 🧰 Le conteneur en détail | 4 | 300 | ~65 min | `create`/`start`, `exec`, `cp`, **Infiltration Interactive** |
| 4 · 🌐 Réseau & ports | 4 | 400 | ~70 min | `-p`, `bridge`, DNS par nom, **Port Master** |
| 5 · ⚗️ Construire une image | 4 | 500 | ~80 min | `commit` vs Dockerfile, `CMD`/`ENTRYPOINT`, **Image Alchemist** |
| 6 · 💾 Persistance & volumes | 4 | 600 | ~70 min | bind mounts, volumes nommés, **Persistence Guardian** |
| 7 · ⚡ Docker Compose | 3 | 700 | ~65 min | YAML, `up -d`, `down`, **Compose Overlord** |

Les six missions en gras sont **les six missions du cahier des charges**, avec
leurs flags d'origine et leur barème 100 → 600. Les 20 autres sont des
intermédiaires qui construisent le chemin.

Chaque mission a jusqu'à **3 indices** (du plus flou au plus direct) et une
**correction** revealed après validation.

---

## Comment la validation fonctionne

Le mot de passe d'une mission **n'existe pas comme donnée**. Il n'est dans aucun
énoncé, dans aucune commande, dans le code. Le serveur le calcule à la volée :

```
FLAG{ HMAC_SHA256(sel_du_déploiement, jeton_du_joueur + ":" + id_mission)[:20] }
```

Un étudiant récupère donc son mot de passe **en exécutant une commande**, et
cette commande est **celle que le module vient d'enseigner** :

| Module | Technique | Le mot de passe sort de… |
|---|---|---|
| 1 · fondamentaux | lancer un conteneur | sa sortie |
| 2 · images | `docker run` | la sortie du conteneur |
| 3 · conteneurs | entrer dans un conteneur en marche | `docker exec` / `docker cp` |
| 4 · réseau | requête HTTP sur un port publié | la réponse du serveur web |
| 5 · images construites | construire et lancer son image | la sortie de son image |
| 6 · volumes | volume relu par un second conteneur | le fichier relu après destruction |
| 7 · Compose | journaux de la pile | `docker compose logs` |

Exemple — mission 15, « Port Master » :

```bash
docker run -d -p 8080:80 --name arena-web nginx:alpine
docker exec arena-web wget -qO /usr/share/nginx/html/index.html \
  "https://atelierdocker.laurans.org/api/secret/m4-04-port-master/raw?t=dq_..."
curl -s http://localhost:8080
```

Le mot de passe arrive **par le port publié** : la mission n'est validée que si
le réseau fait réellement son travail.

Trois conséquences :

- **il est différent pour chaque joueur** — le communiquer à un autre
  ne lui sert à rien ;
- **il est impossible à deviner** — sans jeton, la route renvoie `401` ;
- **il est impossible à copier depuis un autre écran** — celui du voisin est
  calculé à partir de *son* jeton, et ne valide chez personne d'autre.

Le validateur de contenu **refuse de démarrer le serveur** si un flag traîne
dans un énoncé : `npm run check-content` le signale avant même que vous ne
lanciez un TP.

**Honnêteté sur la triche — lisez ceci.** Ce mécanisme prouve que l'étudiant a
la bonne *clé*, pas qu'il a fait le *travail*. Un déterminé peut demander son
mot de passe à un ami, ou lire la commande dans son historique de shell avant
de prétendre ne pas l'avoir fait. Rien de ce que le jeu observe ne prouve
l'exécution réelle, et il ne prétend pas le contraire.

Si l'évaluation doit être incontestable, c'est `ARENA_ATTESTATION=1` — chaque
mot de passe correct reste **en attente** de votre validation. C'est la seule
barre qui tienne. Voir § *Attestation*.

Les deux travaux du sous-agent sont conservés : les 6 missions historiques
gardent leur intention pédagogique d'origine, et la mission 5 construit
réellement une image (`docker build` avec le mot de passe en `ARG`).

---

## La maîtrise

Trois mesures, sur un seul élève. **Aucune ne se compare à celle d'un camarade.**

| Mesure | Ce qu'elle compte |
|---|---|
| **progression** | où j'en suis : quêtes validées sur le total |
| **autonomie** | ce que j'ai su faire seul : validées **sans indice** |
| **compréhension** | ce que j'ai compris : validées avec les questions justes |

Le niveau suit **deux** seuils à la fois — autonomie et avancement. Sans le
seuil d'avancement, un élève qui réussit sa première quête sans indice (100 %
d'autonomie) verrait « Maîtrise » s'afficher immédiatement.

| Palier | autonomie | avancement |
|---|---|---|
| Debout dans le conteneur | 0 | 0 |
| Ça tourne | 10 % | 5 % |
| Autonome | 50 % | 25 % |
| Geste sûr | 75 % | 50 % |
| Maîtrise | 90 % | 80 % |

### Pourquoi plus de score

Le score V1 répondait à « qui a été le plus rapide ? ». C'est une question **sur
la promotion**, pas sur l'élève : le premier d'une classe lente apprend autant
que le vingtième d'une classe rapide, et l'affichage disait le contraire.

Le portail perd son classement en direct, qui était son effet le plus
spectaculaire. C'est le prix à payer, et il est assumé. Ce qui le remplace —
`meta.cohort` — répond à la seule question que l'enseignant se pose pendant une
séance : **où est-ce que ça coince ?**, listée par atelier et par indices
consommés.

### Les indices coûtent de l'autonomie

Un indice pris fait perdre la quête pour le compteur d'autonomie, pas pour la
progression : la quête compte comme **achevée**, mais pas comme **acquise
seul**. Le coût est affiché avant le clic, jamais après.

**Le dernier indice est toujours gratuit.** Un élève bloqué n'a jamais le droit
de rester coincé : le professeur est disponible en salle, et on ne transforme pas
sa disponibilité en variable d'ajustement.

Le contenu des indices ne sort plus par `/api/quests`. La réponse ne porte qu'un
nombre, et le texte passe par `POST /api/quests/:id/hint`, qui écrit une ligne en
base. Un élève ouvre l'onglet réseau : il voit trois boutons, pas trois
solutions. Rejouer la même demande ne coûte rien une seconde fois — c'est
garanti par un `UNIQUE` en base, pas par le client.

### La compréhension est vérifiée

Chaque quête peut porter jusqu'à trois questions à choix fermé, et une question
de **réflexe** (« quelle option sert à publier un port ? »). On compare des
jetons, pas des commandes entières : l'ordre des flags n'est pas le réflexe,
l'option est.

La réponse ne **bloque pas** la validation. C'est un choix : punir un élève qui a
cherché le punit de chercher moins. L'écart est visible par l'enseignant —
chaque question compte ses tentatives.

---

## Prérequis côté étudiant

**Atelier 1 installe Docker.** L'élève commence sur une VM Ubuntu Server vierge
et finit l'atelier avec `docker version` qui répond. Il n'y a donc aucun
prérequis — mais il faut que la VM ait `sudo`, un accès à `apt` et à Internet,
sans quoi l'installation de l'atelier 2 échoue.

Les ateliers suivants supposent que celui-ci a été fait.

- Linux :Docker Engine
- Windows / macOS : Docker Desktop, ou Docker Engine via WSL2
- Rien d'autre : pas de plugin, pas d'agent, pas de configuration du portail

Le PDF prévoyait trois architectures (postes locaux, VMs, serveur partagé).
Celle-ci est l'**Option A** : postes locaux, un élève par poste. Zéro collision
de ports, aucune destruction croisée entre élèves, conditions réelles
d'ingénierie.

---

## Guide de l'enseignant

### Ce que voit l'étudiant

Le jeu tient en trois zones. Rien n'est caché, mais tout n'est pas évident au
premier coup d'œil.

**L'en-tête** — son pseudo, son mode, l'heure d'inscription, et une
pastille violette `🔑 dq_a1b2c3…` : c'est son jeton d'API. **Un clic le copie**
dans le presse-papiers, ce qui évite de le retaper dans une commande `curl`.
Le jeton est tronqué à l'affichage : sur un vidéoprojecteur, on ne laisse pas
traîner les identifiants en clair.

**Le plan, à gauche** — les 7 modules et les 27 missions, avec le compteur de
progression. Une mission validée porte un ✅, la suivante à faire est signalée
en haut par un encadré « Par où continuer ». Toutes les missions sont
accessibles : rien n'est verrouillé.

**La mission, à droite** — l'énoncé, les mots-clés travaillés, les questions de
compréhension, le réflexe à restituer, les indices (demandés un par un, du plus
flou au plus direct), le point de contrôle, puis le formulaire de validation.

### Valider une mission

Le formulaire comporte deux étapes numérotées, dans cet ordre :

1. **« Va chercher ton mot de passe »** — un bloc de commande, avec un bouton
   `📋 copier la commande` à côté. La commande fait trois lignes et contient un
   jeton de 40 caractères : la recopier à la main depuis un affichage est le
   meilleur moyen de se tromper d'un caractère et de ne jamais comprendre
   pourquoi. **copiez-la.**
2. **« Colle-le ici »** — le champ de saisie, puis `Valider la mission`.

Le mot de passe s'affiche alors avec ce qu'il a rapporté : si la quête a été
faite sans indice, si la compréhension est vérifiée, et le niveau atteint.

> **Attention**, la mission 1 demande de lancer un conteneur. Si l'étudiant
> colle le mot de passe sans avoir lancé la commande, il obtient `401` ou
> `invalid`. C'est normal : le mot de passe est **le résultat** de la commande,
> il n'existe pas autrement.

### Avant le TP

1. `docker compose up -d --build` (voir § Mise en ligne pour le `.env`).
2. En salle, le portail est déjà en ligne. Projetez
   **https://atelierdocker.laurans.org/admin** : c'est l'écran qui suit la
   classe, et il se met à jour tout seul.
3. Hors ligne, il faut publier un port et diffuser l'IP de sortie —
   `ip route get 1.1.1.1` l'affiche.
4. **Vérifiez que les postes ont Docker** : `docker run --rm hello-world`.
5. **Testez la mission 1 sur un poste étudiant.** C'est le parcours que tout le
   monde suit en premier, et le seul qui ne marche pas chez soi.

### Deux pièges connus

| Symptôme | Cause | Solution |
|---|---|---|
| `Bind for 0.0.0.0:8080 failed` | missions 12-15, ports 8080/8081/8082/9090 : deux élèves sur le même poste | un poste par élève |
| `Conflict. The container name "/…" is already in use` | un essai interrompu a laissé le conteneur | les commandes sont rejouables, le `docker rm` en tête les gère |

### Pendant le TP

`/admin` affiche en direct :

- **Une ligne par élève, triée alphabétiquement** — où il en est, son autonomie,
  sa compréhension, son niveau, le nombre d'indices qu'il a pris
- **Le poste (IP)**, pour retrouver la machine d'un élève bloqué
- **Les quêtes sur lesquelles des élèves sont restés bloqués juste avant** — la
  réponse à « où ça coince »
- **Inscription rapide** — pour les retards, sans passer par l'écran de jeu
- **Le journal**, y compris les refus de mot de passe

La projection pour l'enseignant était sur la page d'accueil. Elle n'y est plus,
pour deux raisons : elle ne peut pas rester publique — elle liste toute la
classe avec les adresses IP — et elle était déjà à moitié morte, le tableau de
classe dépendant d'`/api/overview`, fermée le jour où l'administration a été
verrouillée. La page d'accueil affichait donc un toast d'erreur à chaque élève,
à chaque séance.

La colonne IP sert à retrouver un poste : quand un élève bloque et que vous ne
savez plus sur quelle machine il est, la liste vous y renvoie. Ce n'est pas une
surveillance — seule l'adresse est mémorisée, jamais ce que l'étudiant fait.

### En ligne de commande

Tout le jeu se joue aussi au terminal, sans navigateur. Le mémento est dans
l'application (bouton `?`), avec le jeton déjà rempli.

```bash
# S'inscrire (compétitif)
curl -X POST https://atelierdocker.laurans.org/api/register \
  -H "Content-Type: application/json" \
  -d '{"team":"CyberPhoenix","mode":"competitive"}'

# Récupérer le mot de passe de la mission 1, depuis un conteneur
docker run --rm alpine sh -c "wget -qO- https://atelierdocker.laurans.org/api/secret/m1-01-image-ou-conteneur/raw?t=dq_..."

# Le valider
curl -X POST https://atelierdocker.laurans.org/api/submit \
  -H "Content-Type: application/json" \
  -H "X-Arena-Token: dq_..." \
  -d '{"flag":"FLAG{...}"}'
```

### Après le TP

Tout se fait depuis **https://atelierdocker.laurans.org/admin** : la classe
complète avec les adresses IP, la remise à zéro, le changement de mode, les
validations en attente, et le journal. Le mot de passe est celui du `.env`.

En ligne de commande, pour un script :

```bash
# Le mot de passe, une fois
export ATELIER_ADMIN_KEY=$(grep ATELIER_ADMIN_KEY /app/atelierdocker/.env | cut -d= -f2-)
AUTH=(-H "X-Arena-Admin: $ATELIER_ADMIN_KEY")

# Remettre un joueur à zéro (oubli de token, réinscription).
# La confirmation est obligatoire : sans elle le serveur refuse.
curl -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"confirm":"oui"}' \
  https://atelierdocker.laurans.org/api/admin/reset/MonPseudo

# Basculer un joueur de mode — ATTENTION : efface son parcours
curl -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"mode":"competitive"}' \
  https://atelierdocker.laurans.org/api/admin/mode/MonPseudo

# Statistiques : où la classe bloque
curl "${AUTH[@]}" https://atelierdocker.laurans.org/api/stats
```

**`ATELIER_ADMIN_KEY` est un mot de passe, pas une clé d'API.** Il ouvre la page
`/admin`, la vue de classe (`/api/overview`, `/api/live`) et toutes les actions.
Sans lui, l'administration **existe** mais ne répond pas : 401 partout. Et s'il
est vide dans le `.env`, le serveur **refuse de démarrer** — il n'y a plus de
mode « lab ouvert », parce qu'une clé vide sur une URL publique donnait à
quiconque trouve l'adresse la liste de la classe et un bouton pour supprimer
des inscriptions.

Le mot de passe n'est jamais stocké dans le navigateur : il sert à obtenir un
jeton signé, transporté par un cookie `HttpOnly; SameSite=Strict`. Une page du
jeu ne peut pas le lire, et un lien glissé dans une discussion ne peut pas
s'en servir pour supprimer une inscription.

`/api/stats` renvoie les **cinq quêtes sur lesquelles des élèves sont restés
bloqués juste avant** — pas celles qui rapportent le plus de points. C'est le
point à reprendre au tableau au TP suivant.

---

## Attestation : vérifier au lieu de croire

Si vous voulez que la validation soit confirmée par un humain :

```bash
# dans .env
ARENA_ATTESTATION=1
```

Alors un mot de passe correct crée une soumission **en attente** : la quête
n'est pas acquise, le joueur n'avance pas, et le message le lui dit
explicitement. Vous apposez votre validation depuis :

```bash
AUTH=(-H "X-Arena-Admin: $ATELIER_ADMIN_KEY")
curl "${AUTH[@]}" https://atelierdocker.laurans.org/api/admin/pending
curl -X POST "${AUTH[@]}" \
  https://atelierdocker.laurans.org/api/admin/attest/MonPseudo/m5-04-port-master
```

Sur l'écran `/admin`, ces deux appels sont un bouton : la section « Validations
en attente » n'apparaît que s'il y en a.

C'est la seule façon, sans agent sur le poste, de rendre la soumission de flag
non autodéclarative. Le mode par défaut reste désactivé pour rester
autonome, comme dans le cahier des charges.

---

## Sécurité — à lire avant d'ouvrir le portail

Le portail est conçu pour **une salle de TP**. Il est aujourd'hui accessible
sur Internet, ce qui change trois choses par rapport à un portail de classe.

- **Un secret par élève, si vous le demandez.** L'inscription renvoie un `token`
  stocké dans `localStorage`. **Sans secret, le pseudo est une clé publique** :
  n'importe qui le tape et récupère la session avec la progression. Avec un
  secret, le pseudo ne se reprend qu'avec le bon secret — c'est ce qui permet à
  un élève de retrouver sa place après un rechargement, sur un autre poste.

  Le champ est visible dans les deux modes depuis la V2 : il n'existait qu'en
  Challenge, et un élève Sans stress se retrouvait avec « ressaisis le
  secret » sous les yeux et aucun champ à saisir. **Exigez-le en salle**, et
  dites aux élèves de le noter.
- **L'administration est fermée, vraiment.** `ATELIER_ADMIN_KEY` — le mot de
  passe du `.env` — ouvre `/admin`, la vue de classe et toutes les actions.
  Trois garanties, dans l'ordre d'importance :

  | ce qui est garanti | comment |
  |---|---|
  | on ne démarre pas sans mot de passe | `start()` quitte avec le code 1, le compose et le healthcheck échouent |
  | rien n'est servi sans jeton valide | `requireAdmin` : cookie signé, ou en-tête pour `curl` |
  | le mot de passe ne reste pas dans le navigateur | cookie `HttpOnly; SameSite=Strict`, jeton valable une journée |

  Le `SameSite=Strict` ferme la porte au CSV : un lien glissé dans une
  discussion ne peut pas appeler `/api/admin/delete/:pseudo` avec la session de
  l'enseignant. Le `HttpOnly` veut dire qu'une faille XSS sur `/` ne donne pas
  l'administration — une page du jeu ne peut pas lire le cookie.

  Le mot de passe **en clair dans `X-Arena-Admin`** reste accepté, parce que
  `curl` ne gère pas les cookies. Il voyage alors sur la même connexion TLS que
  le reste : c'est le prix de l'en-tête, et la raison pour laquelle l'écran
  existe.
- **Plafonds de débit en place**, par IP et par route, sur une fenêtre d'une
  minute : 12 inscriptions, 40 soumissions, 120 lectures du programme,
  300 flux live. Un `X-Forwarded-For` forgé n'aide pas : l'en-tête n'est lu que
  si `ARENA_TRUST_PROXY=1`, c'est-à-dire si un vrai reverse proxy est devant.
  `ARENA_RATE_LIMIT=off` désactive tout (tests automatisés).

  Le flux live est plafonné large exprès : en salle tous les postes partagent
  la même IP, et le navigateur reconnecte tout seul un flux coupé toutes les
  ~3 s. Le client espace ses tentatives lui-même (recul de 1 à 30 s), donc une
  coupure réseau ne transforme pas le poste en boucle de tentatives.

  ⚠️ **Si toutes les VM des élèves sont derrière le NAT de l'établissement**, la
  promotion entière partage un seul compteur. Le plafond de 40/min sur
  `/api/submit` peut renvoyer des `429` à tout le monde en même temps. Trois
  solutions : passer les quotas par jeton plutôt que par IP, monter les valeurs,
  ou `ARENA_RATE_LIMIT=off` puisque le professeur est là. Voir CONTRACTS § 2.6.
- **Le portail ne se connecte jamais au Docker des étudiants.** Il ne lit que
  ce que les étudiants lui envoient : un pseudo et un flag. Aucune commande
  n'est exécutée par le serveur.
- Les codes HTTP et réponses d'erreur sont pensés pour ne rien divulguer sur
  l'état du serveur.

Contre-mesures normales en cas d'exposition :

```bash
echo "ATELIER_ADMIN_KEY=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)" >> .env
docker compose up -d
```

---

## Vérifications automatiques

`.github/workflows/verifications.yml` lance, à chaque push et à chaque demande
de fusion : la suite de tests, la validation du contenu, la construction de
l'image, et le démarrage réel de ce qui vient d'être construit.

Un second job, sur `main` seulement, rejoue **les 27 commandes de récupération
de mot de passe** contre le portail de production. C'est le seul contrôle qui
prouve que le jeu marche sur une vraie machine — et il avait.attrapé un bug que
les tests unitaires ne pouvaient pas voir, parce qu'ils ne lancent pas Docker.

---

## Développement

```bash
npm install          # une seule dépendance : express
npm start            # http://localhost:8000
npm test             # 208 tests
npm run dev          # rechargement à chaud
npm run check-content # valide que le contenu est chargeable
npm run smoke        # joue les 27 missions, affiche la maîtrise
npm run check-fetchhints        # REJOUE les 27 commandes (demande Docker)
npm run nettoie-verif          # purge les joueurs de vérification du portail
```

> **`npm run check-fetchhints` est le seul test qui prouve que le jeu marche
> sur une vraie machine.** Il crée un joueur, exécute la commande de
> récupération de chacune des 27 missions dans un conteneur jetable, et
> affiche le temps de chacune. Il supprime son joueur en sortant, même en cas
> d'échec. Lancez-le sur un **poste étudiant** avant un TP — c'est là que ça
> échoue, pas sur le serveur.
>
> Contre un portail déployé, il faut `ATELIER_ADMIN_KEY` pour que le ménage
> passe : sans la clé, le script vous le dit plutôt que de laisser un joueur
> fantôme dans le menu de suivi de l'enseignant.

### Ajouter une mission

1. Éditez le fichier du module (`content/quests/m<N>.js`).
2. Respectez `docs/CONTRACTS.md` § 1 : `charge.autonomy` doit avoir autant
   d'entrées que `hints` et finir à 0, chaque `check` a besoin d'une
   `explanation`, chaque `recall` d'un `hint`.
3. `node scripts/check-content.js && npm test`

Le serveur **refuse de démarrer** si le contenu est incohérent : flag dupliqué,
`order` en doublon, dernier indice payant, HTML glissé dans un énoncé, réponse
recopiée de l'énoncé. L'erreur dit précisément quoi corriger.

### Le format des quêtes

Le contenu est entièrement écrit dans le format de la V2 : chaque quête porte
des questions de compréhension, un `charge` dont le dernier indice est gratuit,
et une justification pour chaque question. `test/format.test.js` le vérifie sur
les 27 quêtes — c'est lui qui dira, plus tard, si une nouvelle quête sort de la
norme.

Les règles qu'il faut tenir en écrivant, et qui viennent toutes de l'atelier 1 :

**1. Aucun artefact mort.** Chaque commande sert la mission suivante. L'atelier 1
diagnostique la machine, le 2 installe Docker, le 3 vérifie qu'il répond, le 4
diagnostique l'échec le plus courant. Rien n'y est là pour « faire une
commande ».

**2. Aucun `recall` quand la commande est déjà dans l'énoncé.** Le réflexe ne
vaut que si l'élève doit *retrouver*. Il y en a **deux** sur les vingt-sept
quêtes : la lettre « all » à l'atelier 1, et le nom du fichier que
`docker commit` n'écrit jamais à l'atelier 5. Partout ailleurs, la commande est
donnée et le QCM porte la vérification. Le validateur refuse d'ailleurs un
`recall` dont la réponse figure dans le brief, et il a raison.

**3. Le mot de passe se récupère sans rien supposer.** Ni réseau, ni volume, ni
image à construire : la commande ne dépend que de Docker et d'Internet. Les deux
premières quêtes utilisent `curl`, parce que Docker n'existe pas encore sur la
machine à ce moment-là.

### Structure

```
content/quests/m*.js    missions (données, aucune logique)
src/
  server.js             application Express
  questpack.js          chargement + validation du contenu
  mastery.js            les trois ratios et les paliers
  progress.js           validation d'une mission, écriture des faits
  portal.js             état de la classe + flux SSE (derrière le mot de passe)
  admin_session.js      mot de passe, jeton signé, cookie de session
  routes/api.js         parcours et soumission — le jeu, rien d'autre
  routes/atelier.js     indice, compréhension, réflexe
  routes/admin.js       tout ce qui est fermé, plus la vue de classe
  repo/arena.js         accès SQLite (joueurs, validations)
  repo/progress_repo.js indices consommés, tentatives
public/                 le jeu et /admin (vanilla, sans dépendance)
test/                   208 tests : format du contenu, maîtrise, migration,
                        règles Markdown, gitignore, synchronisation des scripts,
                        API, routage, rendu des QCM et de /admin,
                        administration, contrat, invariants, qualité du contenu
docs/CONTRACTS.md       contrat de données et d'API
```

Le contenu est séparé de la logique : ajouter ou retoucher des missions ne
touche jamais le code.

### Choix techniques

- **Zéro dépendance native.** La base utilise `node:sqlite`, le module natif de
  Node (stable depuis Node 24). Pas de `better-sqlite3`, donc pas de
  compilation C++ dans l'image : `docker build` fonctionne partout, et le code
  de la version published ici tourne sur Node 22 à 26.
- **Zéro dépendance front.** Pas de CDN, pas de framework, pas de webfont. Le
  jeu fonctionne sur un réseau de TP coupé d'Internet.
- **Pas de rechargement de page.** L'écran d'administration reçoit `overview` par
  SSE à chaque validation. Le cahier des charges rafraîchissait toutes les 4 s.
- **Markdown rendu par construction DOM.** Le contenu pédagogique n'est jamais
  interprété comme du HTML.

---

## Différences avec le cahier des charges

| Point | PDF d'origine | Ici | Pourquoi |
|---|---|---|---|
| Périmètre | 6 missions | 27 en 7 ateliers | demande « parcours complet » |
| Base | Python en mémoire, perdue au redémarrage | SQLite sur volume | les mesures survivent |
| Portail | rechargement toutes les 4 s | SSE, mise à jour instantanée | réactivité |
| Notation | points, podium, bonus de rapidité | **maîtrise** : progression, autonomie, compréhension | le score mesurait la promotion, pas l'élève |
| Classement | podium par mission | **aucun** | on ne classe pas des élèves |
| Aides | indices gratuits | **indices payants**, le dernier gratuit | l'autonomie devient mesurable |
| Compréhension | non vérifiée | QCM bloquant au premier coup + réflexe | on vérifie ce qui est compris |
| Inscription | pseudo + mode | pseudo + mode + secret + token | personne ne peut voler la session d'un autre |
| API | `/api/register`, `/api/submit`, `/api/overview` | identiques **+** extensions | compatibilité conservée |
| Anti-triche | aucune | mode attestation optionnel | le PDF permet de valider sans rien faire |
| Mise en ligne | locale | **https** derrière Caddy, multi-arche | plus de `http://…:8000` à retenir |

Les trois routes du PDF répondent toujours dans la même forme. Un client
construit sur le cahier des charges continue de fonctionner.

---

## Licence

MIT. Le contenu pédagogique est librement adaptable à vos cours.