// Atelier 6 — Ne rien perdre
//
// Le jalon du chantier de la librairie : sa base de données tient les commandes
// des libraires. L'atelier 4 l'a posée dans un conteneur, et constaté que la
// base est un point de défaillance unique. Cet atelier répond à la question
// suivante : que se passe-t-il quand ce conteneur disparaît ?
//
// La réponse est « tout disparaît », et l'atelier la fait constater avant de
// la réparer. Les trois mécanisme qu'on compare sont volontairement dans cet
// ordre :
//
//   1. le système de fichiers du conteneur, qui meurt avec lui
//   2. le montage d'un dossier de la machine (bind mount)
//   3. le volume que Docker gère (named volume)
//
// La différence entre 2 et 3 est le sujet réel de l'atelier, et elle est
// contre-intuitive : le volume est plus simple à utiliser, mais il ne vit pas
// dans un endroit que l'humain peut lire.
export default {
  meta: {
    slug: 'm6-ne-rien-perdre',
    module: 6,
    title: 'Ne rien perdre',
    tagline: 'Faire survivre les données à la mort du conteneur',
    icon: '🗄️',
  },

  quests: [
    {
      id: 'm6-01-tout-disparait',
      order: 1,
      title: 'Tout disparaît',
      points: 25,
      flag: 'FLAG{EPHEMERAL_FS_CONFIRMED_DATA_LOST}',
      estMinutes: 12,
      brief: `# Tout disparaît

La base de la librairie tourne depuis l'atelier 4. L'administrateur y enregistre
des commandes. Puis il veut tester une mise à jour, et il fait ce qu'on fait
toujours :

\`\`\`bash
docker rm -f verdi-db
docker run -d --name verdi-db --network reseau-verdi redis:alpine
\`\`\`

Largement banal, et c'est le problème. **Toutes les commandes sont parties.**

**Ta mission**

1. Prépare le terrain : un réseau, et une base qui répond :

\`\`\`bash
docker network create reseau-verdi 2>/dev/null || true
docker run -d --name verdi-db --network reseau-verdi redis:alpine
\`\`\`

2. Vérifie que la base répond. \`redis-cli\` est dans l'image \`redis\` lui-même, on
   lance donc un deuxième conteneur **sur le même réseau** pour lui parler :

\`\`\`bash
docker run --rm --network reseau-verdi redis:alpine redis-cli -h verdi-db ping
\`\`\`

La réponse doit être \`PONG\`.

3. Écris quelque chose qu'on ne pourra pas refaire : le stock de la librairie au
   30 septembre.

\`\`\`bash
docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h verdi-db SET stock_septembre "1284 romans, 96 Bedford, 12 Aragon"
\`\`\`

4. Relis, pour vérifier que l'écriture a pris :

\`\`\`bash
docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h verdi-db GET stock_septembre
\`\`\`

5. **La catastrophe.** Recrée la base, comme l'administrateur l'a fait :

\`\`\`bash
docker rm -f verdi-db
docker run -d --name verdi-db --network reseau-verdi redis:alpine
docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h verdi-db GET stock_septembre
\`\`\`

6. Reprends l'inventaire. Cette fois, regarde **où** était la donnée :

\`\`\`bash
docker run --rm redis:alpine sh -c 'ls -la /data'
docker exec verdi-db sh -c 'ls -la /data'
\`\`\`

**Ce que tu observes**

- Étape 5 : la clé est vide. La donnée est perdue, définitivement. \`redis-cli\`
  ne répond pas « elle n'existe pas » avec une erreur : il répond avec une chaîne
  vide, ce qui est beaucoup plus difficile à détecter.
- Étape 6 : le dossier \`/data\` du conteneur neuf est vide. Les données du
  conteneur précédent ont disparu avec lui.

**Pourquoi c'est le comportement normal**

Le système de fichiers d'un conteneur est **éphémère** : il appartient au
conteneur, et il meurt avec lui. C'est ce qui rend un conteneur reproductible : il
repart toujours de l'image, jamais d'un état précédent.

Le reversement est évident, et c'est le sujet de cet atelier : **un conteneur ne
doit pas porter de données**. Il porte un service. Les données vivent ailleurs.

**Ce que ça change pour la librairie**

Le stock du 30 septembre est perdu. Il faudra le ressaisir. C'est le coût réel de
la migration, et il vaut mieux l'apprendre sur une base de test que le jour de la
mise en production.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m6-01-tout-disparait/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "Redis ne répond pas par une erreur quand une clé n'existe pas : il répond avec une chaîne vide. C'est pour ça que la perte passe inaperçue.",
        "`redis-cli -h verdi-db` parle **depuis un autre conteneur**. Sans `--network reseau-verdi`, il ne trouve pas la base.",
        "Le dossier `/data` est celui où Redis écrit. Un conteneur neuf repart de l'image, donc `/data` est recréé vide.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm6-01-ephemere',
          kind: 'mcq',
          prompt: 'Que se passe-t-il des données écrites dans un conteneur quand celui-ci est supprimé puis recréé ?',
          choices: [
            'Elles sont perdues : le système de fichiers appartient au conteneur',
            'Elles survivent dans l\'image',
            'Elles sont copiées dans le nouveau conteneur',
            'Elles sont mises en attente par Docker',
          ],
          answer: 0,
          explanation: "Le système de fichiers est éphémère, c'est ce qui rend le conteneur reproductible. La contrepartie est qu'un conteneur ne doit porter aucune donnée : il porte un service.",
          required: true,
        },
        {
          id: 'm6-01-detection',
          kind: 'boolean',
          prompt: 'Une base de données répond « clé absente » par une erreur visible, ce qui rend la perte détectable.',
          answer: false,
          explanation: "Faux, et c'est ce qui rend la catastrophe insidieuse. Redis répond avec une chaîne vide, sans erreur. Une perte de données peut passer des semaines sans lever d'alerte.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
docker network create reseau-verdi 2>/dev/null || true
docker run -d --name verdi-db --network reseau-verdi redis:alpine

docker run --rm --network reseau-verdi redis:alpine redis-cli -h verdi-db ping
# -> PONG

docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h verdi-db SET stock_septembre "1284 romans, 96 Bedford, 12 Aragon"
# -> OK

docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h verdi-db GET stock_septembre
# -> "1284 romans, 96 Bedford, 12 Aragon"

docker rm -f verdi-db
docker run -d --name verdi-db --network reseau-verdi redis:alpine

docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h verdi-db GET stock_septembre
# -> ""            (chaîne vide, pas une erreur : la donnée est perdue)

docker run --rm redis:alpine sh -c 'ls -la /data'
# -> (vide : image fraîche)
docker exec verdi-db sh -c 'ls -la /data'
# -> (vide : le conteneur neuf n'a jamais vu les données)
\`\`\``,
      teaches: ['système de fichiers éphémère', 'docker rm', 'docker exec', 'perte de données'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m6-01-tout-disparait/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais dire où une donnée doit vivre pour survivre à la suppression de son conteneur.",
    },

    {
      id: 'm6-02-le-dossier-partage',
      order: 2,
      title: 'Le dossier partagé',
      points: 25,
      flag: 'FLAG{BIND_MOUNT_DATA_SURVIVES_RECREATE}',
      estMinutes: 15,
      brief: `# Le dossier partagé

La solution la plus évidente : si le conteneur meurt, que les données vivent
dans un dossier **de la machine**, hors du conteneur. C'est un montage, et c'est
la première des deux solutions.

**Ta mission**

1. Prépare un dossier de données sur la machine, **en dehors** de tout
   conteneur :

\`\`\`bash
docker rm -f verdi-db 2>/dev/null
mkdir -p ~/verdi-donnees
ls -la ~/verdi-donnees
\`\`\`

Il est vide. Ce vide est important : on va y voir apparaître des fichiers qui
n'ont pas été créés par un programme de la machine.

2. Lance la base en montant ce dossier à la place de son \`/data\` interne. L'option
   \`-v\` prend la **source** puis la **destination** :

\`\`\`bash
docker run -d --name verdi-db --network reseau-verdi \\
  -v ~/verdi-donnees:/data \\
  redis:alpine
\`\`\`

3. Écris, comme à la quête précédente :

\`\`\`bash
docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h verdi-db SET stock_septembre "1284 romans, 96 Bedford, 12 Aragon"
\`\`\`

4. **Regarde la machine, pas le conteneur.** Le dossier doit contenir un fichier
   que rien n'a créé sur cette machine :

\`\`\`bash
ls -la ~/verdi-donnees
\`\`\`

5. Teste la continuité. Détruis le conteneur, recrée-le **exactement pareil**,
   et relis :

\`\`\`bash
docker rm -f verdi-db
docker run -d --name verdi-db --network reseau-verdi \\
  -v ~/verdi-donnees:/data \\
  redis:alpine
docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h verdi-db GET stock_septembre
\`\`\`

**Ce que tu observes**

- Étape 4 : des fichiers apparaissent dans \`~/verdi-donnees\`. Ils ont été écrits
  par un processus du conteneur, dans le système de fichiers de la machine.
- Étape 5 : la donnée est **revenue**. Le conteneur a disparu, son contenu non.

**Ce que c'est, exactement**

Un montage *bind* : Docker ne fait pas une copie, il **branche** un dossier de
la machine dans celui du conteneur. Ce que le conteneur écrit là-bas, la machine
le voit immédiatement. Et l'inverse.

**Ce que ça permet, et ce que ça complique**

- Un fichier écrit dans le volume est lisible par n'importe quel programme de la
  machine, avec les outils habituels. On peut **sauvegarder** le dossier avec les
  commandes qu'on connaît déjà.
- Mais : le dossier appartient à l'utilisateur qui l'a créé, et le conteneur
  tourne souvent en **root**. On se retrouve avec des fichiers écrits par root,
  illisibles ou non modifiables ensuite — c'est le souci des permissions, sujet
  de la quête suivante.

**Bon à retenir**

Le montage est la solution quand les données doivent être **lisibles par la
machine** : un fichier de configuration, une base qu'on veut sauvegarder avec ses
propres outils. C'est le choix de l'administration de la librairie.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m6-02-le-dossier-partage/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "`-v source:destination`, la source en premier. La source est un chemin de la **machine** ; la destination est un chemin **dans le conteneur**.",
        "`ls -la ~/verdi-donnees` se lance depuis ta machine, pas depuis le conteneur. C'est tout l'intérêt du montage : les deux voient le même dossier.",
        "Si les données ne reviennent pas à l'étape 5, vérifie que la source est **identique** au recréer. Un chemin différent, un autre dossier, donc une autre base vide.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm6-02-bind',
          kind: 'mcq',
          prompt: 'Que fait réellement le montage `-v ~/donnees:/data` ?',
          choices: [
            'Il branche un dossier de la machine dans celui du conteneur',
            'Il copie le dossier dans le conteneur au démarrage',
            'Il crée un volume que Docker gère',
            'Il synchronise les deux systèmes de fichiers',
          ],
          answer: 0,
          explanation: "C'est un branchement, pas une copie. C'est ce qui rend la continuité immédiate — et ce qui explique qu'une écriture dans le conteneur se voie depuis la machine, sans délai.",
          required: true,
        },
        {
          id: 'm6-02-usage',
          kind: 'mcq',
          prompt: 'Quand choisir un montage de dossier plutôt qu\'un volume nommé ?',
          choices: [
            'Quand les données doivent rester lisibles par la machine, pour les sauvegarder',
            'Quand on veut de meilleures performances',
            'Quand le conteneur doit être jetable',
            'Quand on veut éviter les permissions',
          ],
          answer: 0,
          explanation: "Le dossier est un dossier : on le sauvegarde, on le lit, on le modifie avec les outils habituels. Le volume, lui, est géré par Docker et n'est pas directement lisible.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
docker rm -f verdi-db
mkdir -p ~/verdi-donnees
ls -la ~/verdi-donnees
# -> total 8     (vide)

docker run -d --name verdi-db --network reseau-verdi \\
  -v ~/verdi-donnees:/data redis:alpine

docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h verdi-db SET stock_septembre "1284 romans, 96 Bedford, 12 Aragon"
# -> OK

ls -la ~/verdi-donnees
# -> total 12
# -> drwxr-xr-x 2 root root 4096 … .
# -> -rw-r--r-- 1 root root  205 … dump.rdb   <- écrit par le conteneur !

docker rm -f verdi-db
docker run -d --name verdi-db --network reseau-verdi \\
  -v ~/verdi-donnees:/data redis:alpine

docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h verdi-db GET stock_septembre
# -> "1284 romans, 96 Bedford, 12 Aragon"   (revenu)

docker rm -f verdi-db
\`\`\`

Note les permissions : \`root root\`. Redis tourne en root dans son conteneur, et
écrit donc des fichiers root sur ta machine. C'est le problème de la quête
suivante.`,
      teaches: ['bind mount', 'option -v', 'sauvegarde par la machine', 'permissions', 'propriétaire root'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m6-02-le-dossier-partage/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais dire ce que le conteneur a écrit dans ton dossier, et pourquoi tu ne peux pas le modifier ensuite.",
    },

    {
      id: 'm6-03-qui-ecrit-ces-fichiers',
      order: 3,
      title: 'Qui écrit ces fichiers ?',
      points: 50,
      flag: 'FLAG{USER_MAPPING_FIXES_PERMISSIONS}',
      estMinutes: 15,
      brief: `# Qui écrit ces fichiers ?

À la quête précédente, la base a écrit dans \`~/verdi-donnees\` un fichier qui
appartient à **root**. L'administrateur ne peut plus l'ouvrir, ni le sauvegarder
avec ses outils. Sur une machine de TP, ça devient vite un mur : le fichier est
là, et on n'y touche plus.

**Ta mission**

1. Reproduis le problème. Tu vas avoir besoin d'un fichier qui ne t'appartient
   pas, parce que le dossier est déjà à root :

\`\`\`bash
ls -la ~/verdi-donnees
touch ~/verdi-donnees/essai
\`\`\`

La commande échoue. **Lis bien le message** : il dit qui possède le dossier, et
ce que tu devrais faire.

2. Deux solutions, et la première est la mauvaise.

   *La mauvaise* : \`sudo chown\` sur tous les fichiers. Ça marche… jusqu'à la
   prochaine recréation du conteneur, où de nouveaux fichiers root apparaissent.

   *La bonne* : dire au conteneur **sous quel utilisateur** il doit écrire. Une
   seule option, à la création :

\`\`\`bash
docker rm -f verdi-db
docker run -d --name verdi-db --network reseau-verdi \\
  --user 1000:1000 \\
  -v ~/verdi-donnees:/data \\
  redis:alpine
\`\`\`

3. Recrée les données et regarde **qui** possède maintenant les fichiers :

\`\`\`bash
docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h verdi-db SET stock_octobre "1190 romans, 88 Sollers, 14 Blasis"
ls -la ~/verdi-donnees
\`\`\`

Le propriétaire n'est plus root.

4. Vérifie de l'intérieur du conteneur que tout est cohérent :

\`\`\`bash
docker exec verdi-db id
\`\`\`

**Ce que tu observes**

- Étape 1 : le message d'erreur nomme le propriétaire du dossier. Il ne dit
  pas « root », il donne le numéro qu'il faut utiliser.
- Étape 2 : avec \`--user 1000:1000\`, le conteneur écrit sous l'identifiant de
  l'utilisateur courant. C'est le même numéro que celui affiché par \`id\` sur ta
  machine.
- Étape 4 : \`id\` dans le conteneur affiche \`uid=1000\` — et non 0. Le conteneur
  n'est pas root chez toi.

**Ce que ça change**

Un fichier écrit par un programme dans un montage appartient à l'utilisateur que
le programme **pretend** être. L'option \`--user\` ne change pas ce que le programme
fait : elle change l'identité avec laquelle il s'exprime dans le système de
fichiers partagé.

**Le réflexe à prendre**

Avant de monter un dossier dans un conteneur, regarde son propriétaire, et passe
le bon \`--user\`. Trois secondes qui évitent un fichier inaccessible.

**Note pour plus tard**

Il existe une option \`--user\` et un mot-clé \`:ro\` déjà rencontré à l'atelier 3.
On peut aussi dire à Docker de donner automatiquement les bonnes permissions au
montage, sans passer par \`--user\`. C'est ce que fait l'option \`--mount\` avec
certaines options — sujet de la quête suivante.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m6-03-qui-ecrit-ces-fichiers/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "L'utilisateur courant se lit simplement : `id -u` sur la machine. C'est ce nombre qu'il faut passer à `--user`.",
        "`--user` prend deux nombres séparés par deux-points : `uid:gid`. Le premier suffit souvent, le second évite des surprises sur les groupes.",
        "`docker exec verdi-db id` affiche l'identité **du conteneur**. Si elle est `uid=0`, le conteneur est root — et c'est ce que tu voulais éviter.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm6-03-user',
          kind: 'mcq',
          prompt: 'Que fait l\'option `--user 1000:1000` au lancement d\'un conteneur ?',
          choices: [
            'Le conteneur s\'exécute avec cet uid et ce gid',
            'Elle change les permissions du dossier monté',
            'Elle donne des droits administrateur au conteneur',
            'Elle force le conteneur à tourner en root',
          ],
          answer: 0,
          explanation: "C'est une identité d'exécution. Les fichiers écrits dans un montage seront donc à l'utilisateur 1000 — celui de l'administrateur — au lieu de root.",
          required: true,
        },
        {
          id: 'm6-03-chown',
          kind: 'boolean',
          prompt: 'Un `sudo chown -R` sur les fichiers du dossier est une bonne solution durable au problème de permissions.',
          answer: false,
          explanation: "Faux : ça marche jusqu'à la recréation du conteneur, où de nouveaux fichiers root réapparaissent. `--user` règle la cause, pas seulement les symptômes.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
ls -la ~/verdi-donnees
# -> -rw-r--r-- 1 root root  205 … dump.rdb

touch ~/verdi-donnees/essai
# -> touch: cannot touch '/home/dieu/verdi-donnees/essai': Permission denied

id -u
# -> 1000

docker rm -f verdi-db
docker run -d --name verdi-db --network reseau-verdi \\
  --user 1000:1000 \\
  -v ~/verdi-donnees:/data \\
  redis:alpine

docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h verdi-db SET stock_octobre "1190 romans, 88 Sollers, 14 Blasis"
# -> OK

ls -la ~/verdi-donnees
# -> -rw-r--r-- 1 dieudieu dieudieu 205 … dump.rdb   <- à toi

touch ~/verdi-donnees/essai
# -> (ça marche)

docker exec verdi-db id
# -> uid=1000(dieu) gid=1000(dieu) groups=1000(dieu)

docker rm -f verdi-db
\`\`\``,
      teaches: ['option --user', 'uid', 'gid', 'problème de permissions', 'chown insuffisant'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m6-03-qui-ecrit-ces-fichiers/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais dire pourquoi un dossier monté se remplit de fichiers que tu ne peux pas ouvrir, et quelle option règle ça à la source.",
    },

    {
      id: 'm6-04-le-volume-de-docker',
      order: 4,
      title: 'Le volume de Docker',
      points: 500,
      flag: 'FLAG{VERDI_VOLUME_NAMED_DURABLE_AND_LISTED}',
      estMinutes: 20,
      brief: `# Le volume de Docker

Le montage de dossier marche, mais il a un défaut d'exploitation : les fichiers
sont écrits par l'utilisateur du conteneur, dans un dossier que la machine
n'administre pas. L'administrateur veut un volume dont **Docker** gère tout, et
qu'il puisse lister, sauvegarder et supprimer par son nom.

C'est la deuxième solution, et la dernière du chantier.

**Ta mission**

1. Compare les deux commandes. Même image, même réseau, deux_stockages :

\`\`\`bash
docker rm -f verdi-db

# Version « dossier », qui a posé problème
docker run -d --name test-dossier --network reseau-verdi \\
  --user 1000:1000 -v ~/verdi-donnees:/data redis:alpine

# Version « volume », que Docker gère
docker run -d --name test-volume --network reseau-verdi \\
  -v donnees-verdi:/data redis:alpine
\`\`\`

Le volume \`donnees-verdi\` **n'existe pas encore** : Docker le crée au premier
montage.

2. Remplis les deux, et regarde où ils ont atterri :

\`\`\`bash
docker run --rm --network reseau-verdi redis:alpine redis-cli -h test-dossier SET cle "valeur"
docker run --rm --network reseau-verdi redis:alpine redis-cli -h test-volume SET cle "valeur"

docker volume ls
docker volume inspect donnees-verdi --format '{{.Mountpoint}}'
\`\`\`

3. **La différence que l'administrateur voulait.** Le volume est un objet à part,
   avec un nom. Il se liste, il s'inspecte, il se supprime :

\`\`\`bash
docker volume ls
docker volume inspect donnees-verdi
\`\`\`

4. Teste la continuité du volume, et la disparition du conteneur :

\`\`\`bash
docker rm -f test-volume
docker run -d --name test-volume --network reseau-verdi \\
  -v donnees-verdi:/data redis:alpine
docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h test-volume GET cle
\`\`\`

5. Teste ce que tu ne veux **jamais** voir en production : supprimer le volume.
   Un \`docker volume rm\` ne demande pas confirmation.

\`\`\`bash
docker rm -f test-volume
docker volume rm donnees-verdi
docker run -d --name test-volume --network reseau-verdi \\
  -v donnees-verdi:/data redis:alpine
docker run --rm --network reseau-verdi redis:alpine \\
  redis-cli -h test-volume GET cle
\`\`\`

La clé est vide. Le volume avait été supprimé, donc il a été recréé vide.

6. La commande qui fait mal. \`prune\` supprime **tout** volume inutilisé, sans
   confirmation, sans liste :

\`\`\`bash
docker rm -f test-volume test-dossier
docker volume ls
docker volume prune
docker volume ls
\`\`\`

**Ce que tu observes**

- Étape 2 : le volume a un nom, il apparaît dans \`docker volume ls\`, et son
  \`Mountpoint\` est un chemin que Docker choisit, pas toi.
- Étape 5 : supprimer le volume, c'est supprimer les données. \`docker volume rm\`
  n'a pas de confirmation, et il n'y a pas de « à toi de vérifier ».
- Étape 6 : \`docker volume prune\` a supprimé des volumes **utilisables**. C'est la
  commande la plus dangereuse de tout Docker, et elle est dans les tutoriels.

**Ce que c'est, exactement**

Un volume est un dossier comme un autre, mais **Docker le choisit, le nomme et
le gère**. Il vit dans son propre répertoire, il a un nom, et il survit au
conteneur. En échange : on ne peut pas le lire directement avec \`ls\`, et on ne
sait pas où il est sur le disque.

**Le choix, en une phrase**

- **Dossier monté** quand les données doivent être vues et sauvegardées par la
  machine, avec les outils habituels.
- **Volume nommé** quand on veut que Docker gère, et que personne d'autre ne
  touche au stockage.

La librairie a les deux besoins : les commandes dans un volume, et les fichiers
de configuration du site dans un dossier monté. C'est courant, et c'est bien.

**Bon à retenir**

\`docker volume prune\` sans \`--volumes-used\` supprime les volumes qui ne sont pas
**actuellement montés**. Un conteneur arrêté depuis trois mois, c'est un volume
« inutilisé ». En TP, on y passe ; en production, jamais sans y avoir pensé.

**Ce que ça change pour la librairie**

La base tient enfin ses données dans un volume nommé, listable et supervisable.
Reste la question que l'atelier 4 avait ouverte : ce volume est **un seul point de
défaillance**, et il n'est toujours pas sauvegardé. Le chantier n'est pas fini.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m6-04-le-volume-de-docker/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "`docker volume ls` liste les volumes, comme `docker image ls` liste les images. Un volume a un nom, pas un chemin — c'est ce qui le distingue d'un dossier monté.",
        "`docker volume inspect nom` affiche son point de montage. Le chemin est choisi par Docker, généralement sous `/var/lib/docker/volumes/`.",
        "Après `docker volume rm`, le montage recrée un volume **vide** avec le même nom. C'est pour ça que la donnée disparaît sans qu'aucun message ne s'en plaigne.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm6-04-volume-vs-bind',
          kind: 'mcq',
          prompt: 'Quelle est la vraie différence entre un volume nommé et un dossier monté ?',
          choices: [
            'Le volume est géré par Docker : il a un nom, se liste et se supprime ; le dossier est un chemin de la machine',
            'Le volume est plus rapide',
            'Le volume ne survit pas au conteneur',
            'Le dossier est toujours en lecture seule',
          ],
          answer: 0,
          explanation: "Les deux survivent au conteneur. Ce qui diffère, c'est la gestion : le volume est un objet nommé que Docker connaît, le dossier reste un dossier de la machine, lisible et sauvegardable avec les outils habituels.",
          required: true,
        },
        {
          id: 'm6-04-prune',
          kind: 'boolean',
          prompt: '`docker volume prune` ne supprime que les volumes qui ne servent à rien.',
          answer: false,
          explanation: "Il supprime tout volume **non monté à l'instant**, sans confirmation et sans liste. Un volume d'un conteneur arrêté depuis trois mois en fait partie. C'est la commande la plus destructive de Docker.",
          required: true,
        },
        {
          id: 'm6-04-rm-silencieux',
          kind: 'mcq',
          prompt: 'Que fait `docker volume rm donnees-verdi` sur un volume utilisé par un conteneur arrêté ?',
          choices: [
            'Il supprime le volume et ses données, sans demander confirmation',
            'Il refuse, car le volume est utilisé',
            'Il supprime le volume seulement au prochain démarrage',
            'Il archive les données avant de supprimer',
          ],
          answer: 0,
          explanation: "Aucune confirmation, aucun garde-fou. Le conteneur redémarré repartira d'un volume recréé vide — et rien ne dira pourquoi les données ont disparu.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
docker rm -f verdi-db

docker run -d --name test-dossier --network reseau-verdi \\
  --user 1000:1000 -v ~/verdi-donnees:/data redis:alpine
docker run -d --name test-volume --network reseau-verdi \\
  -v donnees-verdi:/data redis:alpine

docker volume ls
# -> DRIVER    VOLUME NAME
# -> local     donnees-verdi

docker volume inspect donnees-verdi --format '{{.Mountpoint}}'
# -> /var/lib/docker/volumes/donnees-verdi/_data

docker volume inspect donnees-verdi
# -> [{ "CreatedAt": …, "Mountpoint": …, "Name": "donnees-verdi", …}]

# Continuité
docker rm -f test-volume
docker run -d --name test-volume --network reseau-verdi \\
  -v donnees-verdi:/data redis:alpine
docker run --rm --network reseau-verdi redis:alpine redis-cli -h test-volume GET cle
# -> valeur

# Suppression : silencieuse et définitive
docker rm -f test-volume
docker volume rm donnees-verdi
docker run -d --name test-volume --network reseau-verdi \\
  -v donnees-verdi:/data redis:alpine
docker run --rm --network reseau-verdi redis:alpine redis-cli -h test-volume GET cle
# -> ""       (volume recréé vide)

docker rm -f test-volume test-dossier
docker volume prune
# -> Total reclaimed space: 0B   (ou le volume resté)
\`\`\``,
      teaches: ['docker volume create', 'docker volume ls', 'docker volume inspect', 'docker volume rm', 'docker volume prune'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m6-04-le-volume-de-docker/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais choisir entre un dossier monté et un volume nommé pour un besoin donné — et nommer la commande que tu ne lanceras jamais sans y avoir pensé.",
    },
  ],
};