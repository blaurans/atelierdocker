// Atelier 1 — Préparer le terrain
//
// Le fil rouge commence ici : la librairie Verdi veut quitter son vieux
// serveur, et chaque atelier est une étape de la migration. On ne le répète
// pas dans chaque énoncé — le portail affiche l'atelier, l'élève sait où il
// est. L'énoncé, lui, doit seulement dire ce qu'il faut faire sur la machine.
//
// Deux partis pris qui valent pour tous les ateliers, et qu'il faut garder à
// l'esprit en écrivant les suivants :
//
//   1. Aucun artefact mort. Chaque commande sert la quête suivante. L'atelier 1
//      diagnostique la machine ; l'atelier 2 installe Docker ; l'atelier 3
//      vérifie qu'il répond. Le diagnostic n'est pas une occupation.
//   2. Aucune consigne sans vérification. Les questions de compréhension et le
//      réflexe sont écrits dans le contenu, pas laissés à l'invention de
//      l'enseignant qui corrigerait.
//
// Les `charge` décrivent le prix d'un indice : les deux premiers coûtent de
// l'autonomie, le dernier est gratuit. L'invariant est vérifié par
// src/questpack.js — si un `charge` ne se termine pas par 0, le serveur refuse
// de démarrer.
export default {
  meta: {
    slug: 'm1-preparer-le-terrain',
    module: 1,
    title: 'Préparer le terrain',
    tagline: 'Savoir sur quoi on travaille, installer Docker, le vérifier',
    icon: '🔧',
  },

  quests: [
    {
      id: 'm1-01-diagnostiquer-la-machine',
      order: 1,
      title: 'Diagnostiquer la machine',
      points: 25,
      flag: 'FLAG{UBUNTU_SERVER_24_ARM64_READY}',
      estMinutes: 8,
      brief: `# Diagnostiquer la machine

Tu es sur ta VM Ubuntu Server. Avant d'y installer quoi que ce soit, tu vas avoir
besoin de trois informations : **quelle version d'Ubuntu**, **quelle
architecture**, et **combien de place il reste**. L'architecture surtout —
c'est elle qui décide si les paquets de Docker qu'on installera à
l'atelier suivant correspondent à ta machine.

**Ta mission**

1. Quelle distribution et quelle version ? Le fichier qui décrit ta
   distribution s'appelle \`/etc/os-release\` :

\`\`\`bash
cat /etc/os-release
\`\`\`

2. Quelle architecture ? L'outil s'appelle \`uname\`, son option veut dire
   « machine » :

\`\`\`bash
uname -m
\`\`\`

3. Combien de mémoire, et combien de place sur le disque ? Deux outils
   différents : le premier parle de mémoire, le second d'espace disque.

\`\`\`bash
free -h
df -h /
\`\`\`

**Pourquoi ces trois**

L'architecture détermine les paquets : une aarch64 et une x86 ne prennent pas
le même fichier. La place sur le disque decide si la construction d'images de
l'atelier 6 va passer. La version d'Ubuntu, c'est ce que tu diras au
professeur s'il demande « ça vient bien de là ».

**Ton mot de passe**

Docker n'est pas encore installé sur ta VM, donc cette fois ce n'est pas un
conteneur qui va le chercher. Utilise \`curl\`, qui est déjà là :

\`\`\`bash
curl -sS 'https://SERVER_IP/api/secret/m1-01-diagnostiquer-la-machine/raw?token=TON_JETON'
\`\`\`

Remplace \`TON_JETON\` par le jeton affiché à l'inscription, puis colle la
commande dans ton terminal. Le mot de passe s'affiche : envoie-le tel quel au
portail.`,
      hints: [
        "`cat` affiche le contenu d'un fichier. Celui qui décrit ta distribution est un fichier texte ordinaire, lisible.",
        "`uname` interroge le noyau. Son option veut dire « machine » : une seule lettre.",
        "La mémoire et le disque ne se lisent pas avec la même commande : l'une vient de `/proc`, l'autre du système de fichiers.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm1-01-os-release',
          kind: 'mcq',
          prompt: 'Sur ta VM, quelle commande affiche la version exacte de ta distribution Linux ?',
          choices: ['cat /etc/os-release', 'uname -m', 'free -h', 'df -h /'],
          answer: 0,
          explanation: "`/etc/os-release` est le fichier que chaque distribution tient à jour : nom, version, identifiant. `uname -m` donne l'architecture, pas la version d'Ubuntu — c'est un piège classique.",
          required: true,
        },
        {
          id: 'm1-01-pourquoi-archi',
          kind: 'mcq',
          prompt: 'Pourquoi l\'architecture (`uname -m`) compte-t-elle avant d\'installer Docker ?',
          choices: [
            'Parce qu\'elle détermine les paquets disponibles',
            'Parce qu\'elle change les commandes de Docker',
            'Parce que Docker ne fonctionne qu\'en 64 bits',
            'Parce qu\'elle détermine l\'espace disque disponible',
          ],
          answer: 0,
          explanation: "Les paquets de Docker se téléchargent par architecture : une aarch64 et une x86 ne prennent pas le même fichier. Les commandes Docker, elles, sont identiques partout.",
          required: true,
        },
      ],
      // Pas de `recall` ici : la consigne donne la commande, donc le POINT est
      // déjà dans l'écran. Une question de restitution n'apporterait rien — elle
      // se répondrait en copiant. Le réflexe sert plus loin, quand l'élève doit
      // *choisir* la bonne option parmi plusieurs.
      //
      solution: `\`\`\`bash
cat /etc/os-release
# -> NAME="Ubuntu"
# -> VERSION="24.04.1 LTS"
# -> ID=ubuntu

uname -m
# -> x86_64   (ou aarch64 sur une VM Apple Silicon / Ampere)

free -h
# -> colonne "Mem" et "available" : c'est le.available qui compte, pas "free"

df -h /
# -> colonne "Avail" en racine : c'est la place qu'il reste
\`\`\``,
      teaches: ['/etc/os-release', 'uname -m', 'free -h', 'df -h'],
      fetchHint: `curl -sS 'https://SERVER_IP/api/secret/m1-01-diagnostiquer-la-machine/raw?token=dq_xxxxxxxxxxxxxxxx'`,
      checkpoint: "Tu as compris quand tu sais dire quelle architecture tu as, et pourquoi elle décide des paquets qu'on installera à l'atelier suivant.",
    },

    {
      id: 'm1-02-installer-docker',
      order: 2,
      title: 'Installer Docker',
      points: 25,
      flag: 'FLAG{DOCKER_ENGINE_INSTALLED_SUDO_OK}',
      estMinutes: 18,
      brief: `# Installer Docker

Docker n'est pas dans les dépôts Ubuntu par défaut. On l'ajoute : c'est le site
officiel qui fournit les paquets, et on commence par lui dire qui on est.
Trois étapes, dans cet ordre — **si tu les mélanges, ça échoue et le message
d'erreur ne dit pas laquelle**.

**1. Les outils de base**

Les paquets de Docker ont besoin de \`ca-certificates\` et \`curl\`, et pour
ajouter un dépôt, de \`gnupg\` :

\`\`\`bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
\`\`\`

**2. La signature**

On récupère la clé publique de Docker et on la range dans un fichier
spécifique, lisible par \`apt\` :

\`\`\`bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
\`\`\`

**3. Le dépôt**

On dit à \`apt\` où trouver Docker et pour quelle version :

\`\`\`bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
\`\`\`

**4. L'installation**

\`\`\`bash
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
\`\`\`

**5. Ta session n'est pas encore « dans le groupe »**

Le paquet s'installe avec \`sudo\`, mais ton compte n'appartient pas encore
du groupe \`docker\`. Deux options : tu utilises \`sudo docker …\` pour tout le
reste de l'atelier, ou tu actives le groupe pour ta session en cours :

\`\`\`bash
newgrp docker
docker version
\`\`\`

**Si \`docker version\` échoue** après tout ça, deux causes probables :
la clé n'a pas été lue par \`apt\` (l'option \`signed-by\` pointe vers le mauvais
fichier), ou la ligne du dépôt a été écrite avec un mauvais nom de version.

**Ton mot de passe**

Toujours en \`curl\`, toujours avant d'avoir \`docker\` dans le \`PATH\` de ta
session si tu n'as pas fait \`newgrp\` :

\`\`\`bash
curl -sS 'https://SERVER_IP/api/secret/m1-02-installer-docker/raw?token=TON_JETON'
\`\`\``,
      hints: [
        "Les erreurs d'installation de Docker sont presque toujours une clé absente ou un mauvais nom de version. Regarde le nom de version dans ton fichier de dépôt, pas dans la commande.",
        "`newgrp docker` ne change que ta session courante. Si tu fermes le terminal, tu repasses par `sudo docker`.",
        "Si `apt-get update` se plaint d'une clé, c'est que le fichier `/etc/apt/keyrings/docker.gpg` n'existe pas ou n'est pas lisible par tout le monde — vérifie les droits avec `ls -l`.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      // Pas de `recall` : dans un atelier d'installation, les commandes sont
      // données — c'est nécessaire à des débutants. Le QCM porte donc seul la
      // vérification, et il porte sur ce qui *n'est pas* dans l'écran : pourquoi
      // la clé existe, ce que signifie l'échec de `docker version`.
      check: [
        {
          id: 'm1-02-pas-apt',
          kind: 'mcq',
          prompt: 'Pourquoi l\'installation ne se fait-elle pas avec un simple `sudo apt-get install docker` ?',
          choices: [
            'Parce que le paquet n\'existe pas dans les dépôts Ubuntu par défaut',
            'Parce que Docker exige Ubuntu 24.04 exactement',
            'Parce que `apt-get install` ne peut pas installer depuis le réseau',
            'Parce qu\'il faut compiler Docker',
          ],
          answer: 0,
          explanation: "Le paquet s'appelle `docker-ce` et n'est pas dans les dépôts Ubuntu : il faut ajouter le dépôt officiel de Docker, avec sa clé de signature. C'est ce que font les étapes 2 et 3.",
          required: true,
        },
        {
          id: 'm1-02-sudo',
          kind: 'mcq',
          prompt: 'Après l\'installation, pourquoi `docker ps` peut-il échouer alors que `sudo docker ps` fonctionne ?',
          choices: [
            'Parce que ton compte n\'est pas encore dans le groupe docker',
            'Parce que Docker exige root',
            'Parce que le démon n\'a pas démarré',
            'Parce que le port est occupé',
          ],
          answer: 0,
          explanation: "Le groupe `docker` est ajouté à ton compte, mais seulement à la prochaine session : `newgrp docker` l'active tout de suite. Docker n'exige pas root, il exige d'être dans ce groupe.",
          required: true,
        },
        {
          id: 'm1-02-erreur-cle',
          kind: 'boolean',
          prompt: 'Si `sudo apt-get update` échoue en parlant de clé signing ou de signature, la première chose à vérifier est l\'option `signed-by` de la ligne de dépôt.',
          answer: true,
          explanation: "L'option `signed-by` dit à `apt` quel fichier contient la clé de signature. Un chemin erroné — ou une clé absente — donne exactement cette erreur, et le message ne nomme pas le fichier fautif.",
          required: false,
        },
      ],
      // Pas de `recall` ici non plus : `signed-by` est écrit dans la commande de
      // l'étape 3, donc la question se répondrait par copier-coller.
      solution: `\`\`\`bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Activer le groupe docker pour cette session
newgrp docker
docker version
# -> Client: Docker Engine
# -> Server: Docker Engine   <- si Server est là, le démon répond
\`\`\``,
      teaches: ['dépôt officiel', 'clé de signature', 'signed-by', 'groupe docker', 'newgrp'],
      fetchHint: `curl -sS 'https://SERVER_IP/api/secret/m1-02-installer-docker/raw?token=dq_xxxxxxxxxxxxxxxx'`,
      checkpoint: "Tu as réussi quand `docker version` affiche une section **Server** autant que **Client** : sans elle, le client est installé mais le démon ne répond pas.",
    },

    {
      id: 'm1-03-premier-conteneur',
      order: 3,
      title: 'Premier conteneur',
      points: 25,
      flag: 'FLAG{HELLO_WORLD_FIRST_CONTAINER_RAN}',
      estMinutes: 12,
      brief: `# Premier conteneur

Docker est installé. On ne connaît encore aucune commande. Ce qu'on va faire
ici, c'est la chose que personne n'arrive à oublier ensuite : lancer quelque
chose, voir ce que ça affiche, et le faire **sans le laisser traîner**.

**Ta mission**

1. Lance le conteneur de démonstration. \`run\` se prononce « run » — le mot
   anglais pour *lancer* :

\`\`\`bash
docker run hello-world
\`\`\`

2. Tu as vu un message de la part de Docker, puis de nouveau celui de Docker.
   Relis-le : **qu'est-ce que le conteneur a réellement fait ?** La réponse
   n'est pas « il a affiché un message ».

3. Maintenant regarde ce que ce lancement a laissé sur ta machine :

\`\`\`bash
docker ps
\`\`\`

Elle est vide. Le conteneur s'est arrêté de lui-même. La même commande possède
une option qui lui fait lister aussi les conteneurs arrêtés : **une seule
lettre**, qui se lit « all ». Ajoute-la, et compare les deux sorties.

4. Compare avec ce que Docker a téléchargé :

\`\`\`bash
docker images
\`\`\`

5. Nettoie. Un conteneur arrêté ne sert à rien et il prend de la place. Son nom
   est dans la colonne \`NAMES\` de la sortie précédente :

\`\`\`bash
docker rm <nom-du-conteneur>
\`\`\`

**Ce que tu observes**

- \`docker run hello-world\` affiche deux fois « Hello from Docker! » : une fois
  venue de l'image, une fois envoyée par le démon qui confirme l'exécution.
  Le conteneur **n'a fait que s'afficher**, puis s'est arrêté tout seul.
- \`docker ps\` ne liste que ce qui tourne. L'option d'une lettre ajoute les
  conteneurs arrêtés, avec le statut \`Exited\`. C'est la différence entre « je
  fonctionne » et « j'ai existé ».
- \`docker images\`, lui, garde \`hello-world\`. L'image est toujours là : elle ne
  s'est jamais arrêtée, elle n'a jamais tourné.

**Ton mot de passe**

Docker est là, donc cette fois c'est bien un conteneur qui va le chercher :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine sh -c "mkdir -p /arena && wget -qO /arena/secret.txt 'https://SERVER_IP/api/secret/m1-03-premier-conteneur/raw?token=$ARENA_TOKEN' && cat /arena/secret.txt"
\`\`\``,
      hints: [
        "Le nom du conteneur est dans la colonne `NAMES` de la sortie précédente. C'est lui qu'il faut passer à `docker rm`.",
        "`docker run` sans `--rm` laisse le conteneur derrière lui. C'est voulu ici : on veut le voir.",
        "Les deux « Hello from Docker! » ne viennent pas du même endroit. L'un vient de l'image, l'autre du démon — compare leur position dans la sortie.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm1-03-deux-messages',
          kind: 'mcq',
          prompt: 'Après `docker run hello-world`, qu\'a fait le conteneur, exactement ?',
          choices: [
            'Il a affiché un message, puis s\'est arrêté',
            'Il tourne encore en arrière-plan',
            'Il a téléchargé une image et rien d\'autre',
            'Il a redémarré la machine',
          ],
          answer: 0,
          explanation: "C'est la leçon du jour : un conteur lancé sans commande longue se termine dès que le programme est fini. `docker ps` est vide juste après, `docker ps -a` le montre en `Exited`.",
          required: true,
        },
        {
          id: 'm1-03-image-conteneur',
          kind: 'mcq',
          prompt: 'Après avoir supprimé le conteneur, que reste-t-il dans `docker images` ?',
          choices: [
            'L\'image reste : le conteneur n\'est qu\'une instance d\'elle',
            'Plus rien : tout est supprimé avec le conteneur',
            'L\'image disparaît, mais reste dans le cache de build',
            'L\'image reste seulement si on ne l\'a pas nommée',
          ],
          answer: 0,
          explanation: "L'image est le modèle, le conteneur en est une instance jetable. Supprimer l'instance ne touche pas au modèle : c'est ce qui rend le cycle « lancer, jeter, relancer » possible.",
          required: true,
        },
      ],
      recall: {
        id: 'm1-03-ps-a',
        prompt: 'Quelle option de `docker ps` affiche aussi les conteneurs arrêtés ?',
        accept: ['-a', '--all', 'ps -a'],
        hint: 'C\'est une seule lettre. Elle signifie « all », le mot anglais pour « tout ».',
      },
      solution: `\`\`\`bash
docker run hello-world
# -> Unable to find image 'hello-world:latest' locally
# -> latest: Pulling from library/hello-world
# -> Digest: sha256:cf4a1d10cbf6...
# -> Status: Downloaded newer image for hello-world:latest
# -> Hello from Docker!                      <- vient de l'image
# -> To run a demo type: docker run -it --rm hello-world
# -> Hello from Docker!                      <- envoyé par le démon

docker ps
# -> CONTAINER ID  IMAGE  ... : vide

docker ps -a
# -> 8b1a2c3d4e5f  hello-world  ...  Exited (0) 3 seconds ago  angry_hopper

docker images
# -> REPOSITORY   TAG   IMAGE ID   CREATED   SIZE
# -> hello-world  latest  d3b8...    1 week ago  23.2kB

docker rm angry_hopper
\`\`\``,
      teaches: ['docker run', 'docker ps', 'statut Exited', 'docker images', 'docker rm'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine sh -c "mkdir -p /arena && wget -qO /arena/secret.txt 'https://SERVER_IP/api/secret/m1-03-premier-conteneur/raw?token=$ARENA_TOKEN' && cat /arena/secret.txt"`,
      checkpoint: "Tu as compris quand tu sais expliquer pourquoi `docker ps` est vide alors que `docker images` contient encore `hello-world`.",
    },

    {
      id: 'm1-04-le-service-ne-tourne-pas',
      order: 4,
      title: 'Le service ne tourne pas',
      points: 25,
      flag: 'FLAG{DAEMON_STARTED_STATUS_RUNNING}',
      estMinutes: 12,
      brief: `# Le service ne tourne pas

Le conteneur de l'atelier précédent a bienaffiché son message, donc on pourrait
croire que tout va bien. Il n'en est rien : **ton client Docker est installé,
mais son démon ne tourne pas.**

C'est le piège le plus courant de l'installation, et il a une signature très
reconnaissable.

**Ta mission**

1. Demande la version *complète* — client et serveur :

\`\`\`bash
docker version
\`\`\`

Si la section **Server** est absente ou dit \`ERROR: Cannot connect to the
Docker daemon\`, tu es dans le cas qu'on attend.

2. Demande à \`systemctl\` si le service docker tourne. La commande a deux mots
   séparés par un tiret : le nom de l'outil, puis ce que tu veux savoir —
   « est-il actif ? ». Elle **demande**, elle ne démarre rien :

\`\`\`bash
systemctl is-active docker
\`\`\`

3. Démarre-le :

\`\`\`bash
sudo systemctl start docker
\`\`\`

4. Reprends la commande de l'étape 1, sans \`sudo\`, cette fois :

\`\`\`bash
docker version
\`\`\`

**Si \`sudo docker version\` fonctionne mais \`docker version\` non**

Ce n'est plus le démon, c'est ton compte. Vérifie le groupe :

\`\`\`bash
groups
\`\`\`

\`docker\` doit y apparaître. Sinon, soit tu utilises \`sudo docker\` pour
l'atelier, soit tu te ré-inscris dans le groupe avec \`newgrp docker\`.

**Ce que tu observes**

La réponse \`active\` (ou \`inactive\` avant l'étape 3), la section **Server**
qui apparaît enfin dans \`docker version\`, et le fait que tout le reste de
l'atelier fonctionnera désormais sans \`sudo\`.

**Bon à retenir**

Un client qui répond et un démon qui répond sont **deux choses**. \`docker
version\` affiche les deux : c'est le seul moyen de savoir lequel vous manque.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine sh -c "mkdir -p /arena && wget -qO /arena/secret.txt 'https://SERVER_IP/api/secret/m1-04-le-service-ne-tourne-pas/raw?token=$ARENA_TOKEN' && cat /arena/secret.txt"
\`\`\``,
      hints: [
        "`docker version` affiche deux sections : Client et Server. Si Server manque, le client est là et le démon non.",
        "`systemctl is-active` répond par un seul mot : `active` ou `inactive`. Ce n'est pas une commande qui démarre quoi que ce soit.",
        "`groups` affiche la liste de tes groupes. Cherche `docker` dedans — pas `sudo`, pas `root`.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm1-04-deux-sections',
          kind: 'mcq',
          prompt: '`docker version` affiche une section Client et une section Server. Qu\'est-ce que ça permet de diagnostiquer ?',
          choices: [
            'Savoir si le client est installé ET si le démon répond, séparément',
            'Rien : si Client est là, tout va bien',
            'Savoir quelle version de Debian tu as',
            'Savoir combien de conteneurs tournent',
          ],
          answer: 0,
          explanation: "C'est tout l'intérêt de cette commande. Un client installé avec un démon arrêté affiche une section Server en erreur — c'est le cas le plus courant après une installation, et il se voit immédiatement.",
          required: true,
        },
        {
          id: 'm1-04-sudo-version',
          kind: 'mcq',
          prompt: '`sudo docker version` fonctionne mais `docker version` échoue. Qu\'est-ce que ça veut dire ?',
          choices: [
            'Le démon tourne, mais ton compte n\'est pas dans le groupe docker',
            'Le démon est arrêté, et `sudo` le démarre tout seul',
            'Docker est installé deux fois',
            'Le terminal n\'est pas dans le bon dossier',
          ],
          answer: 0,
          explanation: "`sudo` contourne le contrôle d'appartenance au groupe, donc un fonctionne quand l'autre non prouve que le démon est vivant et que c'est le groupe qui bloque. `newgrp docker` règle ça pour la session.",
          required: true,
        },
      ],
      // Pas de `recall` : la commande est écrite dans l'énoncé, donc la question
      // se répondrait en copiant. Le validateur (`accept` ne doit pas figurer
      // dans le brief) le refuse d'ailleurs — et il a raison. Le seul `recall`
      // de l'atelier est en 3, où la lettre n'est volontairement pas donnée.
      // C'est le critère : le réflexe ne vaut que si l'élève doit le retrouver.
      solution: `\`\`\`bash
docker version
# -> Client: Docker Engine - Community
# ->  Cannot connect to the Docker daemon at unix:///var/run/docker.sock.
#     Is the docker daemon running?
# -> (la section Server est vide ou en erreur)

systemctl is-active docker
# -> inactive

sudo systemctl start docker
# -> (rien en sortie, c'est normal)

systemctl is-active docker
# -> active

docker version
# -> Client: Docker Engine - Community
# -> Server: Docker Engine - Community
# ->  Server Version: 28.x

groups
# -> dieu sudo docker ...
\`\`\``,
      teaches: ['démon Docker', 'systemctl is-active', 'section Server', 'groupe docker'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine sh -c "mkdir -p /arena && wget -qO /arena/secret.txt 'https://SERVER_IP/api/secret/m1-04-le-service-ne-tourne-pas/raw?token=$ARENA_TOKEN' && cat /arena/secret.txt"`,
      checkpoint: "Tu as compris quand tu sais dire, devant un `docker version` qui échoue, si c'est le client qui manque ou le démon.",
    },
  ],
};