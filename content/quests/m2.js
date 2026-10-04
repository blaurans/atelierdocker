// Atelier 2 — Récupérer et lancer
//
// L'atelier 1 a laissé une machine où Docker fonctionne. Cet atelier répond à
// la question suivante du fil rouge : comment la librairie Verdi obtient-elle
// le logiciel qui tournera dans ses conteneurs ? On télécharge, on lance, on
// jette, et on regarde ce qu'il y a dans la boîte.
//
// Mêmes règles qu'à l'atelier 1, appliquées :
//
//   1. Aucun artefact mort. La 1 télécharge, la 2 lance ce qui a été téléchargé,
//      la 3 démonte l'image couche par couche, la 4 monte le site de la
//      librairie et le fait survivre à un redémarrage.
//   2. Aucun `recall` quand la commande est dans l'énoncé.
//   3. Le `charge` se termine toujours par 0 — le dernier indice est gratuit.
//
// Une différence avec l'atelier 1 : ici les questions portent aussi sur des
// *observations*. L'élève compare deux sorties, et la question demande ce que la
// différence prouve. C'est le genre de raisonnement qui manque le plus quand on
// apprend Docker en lisant de la documentation.
export default {
  meta: {
    slug: 'm2-recuperer-et-lancer',
    module: 2,
    title: 'Récupérer et lancer',
    tagline: 'Télécharger une image, la lancer, la jeter, démonter le moteur',
    icon: '📦',
  },

  quests: [
    {
      id: 'm2-01-telecharger-une-image',
      order: 1,
      title: 'Télécharger une image',
      points: 25,
      flag: 'FLAG{ALPINE_PULLED_TAG_IS_LATEST}',
      estMinutes: 10,
      brief: `# Télécharger une image

Le site de la librairie tourne sur du logiciel libre. Docker ne l'installe pas
comme \`apt\` : il **télécharge** une image déjà construite, faite par d'autres.
Ce sont les images officielles de Docker Hub, un registre qui en héberge des
milliers.

**Ta mission**

1. Télécharge l'image Alpine — la plus légère du registre, quelques mégaoctets :

\`\`\`bash
docker pull alpine
\`\`\`

2. Regarde ce que Docker garde maintenant en stock :

\`\`\`bash
docker images
\`\`\`

3. **Compare cette sortie avec celle de la fin de l'atelier 1.** À l'atelier 1,
   tu avais supprimé le conteneur \`hello-world\` et vu qu'il disparaissait de
   \`docker ps -a\`. Ici, \`alpine\` apparaît dans \`docker images\` sans que tu aies
   lancé quoi que ce soit. Pourquoi la suppression d'un conteneur n'a pas
   supprimé l'image ?

4. Interroge l'image sur son système et son architecture. L'option \`--format\`
   demande une seule propriété au lieu de tout le bloc JSON :

\`\`\`bash
docker image inspect alpine --format '{{.Os}} / {{.Architecture}}'
\`\`\`

Si la sortie ne correspond pas à ce que \`uname -m\` disait à l'atelier 1, ce n'est
pas une erreur : explique ce que ça signifie.

5. Télécharge une seconde image, puis compare :

\`\`\`bash
docker pull busybox
docker images
\`\`\`

**Ce que tu observes**

- \`alpine\` seule se lit \`alpine:latest\`. C'est une convention, pas une
  obligation.
- \`latest\` ne veut **pas** dire « la plus récente » : c'est un simple tag, qui
  peut pointer sur une version différente selon la date du \`docker pull\`.
- La colonne SIZE n'additionne pas les lignes : Docker ne recopie pas les
  couches qu'il possède déjà.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm busybox wget -qO- "https://SERVER_IP/api/secret/m2-01-telecharger-une-image/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "`docker pull` télécharge, il ne lance rien. Si la commande affiche une sortie de programme, c'est que tu as lancé un conteneur — ici, tu dois seulement télécharger.",
        "Compare les deux situations : à l'atelier 1 tu as supprimé un **conteneur**, ici tu n'as rien créé du tout. Image et conteneur ne sont pas la même chose.",
        "`--format '{{.Os}} / {{.Architecture}}'` : les accolades entourent un nom de propriété, comme une variable entre chevrons. Sans `--format`, tu obtiens tout le JSON.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm2-01-image-conteneur',
          kind: 'mcq',
          prompt: 'À la fin de l\'atelier 1, tu as supprimé le conteneur `hello-world`. Pourquoi `alpine` apparaît-elle quand même dans `docker images` ?',
          choices: [
            'Parce que l\'image et le conteneur sont deux choses : on a supprimé l\'instance, pas le modèle',
            'Parce que `docker images` liste les conteneurs supprimés',
            'Parce que `docker pull` a recréé le conteneur',
            'Parce que Docker garde tout pendant un mois',
          ],
          answer: 0,
          explanation: "C'est la distinction de tout l'atelier : l'image est le modèle figé, le conteneur en est une instance jetable. Supprimer l'instance ne touche pas au modèle — c'est ce qui permet de relancer sans retélécharger.",
          required: true,
        },
        {
          id: 'm2-01-latest',
          kind: 'mcq',
          prompt: 'Que garantit le tag `latest` ?',
          choices: [
            'Rien : c\'est un simple nom, pas une promesse de fraîcheur',
            'La version la plus récente au moment du pull',
            'La version la plus stable',
            'Une image officielle de Docker',
          ],
          answer: 0,
          explanation: "`latest` est une convention de nom, pas un calcul. Un même `docker pull alpine` deux mois plus tard peut donner une image différente. En production on épingle une version explicite.",
          required: true,
        },
        {
          id: 'm2-01-observation',
          kind: 'boolean',
          prompt: 'Si `docker image inspect alpine --format \'{{.Os}} / {{.Architecture}}\'` affiche autre chose que `uname -m` à l\'atelier 1, c\'est que l\'image ne correspond pas à ta machine.',
          answer: false,
          explanation: "L'image a sa propre architecture, Downloading and running it on a different architecture needs QEMU emulation — it works, but slower. And the image's architecture is chosen at build time, not forced by your machine.",
          required: false,
        },
      ],
      solution: `\`\`\`bash
docker pull alpine
# -> latest: Pulling from library/alpine
# -> Digest: sha256:4bcff639f07c...
# -> Status: Downloaded newer image for alpine:latest
# -> docker.io/library/alpine:latest

docker images
# -> REPOSITORY   TAG       IMAGE ID       CREATED         SIZE
# -> alpine       latest    9234e8f04c93   2 weeks ago     7.83MB

docker image inspect alpine --format '{{.Os}} / {{.Architecture}}'
# -> linux / amd64

docker pull busybox
docker images
# -> REPOSITORY   TAG       IMAGE ID       CREATED         SIZE
# -> alpine       latest    9234e8f04c93   2 weeks ago     7.83MB
# -> busybox      latest    6e4d0bba0b5a   8 months ago    4.26MB
\`\`\`

L'image \`alpine\` n'a pas été supprimée quand tu as supprimé le conteneur : tu
avais supprimé une instance, pas le modèle.`,
      teaches: ['docker pull', 'Docker Hub', 'docker images', 'latest', 'docker image inspect'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm busybox wget -qO- "https://SERVER_IP/api/secret/m2-01-telecharger-une-image/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais dire ce qu'il faut faire pour qu'une image disparaisse vraiment de ta machine — et pourquoi `docker rm` ne le fait pas.",
    },

    {
      id: 'm2-02-conteneur-jetable',
      order: 2,
      title: 'Un conteneur jetable',
      points: 25,
      flag: 'FLAG{RM_FLAG_KEEPS_CONTAINER_EXITED}',
      estMinutes: 12,
      brief: `# Un conteneur jetable

L'atelier 1 a lancé \`hello-world\` et constaté qu'il s'arrêtait tout seul. Ce
qui manquait était la question suivante : **que reste-t-il après ?**

\`docker run\` fait deux choses d'un coup : il crée un conteneur à partir de
l'image, puis il le démarre. La commande ne rend la main que lorsque le
conteneur s'arrête.

**Ta mission**

1. Lance un conteneur qui se supprime à la sortie. L'option s'appelle comme
   elle fait — \`--rm\`, pour *remove* :

\`\`\`bash
docker run --rm alpine echo "premier lancement"
\`\`\`

2. Vérifie qu'il n'a rien laissé :

\`\`\`bash
docker ps -a
\`\`\`

3. Relance **sans** \`--rm\`, avec un message différent, et compare :

\`\`\`bash
docker run alpine echo "je reste dans docker ps -a"
docker ps -a
\`\`\`

4. Les deux lignes se ressemblent beaucoup. Ce qui n'est pas pareil, c'est la
   **longueur de l'identifiant** affiché dans la colonne ID. Mesure-les. Un
   conteneur se supprime par son identifiant — celui de la seconde commande, la
   plus longue.

5. Ouvre un terminal *à l'intérieur* d'un conteneur. Unlike \`echo\`, \`sh\`
   attend : le conteneur reste en vie tant que tu es dedans. Tape ensuite
   \`exit\` pour sortir, et regarde ce qu'il advient du conteneur.

\`\`\`bash
docker run --rm alpine sh
\`\`\`

**Ce que tu observes**

- Avec \`--rm\`, le conteneur est supprimé en sortant : \`docker ps -a\` ne le
  voit plus.
- Sans, il reste avec le statut **Exited**. Docker conserve son système de
  fichiers et ses logs.
- Un conteneur vit exactement le temps de sa commande principale. Rien ne le
  maintient en vie tout seul : c'est pour ça qu'un serveur a besoin d'une
  commande qui ne se termine pas.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m2-02-conteneur-jetable/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "L'option se lit `--rm`. Si le message « je reste… » apparaît dans `docker ps -a` avec un identifiant court, c'est que l'option n'a pas été mise.",
        "Un conteneur se supprime par son identifiant complet, celui affiché après les 12 premiers caractères dans la liste. `docker ps -a --no-trunc` les affiche en entier.",
        "`sh` attend des commandes : le conteneur reste vivant. `echo` fait son travail et s'arrête. C'est la différence entre un conteneur « de service » et un conteneur « de tâche ».",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm2-02-rm',
          kind: 'mcq',
          prompt: 'Que fait exactement l\'option `--rm` ?',
          choices: [
            'Elle supprime le conteneur quand il s\'arrête',
            'Elle supprime l\'image après le lancement',
            'Elle vide le système de fichiers du conteneur',
            'Elle empêche le conteneur de s\'arrêter',
          ],
          answer: 0,
          explanation: "`--rm` est un nettoyage automatique en fin de vie. L'image, elle, n'est jamais concernée : c'est le modèle, il sert aux lancements suivants.",
          required: true,
        },
        {
          id: 'm2-02-duree-vie',
          kind: 'mcq',
          prompt: 'Pourquoi un conteneur `docker run alpine sh` reste-t-il vivant, alors que `docker run alpine echo "coucou"` s\'arrête aussitôt ?',
          choices: [
            'Parce que `sh` attend une commande et ne se termine pas tout seul',
            'Parce que `echo` est plus rapide',
            'Parce que `sh` est une commande plus lourde',
            'Parce qu\'un conteneur ne s\'arrête jamais',
          ],
          answer: 0,
          explanation: "Un conteneur vit le temps de sa commande principale. C'est exactement ce qui manque à un conteneur destiné à tenir un service : il faudra une commande qui ne se termine pas.",
          required: true,
        },
        {
          id: 'm2-02-exited',
          kind: 'boolean',
          prompt: 'Un conteneur au statut `Exited` a perdu ses logs et son système de fichiers.',
          answer: false,
          explanation: "Faux : `Exited` signifie arrêté, pas supprimé. Le système de fichiers et les logs sont intacts — c'est précisément ce qui permet de lire les journaux après un plantage avec `docker logs`.",
          required: false,
        },
      ],
      solution: `\`\`\`bash
docker run --rm alpine echo "premier lancement"
# -> premier lancement
docker ps -a
# -> aucun conteneur : il a été supprimé

docker run alpine echo "je reste dans docker ps -a"
# -> je reste dans docker ps -a
docker ps -a
# -> CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    NAMES
# -> 9f3a1c7b2d4e   alpine    "echo …"  1s ago    Exited (0) 12s ago  brave_hopper

docker rm 9f3a1c7b2d4e
# -> 9f3a1c7b2d4e

docker run --rm alpine sh
# -> (tu es dans le conteneur)
/ # exit
\`\`\`

L'identifiant de 12 caractères suffit pour \`docker rm\` : Docker accepte un
préfixe non ambigu.`,
      teaches: ['docker run --rm', 'docker ps -a', 'statut Exited', 'docker rm', 'docker run alpine sh'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m2-02-conteneur-jetable/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais dire ce qui distingue un conteneur arrêté d'un conteneur supprimé — et ce que `--rm` supprime, et ce qu'il ne supprime pas.",
    },

    {
      id: 'm2-03-anatomie-dune-image',
      order: 3,
      title: 'Anatomie d\'une image',
      points: 50,
      flag: 'FLAG{IMAGE_LAYERS_INSPECTED_SHARED}',
      estMinutes: 15,
      brief: `# Anatomie d'une image

Tu as téléchargé deux images, et tu as vu que leurs tailles ne s'additionnaient
pas. Ce n'est pas un bug de calcul : une image n'est pas un gros fichier, c'est
un **empilement de couches**.

**Ta mission**

1. Compare les couches des deux images. Chaque ligne est une couche, la plus
   récente en haut :

\`\`\`bash
docker history alpine
docker history busybox
\`\`\`

2. \`docker images\` disait que \`alpine\` faisait 7,83 Mo et \`busybox\` 4,26 Mo.
   Additionne les couches que \`docker history\` affiche. Le total correspond-il ?
   Si non, pourquoi ?

3. Trouve une couche présente dans les deux images. Si elle existe, elle n'est
   pas stockée deux fois — le calcul de la colonne SIZE le sait, et c'est
   exactement ce que tu observes à l'étape 2.

4. Regarde le détail d'une seule couche, sans le JSON complet :

\`\`\`bash
docker history alpine --no-trunc --format '{{.CreatedBy}}'
\`\`\`

**Ce que tu observes**

- Une image est une **liste de couches**, chacune étant une différence de
  système de fichiers. Le moteur monte ces couches les unes sur les autres.
- Les couches se partagent entre images. Deux images qui partagent une couche
  en haut n'utilisent qu'une seule copie sur le disque.
- La colonne SIZE n'additionne pas parce qu'elle mesure ce que l'image
  **ajouterait** à un stock déjà rempli, pas sa taille totale.
- Chaque couche a une commande \`CreatedBy\` : c'est l'instruction du Dockerfile
  qui l'a produite. On le verra à l'atelier 6, où tu écriras ces instructions.

**Bon à retenir**

Une image est **immuable**. Pour la changer, on construit une nouvelle image par
-dessus — on ne modifie jamais une image existante. C'est ce qui permet à dix
serveurs de faire tourner la même image sans qu'ils divergent.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm busybox sh -c "wget -qO- 'https://SERVER_IP/api/secret/m2-03-anatomie-dune-image/raw?token=$ARENA_TOKEN'"
\`\`\``,
      hints: [
        "Les colonnes SIZE de `docker images` sont en mégaoctets, celles de `docker history` peuvent être en octets. Attention à l'unité.",
        "Une couche de quelques octets n'est pas Strange : elle peut être « Removed a file » — une suppression. Le moteur n'a pas besoin de garder le fichier.",
        "`docker history` liste les couches de la plus récente à la plus ancienne. Les toutes premières couches d'une image officielle sont souvent des « empty ».",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm2-03-couches',
          kind: 'mcq',
          prompt: 'Qu\'est-ce qu\'une image Docker, exactement ?',
          choices: [
            'Un empilement de couches, chacune étant une différence de système de fichiers',
            'Un fichier archive unique',
            'Un conteneur arrêté que l\'on peut redémarrer',
            'Un script d\'installation',
          ],
          answer: 0,
          explanation: "C'est le modèle mental à garder : le moteur monte les couches les unes sur les autres, et c'est pour cela qu'elles se partagent entre images.",
          required: true,
        },
        {
          id: 'm2-03-size',
          kind: 'mcq',
          prompt: 'Pourquoi la colonne SIZE de `docker images` ne donne pas la somme des couches ?',
          choices: [
            'Parce que les couches partagées ne sont stockées qu\'une seule fois',
            'Parce que la colonne est arrondie',
            'Parce que `docker history` compte les couches supprimées',
            'Parce que les images se compressent à l\'exécution',
          ],
          answer: 0,
          explanation: "Deux images qui partagent une couche n'en stockent qu'une copie. SIZE mesure ce que l'image ajouterait à un stock déjà rempli, pas sa taille totale.",
          required: true,
        },
        {
          id: 'm2-03-immuable',
          kind: 'boolean',
          prompt: 'Pour corriger une image existante, on peut y écrire directement depuis un conteneur puis la sauver.',
          answer: false,
          explanation: "Non : une image est immuable. Un conteneur lancé puis modifié ne touche pas à l'image. Pour changer quelque chose, on construit une nouvelle image par-dessus — c'est l'objet de l'atelier 6.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
docker history alpine
# -> IMAGE      CREATED BY         SIZE
# -> 9234e8f0   CMD ["sh"]         0B
# -> a24b3c11   ADD file:… in /    0B
# -> 5c9d0e42   ADD alpine.tar.gz  7.83MB

docker history busybox
# -> 6e4d0bba   CMD ["sh"]         0B
# -> b71c8e09   ADD file:… in /    0B
# -> 1a4f2b7c   ADD busybox.tar…   4.26MB

docker image inspect alpine --format '{{.Size}}'
# -> ~8.2 Mo

docker history alpine --no-trunc --format '{{.CreatedBy}}'
# -> CMD ["sh"]
# -> ADD file:e1c1e5a9… in /
# -> ADD alpine.tar.gz …
\`\`\`

Le total des couches correspond à la taille de l'image, mais la colonne SIZE de
\`docker images\` affiche moins quand des couches sont partagées.`,
      teaches: ['docker history', 'couches', 'couches partagées', 'CreatedBy', 'image immuable'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm busybox sh -c "wget -qO- 'https://SERVER_IP/api/secret/m2-03-anatomie-dune-image/raw?token=$ARENA_TOKEN'"`,
      checkpoint: "Tu as compris quand tu peux expliquer à quelqu'un pourquoi une image de 7,83 Mo peut ne coûter que 2 Mo de plus sur une machine qui a déjà une autre image.",
    },

    {
      id: 'm2-04-initial-boot',
      order: 4,
      title: 'Le premier serveur de la librairie',
      points: 100,
      flag: 'FLAG{VERDI_BOOT_PERSISTED_AFTER_RESTART}',
      estMinutes: 18,
      brief: `# Le premier serveur de la librairie

Premier jalon de la migration : le site de la librairie doit tourner dans un
conteneur, et **y rester après un redémarrage de la machine**.

Tu as téléchargé \`alpine\` et \`busybox\` aux étapes précédentes. Un site web n'est
pas une image Alpine : il te faut une image qui contient un serveur web. On va
prendre la plus connue, puis la faire tourner de façon à survivre à un reboot.

**Ta mission**

1. Télécharge l'image du serveur web Nginx et lance-la en arrière-plan :

\`\`\`bash
docker pull nginx:alpine
docker run -d --name verdi -p 8080:80 nginx:alpine
\`\`\`

Trois options, trois rôles. \`-d\` détache le conteneur du terminal pour qu'il
survive à la fermeture ; \`--name\` le nomme, ce qui évite les noms aléatoires ;
\`-p\` publie un port. Retiens-les, tu en auras besoin tout le reste du parcours.

2. Vérifie qu'il tourne et qu'il répond :

\`\`\`bash
docker ps
curl -s http://localhost:8080 | head -5
\`\`\`

3. **Teste la persistance.** Redémarre le démon Docker, pas le conteneur :

\`\`\`bash
sudo systemctl restart docker
docker ps
\`\`\`

Le conteneur \`verdi\` est-il encore là ? C'est ce que \`restart\` veut dire. Si
tu as \`--rm\`, il aurait disparu.

4. S'il a disparu, relance-le et explique pourquoi \`restart docker\` l'a
   emporté alors qu'il ne l'emportait pas au redémarrage du conteneur. La
   réponse est dans la politique de redémarrage, lisible ici :

\`\`\`bash
docker inspect verdi --format '{{.HostConfig.RestartPolicy.Name}}'
\`\`\`

**Pour que le site revienne tout seul**, il faut une politique de redémarrage.
Ajoute-la, puis teste pour de bon :

\`\`\`bash
docker update --restart unless-stopped verdi
sudo systemctl restart docker
docker ps
\`\`\`

**Ce que tu observes**

- \`docker ps\` montre \`verdi\` en \`Up\`, et \`curl\` renvoie la page d'accueil
  Nginx.
- Après \`sudo systemctl restart docker\`, un conteneur \`--rm\` a disparu, un
  conteneur \`--restart\` est reparti.
- La politique par défaut s'appelle \`no\` : Docker ne redémarre rien tout seul.

**Ce que ça veut dire pour la librairie**

Un conteneur tout seul ne suffit pas : sans politique de redémarrage, la prochaine
mise à jour de la machine laisse le site mort. C'est exactement le genre de
détail qui n'apparaît qu'en production.

**Bon à retenir**

\`--rm\` et \`--restart\` sont **incompatibles** : le premier supprime au stop, le
second veut redémarrer. Choisis l'un ou l'autre, jamais les deux.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm busybox wget -qO- "https://SERVER_IP/api/secret/m2-04-initial-boot/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "Si `curl` ne renvoie rien, le conteneur est peut-être arrêté : `docker ps -a` montre l'état, et `docker logs verdi` dit ce qu'il s'est passé.",
        "`docker update` change un paramètre d'un conteneur existant, sans le recréer. C'est plus rapide que tout refaire, et ça marche ici.",
        "Une politique `always` redémarre même quand tu as arrêté le conteneur à la main. `unless-stopped` respecte ton arrêt : c'est ce qu'on veut en TP.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm2-04-run-d',
          kind: 'mcq',
          prompt: 'Que fait l\'option `-d` de `docker run` ?',
          choices: [
            'Elle détache le conteneur : il continue après la fermeture du terminal',
            'Elle démarre le conteneur en mode débogage',
            'Elle télécharge l\'image avant de lancer',
            'Elle supprime le conteneur à l\'arrêt',
          ],
          answer: 0,
          explanation: "`-d` est l'abréviation de `--detach`. Sans lui, le terminal reste occupé tant que le conteneur tourne — et le fermer peut l'arrêter.",
          required: true,
        },
        {
          id: 'm2-04-restart',
          kind: 'mcq',
          prompt: 'Après `sudo systemctl restart docker`, un conteneur lancé sans politique de redémarrage :',
          choices: [
            'disparaît, parce que Docker ne le redémarre pas tout seul',
            'redémarre automatiquement',
            'reste arrêté mais garde ses données',
            'passe en statut `Exited (0)`',
          ],
          answer: 0,
          explanation: "La politique par défaut est `no`. C'est le piège classique du déploiement : tout fonctionne, jusqu'à la première mise à jour de la machine.",
          required: true,
        },
        {
          id: 'm2-04-incompatibilite',
          kind: 'boolean',
          prompt: 'On peut lancer un conteneur à la fois avec `--rm` et `--restart always` sans problème.',
          answer: false,
          explanation: "Non, ils se contredisent : `--rm` supprime le conteneur à l'arrêt, `--restart` le redémarre. Docker accepte la commande mais le résultat n'est pas celui qu'on croit — le conteneur finit supprimé.",
          required: true,
        },
        // La question sur `-p 8080:80` a été retirée : trois questions
        // maximum par quête, et les trois restantes portent la reclette du
        // déploiement — le détachement, la politique de redémarrage, et leur
        // incompatibilité. Le format du port est dans l'énoncé, il n'a pas
        // besoin d'être vérifié.
      ],
      solution: `\`\`\`bash
docker pull nginx:alpine
docker run -d --name verdi -p 8080:80 nginx:alpine
# -> 4f2a8b1c9d3e7a5f0b2c8d6e4a1f9b3c7d5e2a8f0b1c4d7e3a6f9b2c5d8e1a4f

docker ps
# -> CONTAINER ID  IMAGE          STATUS         PORTS
# -> 4f2a8b1c9d3e  nginx:alpine   Up 3 seconds   0.0.0.0:8080->80/tcp

curl -s http://localhost:8080 | head -3
# -> <!DOCTYPE html>
# -> <html>
# -> <head><title>Welcome to nginx!</title></head>

# Sans politique de redémarrage :
sudo systemctl restart docker
docker ps
# -> (verdi a disparu)

docker update --restart unless-stopped verdi
sudo systemctl restart docker
docker ps
# -> 4f2a8b1c9d3e  nginx:alpine  Up 2 seconds  0.0.0.0:8080->80/tcp

docker inspect verdi --format '{{.HostConfig.RestartPolicy.Name}}'
# -> unless-stopped
\`\`\``,
      teaches: ['docker run -d', '--name', 'docker update', 'RestartPolicy'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm busybox wget -qO- "https://SERVER_IP/api/secret/m2-04-initial-boot/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais expliquer à la direction de la librairie pourquoi le site se serait arrêté le jour de la mise à jour de la machine, et ce qu'il faut écrire pour l'éviter.",
    },
  ],
};