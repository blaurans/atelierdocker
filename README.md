# 🐳 Docker Ops Race — The Container Arena

Serious game d'apprentissage de Docker **pour des étudiants qui n'ont jamais
tapé une commande Docker**. 7 modules, 26 quêtes, deux modes au choix dès
l'inscription.

Reprise du cahier des charges *Docker Ops Race : The Container Arena*
(6 missions, portail dual-mode, barème 100 → 600 + bonus de podium) **étendue à
7 modules et 26 quêtes**, et portée d'une base Python en mémoire à un portail
Node + SQLite conteneurisé et persistant.

---

## Démarrage en deux commandes

```bash
docker compose up -d --build
```

Puis, sur chaque poste étudiant : **http://<IP_DU_SERVEUR>:8000**

Pour déplacer le jeu ailleurs : copiez ce dossier (avec son `Dockerfile` et son
`docker-compose.yml`) et lancez la même commande. Aucun host, aucun NFS, aucune
base à installer. Les scores vivent dans un volume Docker nommé.

---

## Ce que fait l'étudiant

Il choisit un mode, puis joue les missions sur **son propre Docker**, en
tapant les commandes dans son terminal habituel. Le portail ne fait que
valider.

### Aucun verrou, dans les deux modes

Les 26 missions sont accessibles dès la première seconde. Un étudiant bloqué
sur la mission 7 peut lire la 12, consulter une correction antérieure, ou
attaquer directement le boss final. **Vous validez dans l'ordre que vous voulez.**

Le bandeau « Par où continuer » au programme propose une suite, mais n'oblige
à rien. Les points de base sont identiques quel que soit l'ordre de validation :
seul le bonus de podium récompense ceux qui arrivent en premier sur une mission
donnée, ce qui est précisément l'effet recherché.

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

|  | ⚡ Mode Compétitif | 🧘 Mode Normal |
|---|---|---|
| Chrono | oui, par mission | **aucun** |
| Score | 25 à 600 pts par mission, cumul **2 800 pts** | **aucun** |
| Classement | podium en direct, bonus de rapidité | tableau d'émargement |
| Statut affiché | rang et score | « En cours » / « Achevé ✅ » |

Les deux modes partagent **exactement le même contenu** : mêmes missions,
même ordre, mêmes indices. Un binôme qui veut la paix choisit le mode normal et
n'est pas pénalisé. Un binôme qui veut la course choisit le compétitif et peut
gagner le podium.

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

Le mot de passe de chaque mission est **affiché dans l'énoncé**. Ce n'est pas un
secret : c'est un **jeton de progression**. L'énoncé le dit explicitement, pour
que personne ne croie devoir le deviner.

Le flux d'une mission :

```bash
docker run --rm -p 8080:80 --name arena-web nginx:alpine
docker exec arena-web sh -c "echo 'FLAG{PORT_MAPPING_WEB_EXPERT_8080}' > /usr/share/nginx/html/index.html"
curl http://localhost:8080
```

Puis, dans l'onglet du jeu ou en `curl` :

```bash
curl -X POST http://<IP>:8000/api/submit \
  -H "Content-Type: application/json" \
  -H "X-Arena-Token: dq_..." \
  -d '{"flag":"FLAG{PORT_MAPPING_WEB_EXPERT_8080}"}'
```

**Honnêteté sur la triche.** Un flag saisi à la main ne prouve rien sur le
travail réellement effectué : un étudiant peut valider les 26 missions sans avoir
lancé un seul conteneur. Le jeu ne prétend pas le contraire. Deux garde-fous
sont fournis si vous voulez durcir l'évaluation — voir § *Attestation*.

Dans 14 missions sur 26, le flag est de surcroît **découvert par une
manipulation réelle** : un fichier écrit puis relu depuis un autre conteneur,
une page réellement servie par nginx, une variable d'environnement normalisée
par `docker compose config`. L'étudiant qui n'a pas fait le travail ne trouve
rien à copier.

---

## Le barème

```
points d'une mission  =  base (25 à 600)
                       + 60   si 1ᵉʳ à la valider (mode compétitif)
                       + 30   si 2ᵉ
                       + 15   si 3ᵉ
                       + jusqu'à 25 % de la base si validée plus vite que le temps prévu
                       − 5    par faux flag soumis
```

La base vient du cahier des charges. Les deux derniers termes ont été ajoutés
parce que la commande du projet est explicite : *« le temps et la qualité
comptent pour un score »*.

Le score n'est **jamais incrémenté** : il est recalculé depuis l'historique à
chaque validation (`src/progress.js`). Aucun dérive possible, et un barème
modifié se répercute proprement.

Classement : score décroissant, puis nombre de missions, puis heure de fin. Les
égalités parfaites partagent le même rang.

**En mode normal, le score n'est jamais calculé et le temps n'est jamais
renvoyé par l'API** — pas masqué à l'affichage, absent de la réponse.

---

## Prérequis côté étudiant

Docker doit tourner sur le poste. C'est la seule condition.

- Linux :Docker Engine
- Windows / macOS : Docker Desktop, ou Docker Engine via WSL2
- Rien d'autre : pas de plugin, pas d'agent, pas de configuration du portail

Le PDF prévoyait trois architectures (postes locaux, VMs, serveur partagé).
Celle-ci est l'**Option A** : postes locaux. Zéro collision de ports, aucune
destruction croisée entre binômes, conditions réelles d'ingénierie.

---

## Guide de l'enseignant

### Avant le TP

1. `docker compose up -d --build` sur votre machine ou votre NAS.
2. Notez l'IP que les étudiants doivent viser.
3. Projetez `http://<IP>:8000` : c'est le portail, il se met à jour tout seul.
4. Vérifiez que les postes ont Docker (`docker run hello-world`).

### Pendant le TP

Le portail affiche en direct :

- **Ligue Compétitive** — podium 🥇🥈🥉, score, progression mission par mission
- **Mode Normal** — liste d'émargement avec statut « En cours » / « Achevé ✅ »
- **Inscription rapide** — pour les retards, sans passer par le jeu

### Après le TP

```bash
# Remettre un joueur à zéro (oubli de token, binôme réinscrit)
curl -X POST http://localhost:8000/api/admin/reset/CyberPhoenix

# Basculer un joueur du mode normal au compétitif
curl -X POST http://localhost:8000/api/admin/mode/Alice_Bob \
  -H "Content-Type: application/json" -d '{"mode":"competitive"}'

# Statistiques : où la classe bloque
curl http://localhost:8000/api/stats
```

`/api/stats` renvoie les **cinq missions les plus redoutées** (celles où le
plus d'étudiants sont bloqués à l'étape précédente). C'est le point à
reprendre au tableau au TP suivant.

---

## Attestation : vérifier au lieu de croire

Si vous voulez que la validation soit confirmée par un humain :

```bash
# dans .env
ARENA_ATTESTATION=1
```

Alors un flag correct crée une soumission **en attente** : le score n'est pas
attribué, le joueur n'avance pas. Vous apposez votre validation depuis :

```bash
curl http://localhost:8000/api/admin/pending
curl -X POST http://localhost:8000/api/admin/attest/CyberPhoenix/m4-04-port-master
```

C'est la seule façon, sans agent sur le poste, de rendre la soumission de flag
non autodéclarative. Le mode par défaut reste désactivé pour rester
autonome, comme dans le cahier des charges.

---

## Sécurité — à lire avant d'ouvrir le portail

Le portail est conçu pour **une salle de TP**, pas pour Internet.

- **Pas de mot de passe.** L'inscription renvoie un `token` stocké en
  `localStorage`. Si un secret est fourni, le pseudo est protégé ; sinon,
  quiconque se connecte avec le même pseudo reprend le score. **Activez
  `ARENA_ADMIN_KEY` et exigez un secret en salle.**
- **L'administration est ouverte par défaut** (`ADMIN_KEY` vide). Tout
  utilisateur atteignable peut appeler `/api/admin/*`. À fermer en fin de TP, ou
  dès que le portail sort du réseau de la classe.
- **Plafonds de débit en place**, par IP et par route, sur une fenêtre d'une
  minute : 12 inscriptions, 40 soumissions, 120 lectures du programme,
  300 flux live. Un `X-Forwarded-For` forgé n'aide pas : l'en-tête n'est lu que
  si `ARENA_TRUST_PROXY=1`, c'est-à-dire si un vrai reverse proxy est devant.
  `ARENA_RATE_LIMIT=off` désactive tout (tests automatisés).

  Le flux live est plafonné large exprès : en salle tous les postes partagent
  la même IP, et le navigateur reconnecte tout seul un flux coupé toutes les
  ~3 s. Le client espace ses tentatives lui-même (recul de 1 à 30 s), donc une
  coupure réseau ne transforme pas le poste en boucle de tentatives.
- **Le portail ne se connecte jamais au Docker des étudiants.** Il ne lit que
  ce que les étudiants lui envoient : un pseudo et un flag. Aucune commande
  n'est exécutée par le serveur.
- Les codes HTTP et réponses d'erreur sont pensés pour ne rien divulguer sur
  l'état du serveur.

Contre-mesures normales en cas d'exposition :

```bash
echo "ARENA_ADMIN_KEY=$(openssl rand -hex 16)" >> .env
docker compose up -d
```

---

## Développement

```bash
npm install          # une seule dépendance : express
npm start            # http://localhost:8000
npm test                  # 90 tests
npm run dev               # rechargement à chaud
npm run check-content     # valide que le contenu est chargeable
npm run smoke -- http://localhost:8000   # joue les 26 missions et affiche le barème
```

### Ajouter une mission

1. Éditez le fichier du module (`content/quests/m<N>.js`).
2. Gardez l'invariant du barème : une mission dont les points sont un multiple
   de 100 est une « mission phare » et doit être **la dernière** du module. La
   somme des points du module doit faire un multiple de 100.
3. `node scripts/check-content.js && npm test`

Le serveur **refuse de démarrer** si le contenu est incohérent : flag dupliqué,
`order` en doublon, somme de points non multiple de 100, HTML glissé dans un
énoncé. L'erreur dit précisément quoi corriger.

### Structure

```
content/quests/m*.js    missions (données, aucune logique)
src/
  server.js             application Express
  questpack.js          chargement + validation du contenu
  scoring.js            barème, bonus, classement
  progress.js           validation d'une mission, recalcul du score
  portal.js             état du portail + flux SSE
  repo/arena.js         accès SQLite
public/                 portail + jeu (vanilla, sans dépendance)
test/                   90 tests : barème, API, rendu, contrat, invariants,
                        qualité du contenu, plafonds de débit
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
- **Pas de rechargement de page.** Le portail reçoit `overview` par SSE à
  chaque validation. Le cahier des charges rafraîchissait toutes les 4 s.
- **Markdown rendu par construction DOM.** Le contenu pédagogique n'est jamais
  interprété comme du HTML.

---

## Différences avec le cahier des charges

| Point | PDF d'origine | Ici | Pourquoi |
|---|---|---|---|
| Périmètre | 6 missions | 26 en 7 modules | demande « parcours complet » |
| Base | Python en mémoire, perdue au redémarrage | SQLite sur volume | les scores survivent |
| Portail | rechargement toutes les 4 s | SSE, mise à jour instantanée | réactivité |
| Compteur d'erreurs | inexistant | −5 pts par faux flag | « la qualité compte » |
| Bonus de rapidité | 60/30/15 seuls | + jusqu'à 25 % sur le temps | « le temps compte » |
| Inscription | pseudo + mode | pseudo + mode + secret + token | un binôme ne peut pas voler le score d'un autre |
| API | `/api/register`, `/api/submit`, `/api/overview` | identiques **+** extensions | compatibilité conservée |
| Anti-triche | aucune | mode attestation optionnel | le PDF permet de valider sans rien faire |
| Préalables | Python + pip au runtime | conteneur | déplacement en une commande |

Les trois routes du PDF répondent toujours dans la même forme. Un client
construit sur le cahier des charges continue de fonctionner.

---

## Licence

MIT. Le contenu pédagogique est librement adaptable à vos cours.