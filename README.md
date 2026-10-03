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
  "http://<IP>:8000/api/secret/m4-04-port-master/raw?t=dq_..."
curl -s http://SERVER_IP:8080
```

Le mot de passe arrive **par le port publié** : la mission n'est validée que si
le réseau fait réellement son travail.

Trois conséquences :

- **il est différent pour chaque équipe** — le communiquer à un autre binôme
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

### Ce que voit l'étudiant

Le jeu tient en trois zones. Rien n'est caché, mais tout n'est pas évident au
premier coup d'œil.

**L'en-tête** — son nom d'équipe, son mode, l'heure d'inscription, et une
pastille violette `🔑 dq_a1b2c3…` : c'est son jeton d'API. **Un clic le copie**
dans le presse-papiers, ce qui évite de le retaper dans une commande `curl`.
Le jeton est tronqué à l'affichage : sur un vidéoprojecteur, on ne laisse pas
traîner les identifiants en clair.

**Le plan, à gauche** — les 7 modules et les 26 missions, avec le compteur de
progression. Une mission validée porte un ✅, la suivante à faire est signalée
en haut par un encadré « Par où continuer ». Toutes les missions sont
accessibles : rien n'est verrouillé.

**La mission, à droite** — l'énoncé, les mots-clés travaillés, les indices
(cliqués un par un, du plus flou au plus direct), le point de contrôle, puis le
formulaire de validation.

### Valider une mission

Le formulaire comporte deux étapes numérotées, dans cet ordre :

1. **« Va chercher ton mot de passe »** — un bloc de commande, avec un bouton
   `📋 copier la commande` à côté. La commande fait trois lignes et contient un
   jeton de 40 caractères : la recopier à la main depuis un affichage est le
   meilleur moyen de se tromper d'un caractère et de ne jamais comprendre
   pourquoi. **copiez-la.**
2. **« Colle-le ici »** — le champ de saisie, puis `Valider la mission`.

Le mot de passe s'affiche alors avec son détail : points de base, bonus de
podium, bonus de rapidité, malus pour faux flag.

> **Attention**, la mission 1 demande de lancer un conteneur. Si l'étudiant
> colle le mot de passe sans avoir lancé la commande, il obtient `401` ou
> `invalid`. C'est normal : le mot de passe est **le résultat** de la commande,
> il n'existe pas autrement.

### Avant le TP

1. `docker compose up -d --build` sur votre machine ou votre NAS.
2. Notez l'IP que les étudiants doivent viser — `ip route get 1.1.1.1` affiche
   l'IP de sortie, c'est celle à diffuser.
3. Projetez `http://<IP>:8000` : c'est le portail, il se met à jour tout seul.
4. **Vérifiez que les postes ont Docker** : `docker run --rm hello-world`.
5. **Testez la mission 1 sur un poste étudiant.** C'est le parcours que tout le
   monde suit en premier, et le seul qui ne marche pas chez soi.

### Deux pièges connus

| Symptôme | Cause | Solution |
|---|---|---|
| `Bind for 0.0.0.0:8080 failed` | missions 12-15, ports 8080/8081/8082/9090 : deux binômes sur le même poste | un poste par binôme |
| `Conflict. The container name "/…" is already in use` | un essai interrompu a laissé le conteneur | les commandes sont rejouables, le `docker rm` en tête les gère |

### Pendant le TP

Le portail affiche en direct :

- **Ligue Compétitive** — podium 🥇🥈🥉, score, progression mission par mission
- **Mode Normal** — liste d'émargement avec statut « En cours » / « Achevé ✅ »,
  et **le poste (IP) du dernier appel** de chaque binôme
- **Inscription rapide** — pour les retards, sans passer par le jeu

La colonne IP sert à retrouver un poste : quand un binôme bloque et que vous ne
savez plus sur quelle machine il est, la liste vous y renvoie. Ce n'est pas une
surveillance — seule l'adresse est mémorisée, jamais ce que l'étudiant fait.

### En ligne de commande

Tout le jeu se joue aussi au terminal, sans navigateur. Le mémento est dans
l'application (bouton `?`), avec le jeton déjà rempli.

```bash
# S'inscrire (compétitif)
curl -X POST http://<IP>:8000/api/register \
  -H "Content-Type: application/json" \
  -d '{"team":"CyberPhoenix","mode":"competitive"}'

# Récupérer le mot de passe de la mission 1, depuis un conteneur
docker run --rm alpine sh -c "wget -qO- http://<IP>:8000/api/secret/m1-01-image-ou-conteneur/raw?t=dq_..."

# Le valider
curl -X POST http://<IP>:8000/api/submit \
  -H "Content-Type: application/json" \
  -H "X-Arena-Token: dq_..." \
  -d '{"flag":"FLAG{...}"}'
```

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
npm run smoke -- http://localhost:8000        # joue les 26 missions, affiche le barème
npm run check-fetchhints -- http://<IP>:8000 # REJOUE les 26 commandes pour de vrai
```

> **`npm run check-fetchhints` est le seul test qui prouve que le jeu marche
> sur une vraie machine.** Il crée un joueur, exécute la commande de
> récupération de chacune des 26 missions dans un conteneur jetable, et
> affiche le temps de chacune. Lancez-le sur un **poste étudiant** avant un
> TP — c'est là que ça échoue, pas sur le serveur.
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