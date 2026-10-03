// Module 2 — Images & premier conteneur
// La quête phare qui termine le module est la mission officielle n°1 « Initial Boot ».
export default {
  meta: {
    slug: 'm2-images-premier-conteneur',
    module: 2,
    title: 'Images & premier conteneur',
    tagline: 'Télécharger un modèle, le lancer, le jeter, puis démonter le moteur',
    icon: '📦',
  },

  quests: [
    {
      id: 'm2-01-telecharger-une-image',
      order: 1,
      title: 'Télécharger une image',
      points: 25,
      flag: 'FLAG{PULL_ALPINE_OFFICIAL_HUB}',
      estMinutes: 8,
      brief: `# Télécharger une image

Les images officielles vivent sur **Docker Hub**, un registre de fichiers. Avant de lancer quoi que ce soit, tu télécharges l'image avec \`docker pull\`. Après, Docker la garde en local.

**Ta mission**

1. Télécharge l'image Alpine, la plus légère de Docker Hub :

\`\`\`bash
docker pull alpine
\`\`\`

2. Regarde ce que Docker a maintenant en stock :

\`\`\`bash
docker images
\`\`\`

3. Décrypte la ligne d'\`alpine\` : que veut dire la colonne **REPOSITORY** ? la colonne **TAG** ? la colonne **IMAGE ID** ?

4. Affiche le système et l'architecture de l'image, sans sortir tout le JSON :

\`\`\`bash
docker image inspect alpine --format '{{.Os}} / {{.Architecture}}'
\`\`\`

5. Compare avec une autre image minuscule, puis regarde la colonne SIZE :

\`\`\`bash
docker pull busybox
docker images
\`\`\`

**Bon à savoir**

- \`alpine\` seul veut dire \`alpine:latest\`. C'est une convention, pas une obligation.
- \`latest\` ne garantit pas « la version la plus récente » : c'est un simple tag qui peut bouger dans le temps.
- La colonne SIZE n'additionne pas tout à fait : Docker ne recopie pas les couches qu'il possède déjà.

**Ton mot de passe**

Il n'est écrit nulle part : il sort de la sortie de ton conteneur. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm busybox wget -qO- "http://SERVER_IP:8000/api/secret/m2-01-telecharger-une-image/raw?token=$ARENA_TOKEN"
\`\`\`

Le mot de passe s'affiche dans le terminal : envoie-le tel quel au portail.`,
      hints: [
        "La commande de téléchargement a une lettre et deux syllabes : pull, comme « tire vers toi ».",
        "Après le pull, interroge le stock local avec la commande de lecture vue au module 1.",
      ],
      solution: `\`\`\`bash
docker pull alpine
# -> Status: Downloaded newer image for alpine:latest  (la ou les couches sont telechargees)

docker images
# -> REPOSITORY  alpine   TAG  latest   IMAGE ID  <12 caracteres>   CREATED  ...   SIZE  8.17MB
#    REPOSITORY : le depot officiel
#    TAG        : la version, latest par defaut
#    IMAGE ID   : l'empreinte courte du modele, elle identifie l'image de facon fiable

docker image inspect alpine --format '{{.Os}} / {{.Architecture}}'
# -> linux / amd64

docker pull busybox
docker images
# -> une seconde ligne, plus petite : busquybox:latest
\`\`\``,
      teaches: ['docker pull', 'docker images', 'docker image inspect', 'Docker Hub', 'tag latest'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm busybox wget -qO- "http://SERVER_IP:8000/api/secret/m2-01-telecharger-une-image/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as réussi quand `docker images` affiche une ligne `alpine` avec le tag `latest`, et que tu sais expliquer à quoi sert la colonne IMAGE ID.",
    },

    {
      id: 'm2-02-conteneur-jetable',
      order: 2,
      title: 'Un conteneur jetable',
      points: 25,
      flag: 'FLAG{RUN_RM_THROWAWAY_CONTAINER}',
      estMinutes: 10,
      brief: `# Un conteneur jetable

\`docker run\` fait deux choses d'un seul coup : il **crée** un conteneur à partir de l'image, puis il le **démarre**. La commande se termine quand le conteneur s'arrête.

**Ta mission**

1. Lance un conteneur qui disparaît tout seul :

\`\`\`bash
docker run --rm alpine echo "premier lancement"
\`\`\`

2. Vérifie qu'il ne reste aucune trace :

\`\`\`bash
docker ps -a
\`\`\`

3. Relance le même conteneur **sans** \`--rm\`, puis regarde la liste complète :

\`\`\`bash
docker run alpine echo "je reste dans docker ps -a"
docker ps -a
\`\`\`

4. Note l'identifiant affiché dans la colonne **ID** de \`docker ps -a\` (par exemple \`9f3a1c7b2d4e\`), puis supprime le conteneur avec \`docker rm\` suivi de cet identifiant.

5. Ouvre un mini terminal dans un conteneur Alpine :

\`\`\`bash
docker run --rm alpine sh
\`\`\`

Tape \`exit\` pour sortir.

**Ce que tu observes**

- Avec \`--rm\`, le conteneur est supprimé dès la sortie : \`docker ps -a\` ne le voit plus.
- Sans \`--rm\`, il reste avec le statut **Exited** : Docker garde son système de fichiers et ses logs.
- \`docker run\` équivaut à \`docker create\` puis \`docker start\`, en une seule commande.
- Un conteneur s'arrête quand sa commande principale se termine : rien ne le maintient en vie tout seul.

**Ton mot de passe**

Il n'est écrit nulle part : il sort de la sortie de ton conteneur. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "http://SERVER_IP:8000/api/secret/m2-02-conteneur-jetable/raw?token=$ARENA_TOKEN"
\`\`\`

Le mot de passe s'affiche dans le terminal : envoie-le tel quel au portail.`,
      hints: [
        "L'option qui supprime le conteneur à la sortie se trouve dans l'aide de `docker run`, obtenue au module 1.",
        "Sans cette option, un conteneur arrêté s'empile dans `docker ps -a` : c'est là que tu récupères son identifiant.",
      ],
      solution: `\`\`\`bash
docker run --rm alpine echo "premier lancement"
# -> premier lancement
docker ps -a
# -> aucun conteneur : --rm l'a supprime a la sortie

docker run alpine echo "je reste dans docker ps -a"
# -> je reste dans docker ps -a
docker ps -a
# -> CONTAINER ID 9f3a1c7b2d4e   IMAGE alpine   STATUS "Exited (0) 1 second ago"
docker rm 9f3a1c7b2d4e
docker ps -a
# -> de nouveau vide

docker run --rm alpine sh
# -> invite # a l'interieur du conteneur ; tape exit pour revenir
\`\`\``,
      teaches: ['docker run', 'option --rm', 'docker rm', 'create plus start', 'commande principale'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "http://SERVER_IP:8000/api/secret/m2-02-conteneur-jetable/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as réussi quand un conteneur lancé avec `--rm` n'apparaît plus dans `docker ps -a`, alors que le même conteneur lancé sans `--rm` y reste avec le statut Exited.",
    },

    {
      id: 'm2-03-anatomie-dune-image',
      order: 3,
      title: "Anatomie d'une image",
      points: 50,
      flag: 'FLAG{LAYERS_CACHED_INSPECT_HISTORY}',
      estMinutes: 15,
      brief: `# Anatomie d'une image

Une image n'est pas un gros fichier : c'est une **pile de couches** (layers). Chaque instruction d'une construction d'image ajoute une couche par-dessus les précédentes. Comprendre les couches, c'est comprendre la suite du jeu.

**Ta mission**

1. Affiche la pile de couches d'une image :

\`\`\`bash
docker history alpine
\`\`\`

2. Regarde les lignes dont la colonne **IMAGE ID** est affichée entre chevrons autour du mot \`missing\` : ces couches ne stockent aucun octet, elles ne portent qu'un réglage (une commande, une variable d'environnement, un dossier de travail).

3. Compare avec une image plus riche :

\`\`\`bash
docker history nginx:alpine
\`\`\`

4. Inspecte le contenu de l'image sans tout lire :

\`\`\`bash
docker image inspect alpine
docker image inspect alpine --format '{{.Config.Cmd}}'
docker image inspect alpine --format '{{.RootFS.Layers}}'
\`\`\`

5. Regarde le système de fichiers réel de l'image :

\`\`\`bash
docker run --rm alpine ls /
\`\`\`

**Ce que tu observes**

- \`docker history\` affiche la couche **la plus récente en premier**.
- \`{{.RootFS.Layers}}\` fait l'inverse : la couche de base est en premier.
- \`{{.Config.Cmd}}\` est la commande lancée par défaut quand tu ne donnes rien à \`docker run\`.
- Chaque couche ne contient que **ce qui a changé** depuis la couche du dessous. C'est ce qui rend les constructions rapides la deuxième fois : Docker réutilise les couches identiques.

**Ton mot de passe**

Il n'est écrit nulle part : il sort de la sortie de ton conteneur. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm busybox sh -c "wget -qO- 'http://SERVER_IP:8000/api/secret/m2-03-anatomie-dune-image/raw?token=$ARENA_TOKEN'"
\`\`\`

Le mot de passe s'affiche dans le terminal : envoie-le tel quel au portail.`,
      hints: [
        "L'historique d'une image s'obtient avec la commande `docker history`, l'homonyme de la commande shell.",
        "La liste ordonnée des couches se trouve dans le champ RootFS de l'inspection, et la commande par défaut dans le champ Config.",
      ],
      solution: `\`\`\`bash
docker history alpine
# -> IMAGE   CREATED BY                      SIZE
#    294b683  CMD ["/bin/sh"]                 0B     <- couche « missing » : un réglage, 0 octet
#    (ligne suivante)  ADD alpine-minirootfs...   10.1MB <- le systeme de fichiers de base

docker history nginx:alpine
# -> beaucoup plus de couches : les paquets installes, les fichiers de config, etc.

docker image inspect alpine
# -> un gros JSON : Repositories, Config, RootFS, Architecture...

docker image inspect alpine --format '{{.Config.Cmd}}'
# -> [/bin/sh]

docker image inspect alpine --format '{{.RootFS.Layers}}'
# -> [sha256:74d97c... : la ou les couches, de la base vers le haut]

docker run --rm alpine ls /
# -> le contenu reel de l'image : bin etc lib sbin usr
\`\`\``,
      teaches: ['docker history', 'docker image inspect', 'couches', 'layers', 'cache de construction'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm busybox sh -c "wget -qO- 'http://SERVER_IP:8000/api/secret/m2-03-anatomie-dune-image/raw?token=$ARENA_TOKEN'"`,
      checkpoint: "Tu as réussi quand `docker history alpine` te montre plusieurs couches dont certaines ne pèsent rien, et que tu sais expliquer que `RootFS.Layers` les liste dans l'autre ordre.",
    },

    {
      id: 'm2-04-initial-boot',
      order: 4,
      title: 'Initial Boot',
      points: 100,
      flag: 'FLAG{HELLO_DOCKER_ENGINE_RUNNING}',
      estMinutes: 12,
      brief: `# Mission phare — Initial Boot

Objectif : prouver que ton moteur Docker fonctionne, puis faire parler ton premier conteneur jetable.

**Mission**

1. Vérifie que ton démon Docker est actif. Tu dois voir deux parties, **Client** et **Server** :

\`\`\`bash
docker version
\`\`\`

2. Lance le conteneur officiel d'initiation :

\`\`\`bash
docker run hello-world
\`\`\`

3. Observe le cycle de vie complet : l'image \`hello-world\` a été téléchargée depuis Docker Hub, instanciée dans un conteneur éphémère, qui s'est arrêté après avoir affiché son message.

4. Relance-le en mode jetable pour voir la différence :

\`\`\`bash
docker run --rm hello-world
docker ps -a
\`\`\`

**Ton mot de passe**

Il n'est écrit nulle part : il sort de la sortie de ton conteneur. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace dq_xxxxxxxxxxxxxxxx par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm busybox wget -qO- "http://SERVER_IP:8000/api/secret/m2-04-initial-boot/raw?token=$ARENA_TOKEN"
\`\`\`

Le mot de passe s'affiche dans le terminal : envoie-le tel quel au portail.`,
      hints: [
        "Première étape : la commande qui affiche à la fois la version de la CLI et celle du démon. Tu l'as déjà utilisée au module 1.",
        "L'image d'initiation de Docker s'appelle hello-world, et son conteneur affiche un message puis se termine tout seul.",
        "Pour le mot de passe : une image très légère (`busybox`), l'option `--rm`, et la commande `wget -qO-` suivie de l'adresse du portail — c'est la sortie standard du conteneur qui affiche le mot de passe.",
      ],
      solution: `\`\`\`bash
docker version
# -> Client: version ...
#    Server: Engine version ...   (le demon repond)

docker run hello-world
# -> Hello from Docker!
#    This message shows that your installation appears to be working correctly.
#    ... puis le conteneur s'arrete avec le statut Exited (0)

docker ps -a
# -> une ligne hello-world  Exited (0)

docker run --rm hello-world
docker ps -a
# -> plus de conteneur hello-world : il a ete supprime a la sortie

docker run --rm busybox wget -qO- "http://SERVER_IP:8000/api/secret/m2-04-initial-boot/raw?token=$ARENA_TOKEN"
# -> FLAG{...}   le mot de passe de TON equipe, affiche par le conteneur
#    (SERVER_IP = l'adresse du portail, que l'eleve remplace)
#    A envoyer tel quel au portail pour valider la mission.
\`\`\``,
      teaches: ['docker version', 'docker run', 'hello-world', 'busybox', 'validation d\'un flag'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm busybox wget -qO- "http://SERVER_IP:8000/api/secret/m2-04-initial-boot/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as réussi quand le conteneur `busybox` affiche un mot de passe dans ton terminal, et quand le portail a validé la mission avec ce mot de passe.",
    },
  ],
};