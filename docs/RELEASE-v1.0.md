# Atelier Docker — v1.0

Première version stable d'**Atelier Docker**. 27 quêtes, 7 ateliers, 211 tests,
déployée sur `https://atelierdocker.laurans.org`.

Successeur de [Docker Ops Race](https://github.com/blaurans/seriousdocker) (`blaurans/seriousdocker`,
gelé sur `v1.0.0`), qui reste en maintenance. Cette version en reprend les
commandes mais en change ce qui compte : plus de score, plus de classement, des
indices qui coûtent, et une compréhension vérifiée.

---

## Ce que c'est

Un serious game d'apprentissage de Docker, pour des étudiants qui n'ont jamais
tapé une commande Docker. Chaque élève a sa VM Ubuntu Server vierge, travaille
**seul**, et tape ses commandes dans son propre terminal. Le portail ne fait que
valider : il ne se connecte jamais au Docker des élèves, et n'exécute aucune
commande à leur place.

**7 ateliers · 27 quêtes · ~7 h de contenu indicatif (413 min) · 81 indices ·
70 questions de compréhension · 2 réflexes.**

### Le fil rouge

La librairie Verdi quitte son vieux serveur. Chaque atelier est une étape de la
migration, et **chaque artefact sert l'étape suivante** : l'atelier 1
diagnostique la machine, le 2 installe Docker, le 3 vérifie qu'il répond, le 4
diagnostique l'échec le plus courant. Rien n'est là pour « faire une
commande ».

### Les deux modes

| | **Challenge** (`competitive`) | **Sans stress** (`normal`) |
|---|---|---|
| Indices | les deux premiers coûtent de l'autonomie | tous gratuits |
| Dernier indice | toujours gratuit | toujours gratuit |
| Temps affiché | oui, pour l'élève | non |
| Contenu | **identique** — mêmes quêtes, mêmes questions, mêmes indices | idem |

Les valeurs d'API restent `competitive` / `normal` : les élèves s'inscrivent en
ligne de commande avec `{"mode":"competitive"}`. Ce que l'écran affiche est
« Challenge » et « Sans stress » (`MODE_LABELS`, `src/config.js`).

### Ce qui remplace le score

Trois mesures, sur un seul élève, **aucune comparable à celle d'un camarade** :

| mesure | formule |
|---|---|
| progression | quêtes validées / 27 |
| autonomie | validées sans indice payé / validées |
| compréhension | validées avec QCM réussis / validées |

Le niveau exige **deux seuils** — autonomie *et* avancement — sinon un élève
qui réussit sa première quête sans indice (100 % d'autonomie) verrait «
Maîtrise » s'afficher à 4 % du jeu. Cinq paliers, de « Debout dans le
conteneur » à « Maîtrise » (`src/mastery.js`, CONTRACTS § 3).

**Pas de classement, pas de podium, pas de score.** C'est un choix, et il a un
prix : le portail perd son classement en direct, qui était son effet le plus
spectaculaire. Ce qu'il gagne est une vue qui répond à la seule question utile
pendant une séance — *qui est bloqué, et où*.

---

## Le mot de passe n'est jamais dans l'énoncé

C'est la règle structurante du contenu. Chaque quête fournit la commande qui va
le chercher, et cette commande utilise **la technique même que le module
enseigne** :

| atelier | comment on récupère le mot de passe |
|---|---|
| 1 | `cat` d'un fichier système dans un conteneur (puis `curl` — Docker n'existe pas encore) |
| 2 | la sortie d'un `docker run` |
| 3 | `docker exec` / `docker cp` dans un conteneur en marche |
| 4 | la réponse HTTP d'un port publié |
| 5 | la sortie d'un conteneur construit par ses soins |
| 6 | un volume relu par un second conteneur |
| 7 | les journaux de la pile Compose |

Le mot de passe est dérivé du jeton du joueur : deux équipes ne l'ont jamais
identique, et le partager entre élèves ne prouve rien. Le validateur refuse un
`brief` qui contient le flag, qui promet qu'il est affiché, ou qui demande une
réponse écrite sans champ pour la saisir.

---

## Contenu détaillé

| # | atelier | quêtes | points (vestige) |
|---|---|---|---|
| 1–4 | Préparer le terrain 🔧 | diagnostiquer la machine · installer Docker · premier conteneur · le service ne tourne pas | 100 |
| 5–8 | Récupérer et lancer 📦 | télécharger une image · conteneur jetable · anatomie d'une image · initial boot | 200 |
| 9–12 | Régler en service ⚙️ | ports et variables · modifier un conteneur · le cycle de vie · le conteneur est isolé | 300 |
| 13–16 | Faire les se parler 🌐 | le réseau par défaut · publier un port · se parler par son nom · deux services | 400 |
| 17–20 | Figer la version 📄 | le raccourci qu'on oublie · écrire le Dockerfile · CMD et ENTRYPOINT · la méthode de la librairie | 500 |
| 21–24 | Ne rien perdre 💾 | tout disparaît · le dossier partagé · qui écrit ces fichiers · le volume de Docker | 600 |
| 25–27 | Décrire la pile 📚 | un seul fichier · piloter la pile · récupérer une pile entière | 700 |

La colonne « points » est un **vestige** : plus rien ne le lit. Les invariants
arithmétiques sont maintenus pour que le contenu se charge sans réécriture
(CONTRACTS § 1.4). Un module vaut une heure en TP, cible 60 min, borne dure 90.

### Les sept ateliers

1. **Préparer le terrain** — `cat /etc/os-release`, `uname -m`, `free -h`,
   `df -h`, installation de Docker (paquets Ubuntu, Docker Official
   Repository), groupe `docker`, `docker --version`, `hello-world`.
2. **Récupérer et lancer** — `docker pull`, `docker run --rm`, couches d'une
   image (`docker history`, `docker image inspect`), tags, `ENTRYPOINT` par
   défaut d'une image.
3. **Régler en service** — `-p` et `-e`, `docker exec` / `-it`, `docker cp`,
   `docker ps -a`, `docker start/stop/kill/rm`, isolation (un conteneur ne voit
   pas l'hôte).
4. **Faire les se parler** — `docker network ls`, `--network`, `-p` réel,
   résolution par nom de service sur un réseau utilisateur, `docker network
   connect`.
5. **Figer la version** — `docker commit`, `docker rmi` et le caractère
   **non reproductible** d'une image ainsi construite ; puis le `Dockerfile`
   (`FROM`, `COPY`, répertoire de contexte, `docker build`) ; `CMD` vs
   `ENTRYPOINT` (forme exec, forme shell, PID 1) ; et la méthode de la
   librairie — la chaîne de reconstruction, `docker tag`.
6. **Ne rien perdre** — le système de fichiers d'un conteneur est éphémère ;
   le bind mount (`-v`, qui rend le dossier à la machine hôte) ; qui écrit le
   fichier et avec quelles permissions (`--user`, uid, gid, et pourquoi un
   `chown` ne suffit pas) ; puis les volumes Docker (`create`, `ls`,
   `inspect`, `rm`, `prune`).
7. **Décrire la pile** — `docker compose` : un `compose.yaml`, les services qui
   se parlent par nom, `up -d`, `logs`, `down -v`, récupérer une pile entière
   chez soi.

---

## Installation

```bash
git clone https://github.com/blaurans/atelierdocker.git
cd atelierdocker
cp .env.example .env
$EDITOR .env          # ATELIER_ADMIN_KEY est OBLIGATOIRE
docker compose up -d --build
```

Le serveur **refuse de démarrer** sans mot de passe d'administration : le
compose échoue sur `${ATELIER_ADMIN_KEY:?…}` et `src/server.js` quitte avec le
code 1. Il n'y a plus de « lab ouvert ».

### En production, derrière un reverse proxy

Caddy (ounginx) doit joindre le conteneur **par son nom sur le réseau Docker** :

```
atelierdocker.laurans.org {
    reverse_proxy atelier-docker:8000
}
```

`docker-compose.yml` ne publie **aucun port** (`headscale_default`, réseau
externe). Sans la ligne ci-dessus dans le Caddyfile, le portail tourne mais
reste injoignable.

Trois adresses, et c'est tout :

| adresse | pour qui |
|---|---|
| `https://atelierdocker.laurans.org` | **les élèves** — ouvre directement l'écran de choix de mode |
| `https://atelierdocker.laurans.org/#/` | les mêmes, par l'ancienne adresse — elle marche encore |
| `https://atelierdocker.laurans.org/admin` | **l'enseignant** — derrière le mot de passe |

---

## Configuration

| variable | défaut | rôle |
|---|---|---|
| `ATELIER_ADMIN_KEY` | — | **obligatoire.** Le mot de passe de l'administration |
| `ARENA_ATTESTATION` | `0` | `1` = un flag correct reste « en attente » jusqu'à validation manuelle |
| `ARENA_LINEAR` | `0` | `1` = le plan n'ouvre que la mission suivante (guidage d'affichage, **pas** une contrainte serveur) |
| `ARENA_RATE_LIMIT` | `on` | `off` désactive tout plafond — tests automatisés |
| `ATELIER_TRUST_PROXY` | `1` | ne mettre `0` **que** s'il n'y a réellement aucun proxy devant |

À lire en salle, dans la salle des élèves : sans `ARENA_LINEAR`, les 27 missions
sont accessibles dès la première seconde. Un élève bloqué sur la 7 peut aller
lire la 12 et valider dans l'ordre qu'il veut. **Bloquer l'accès est un choix,
pas une aide** — en mode Sans stress, c'est une entrave à l'apprentissage.

---

## Sécurité

Le portail est conçu pour une salle de TP. Il est sur Internet, ce qui change
trois choses.

**L'administration est fermée, vraiment.** Trois garanties, par ordre
d'importance :

| garantie | comment |
|---|---|
| on ne démarre pas sans mot de passe | `start()` sort en 1 ; le compose échoue ; le healthcheck échoue |
| rien n'est servi sans jeton valide | `requireAdmin` : cookie signé HMAC-SHA256, ou en-tête pour `curl` |
| le mot de passe ne reste pas dans le navigateur | cookie `HttpOnly; SameSite=Strict`, valable une journée |

`SameSite=Strict` ferme la porte au CSRF sur `POST /api/admin/delete/:pseudo` :
un lien glissé dans une discussion ne supprime rien. `HttpOnly` veut dire qu'une
faille XSS sur `/` ne donne pas l'administration. La comparaison du mot de passe
se fait sur deux **hachés SHA-256** à préfixe fixe, jamais sur les chaînes :
`timingSafeEqual` lève si les longueurs diffèrent, et la comparaison native
s'arrête au premier octet différent — ce qui donnerait, en mesurant, le nombre
de caractères corrects.

`GET /admin` est servie **sans** mot de passe, et c'est délibéré : la page *est*
le formulaire. Ce qui est protégé, c'est ce qu'elle affiche — la classe, les
adresses IP, les actions — et tout cela part par l'API, qui est fermée.

**Un secret par élève, à exiger en salle.** Sans secret, le pseudo est une clé
publique : n'importe qui le tape et récupère la session avec la progression. Le champ
est visible dans les deux modes. Faites-le noter.

**Plafonds de débit**, par IP, fenêtre d'une minute : 12 inscriptions, 40
soumissions, 120 lectures du programme, 300 flux live. Un `X-Forwarded-For` forgé
n'aide pas : l'en-tête n'est lu que si `ATELIER_TRUST_PROXY=1`.

> ⚠️ Si toutes les VM des élèves sont derrière le NAT de l'établissement, la
> promotion entière partage un compteur, et le plafond de 40/min sur
> `/api/submit` peut renvoyer des `429` à tout le monde en même temps. Le
> professeur est là : `ARENA_RATE_LIMIT=off` est légitime.

**Le portail ne se connecte jamais au Docker des étudiants.**

---

## Vérifications

`.github/workflows/verifications.yml`, à chaque push et chaque demande de
fusion :

| job | ce qu'il prouve |
|---|---|
| `tests` | 211 tests, contenu des 27 quêtes validable, image construite, conteneur qui démarre et sert le programme |
| `commandes` | les **27 commandes de récupération** rejouées contre le portail de production (`main` seulement) |

Le second job est le seul contrôle qui prouve que le jeu marche sur une vraie
machine — il exécute Docker. Il a attrapé un bug que les tests unitaires ne
pouvaient pas voir. Il réessaie sur portail indisponible : un redéploiement a
fait passer vingt-et-une quêtes « cassées » alors qu'elles fonctionnaient.

```bash
npm test                      # 211 tests
npm run check-content         # le contenu est chargeable
npm run smoke                 # joue les 27 quêtes, affiche la maîtrise
npm run check-fetchhints      # REJOUE les 27 commandes — demande Docker
npm run nettoie-verif         # purge les joueurs de vérification
```

---

## Ce qui a été corrigé avant cette version

Onze défauts trouvés en jouant réellement le jeu, dont cinq impossibles à voir
depuis les tests unitaires :

| symptôme | cause |
|---|---|
| le bouton d'indice ne s'activait jamais | il naissait `disabled`, et c'était **sa propre réponse** qui devait l'activer — un verrouillage |
| le bilan de validation ne s'affichait pas | écrit dans `#submitMsg`, qui n'existe plus pour une quête validée |
| « NaN pts » / « undefined pts » | le port du tableau de classe s'appuyait sur des champs supprimés |
| le portail enseignant plantait | il lisait `{competitive, normal}` là où la structure était `{players}` |
| les indices étaient facturés en Sans stress | l'annulation du prix n'était appliquée qu'à un seul point du chemin |
| `401` sur la commande de récupération de l'énoncé | la substitution `SERVER_IP` / `$ARENA_TOKEN` n'était appliquée qu'à `fetch_hint`, pas au `brief` |
| « Administration fermée » sur la page d'accueil | le tableau de classe dépendait de `/api/overview`, fermée à la V2 — la page d'accueil était cassée **depuis le moment du verrouillage** |
| « ressaisis le secret » sans champ à saisir | le champ secret n'existait qu'en Challenge |
| « Quitter » ne faisait rien | `location.hash = '#/'` puis `route()` relisait le jeton et rouvrait le jeu — mort depuis le premier commit, et le `confirm` promettait le contraire |
| les trois quêtes de l'atelier 7 échouaient en CI | la commande de récupération mise sur un `sleep 3` entre le lancement et la lecture des journaux : le runner est plus lent que le poste de développement |
| l'échec ci-dessus s'affichait `Network … Removed` | le rapport n'affichait que les deux dernières lignes de stderr — le démontage. L'erreur était en haut |

Les deux derniers sont un seul défaut, vu deux fois : **un diagnostic qui montre
le ménage au lieu de la panne**. Le `sleep` est parti — la commande attend
maintenant la fin du processus, ce que `compose up <service>` fait déjà. Et le
rapport montre le début de stderr.

Le cas de « Quitter » est le plus instructif : le jeton restait dans le
navigateur, donc **recharger la page reconnectait**. L'élève qui rendait le poste
au suivant lui laissait sa session.

---

## Limites connues

- **Pas de sauvegarde.** Le volume `atelier-docker-data` vit sur le seul disque
  du serveur. Pas de copie, pas de réplication.
- **`LINEAR_PROGRESSION` n'est pas une contrainte serveur.** `/api/submit`
  n'accepte que le flag, dans les deux cas : un appel direct validerait n'importe
  quelle mission. C'est assumé — punir l'élève qui utilise `curl` comme
  documenté n'apporterait rien. Pour une vraie contrainte : `ARENA_ATTESTATION=1`.
- **CSS mort** dans `public/style.css` : `.portal-head`, `.portal-body`,
  `.portal-foot`, `.podium`, `.panel-amber`, `.panel-emerald`, `.panel-cyan` —
  des restes du portail supprimé. Cosmétique.
- **Le quota est par IP**, pas par jeton. Voir l'avertissement NAT ci-dessus.
- **`check_fetchhints` inscrit un joueur** en production. Il le supprime en
  sortant ; `nettoie-verif` est le filet pour une exécution interrompue. Sans
  `ATELIER_ADMIN_KEY`, le ménage ne passe pas et le script le dit.
- **Le nom `arena` a survécu** (`ARENA_CHANGED`, `X-Arena-Token`,
  `repo/arena.js`, `ARENA_SALT`, `ARENA_LINEAR`…). C'est un contrat d'API :
  le renommer coûterait un diff de plusieurs centaines de lignes pour aucun gain.

---

## Licence

MIT — voir `LICENSE`.