// Atelier 7 — Décrire la pile
//
// Dernier atelier du chantier. La librairie a sa base, son site, son réseau.
// Jusqu'ici, tout cela s'est lancé à la main, commande par commande, dans un
// terminal qu'on oublie derrière soi.
//
// Compose décrit **la pile entière** dans un fichier. C'est la dernière pièce :
// ce qui rend le déploiement transmissible à quelqu'un d'autre.
//
// L'atelier est volontairement le plus court — trois quêtes, 63 minutes. Le
// concept est unique et la syntaxe s'apprend en écrivant. Surchargé, l'atelier
// deviendrait une leçon de YAML.
//
// Et l'atelier finit sur ce qui reste à faire, parce que la migration s'arrête
// là : un volume ne fait pas une sauvegarde, et une pile décrite n'est pas
// déployée ailleurs toute seule.
//
// ── Sur la commande de récupération de cet atelier
//
// Les trois quêtes partageaient la même récupération :
//
//   docker compose up -d && sleep 3 && docker compose logs journal && …
//
// Le `sleep 3` était une course. Le service lance un `wget` en HTTPS vers le
// portail, et `logs` était lu trois secondes plus tard, quoi qu'il arrive. Sur
// ma machine : 500 ms. Sur un runner de CI, ou sur une VM d'étudiant derrière
// une connexion lente : plus de trois secondes, et les journaux sont vides —
// la quête « échoue » alors que tout a fonctionné.
//
// La CI l'a attrapé : `n°25`, `n°26` et `n°27` en échec le même jour, pour la
// même raison. Ce n'était pas un défaut du portail, et le rapport ne le disait
// pas — il affichait les deux dernières lignes de stderr, c'est-à-dire le
// démontage du réseau.
//
// La commande attend maintenant la fin du conteneur, ce que `compose up <service>`
// fait déjà en attaché : la commande se termine quand le service se termine.
// Un `sleep` est une hypothèse sur la vitesse d'un réseau ; ce n'en est pas
// une sur la fin d'un processus. Les `;` avant `logs` et `down` garantissent
// le ménage même en cas d'échec — sans quoi un réseau nommé reste pris et la
// quête suivante échoue pour une raison étrangère.
//
// Le `logs` qui suit n'est pas inutile : il montre que la sortie de `up` et les
// journaux sont la même chose.
export default {
  meta: {
    slug: 'm7-decrire-la-pile',
    module: 7,
    title: 'Décrire la pile',
    tagline: 'Toute la librairie dans un fichier, puis la piloter',
    icon: '🧾',
  },

  quests: [
    {
      id: 'm7-01-un-seul-fichier',
      order: 1,
      title: 'Un seul fichier',
      points: 50,
      flag: 'FLAG{COMPOSE_FILE_VALIDATED_BEFORE_RUN}',
      estMinutes: 18,
      brief: `# Un seul fichier

Depuis l'atelier 4, la librairie a deux services. Pour les lancer, on a tapé :

\`\`\`bash
docker network create reseau-verdi
docker run -d --name verdi-db --network reseau-verdi -v donnees-verdi:/data redis:alpine
docker run -d --name verdi --network reseau-verdi -p 8080:80 nginx:alpine
\`\`\`

Trois lignes. Mais dans quel ordre, avec quel réseau, quel volume, quel port ? Si
l'administrateur doit reconstruire ça dans six mois sur une machine neuve, il
n'a rien sous la main.

Compose écrit la description **dans un fichier**. Un fichier qu'on relit, qu'on
versionne, et qu'on peut transmettre.

**Ta mission**

1. Vérifie que Compose est présent. Il est venu avec l'installation de l'atelier 1,
   sous le nom \`docker-compose-plugin\` :

\`\`\`bash
docker compose version
\`\`\`

2. Prépare le projet. Le fichier peut s'appeler \`compose.yaml\` ou
   \`docker-compose.yml\` — les deux marchent. On va écrire la pile **de la
   librairie**, pas un exemple :

\`\`\`bash
mkdir -p ~/verdi-pile && cd ~/verdi-pile
cat > compose.yaml <<'EOF'
services:
  db:
    image: redis:alpine
    container_name: verdi-db
    volumes:
      - donnees-verdi:/data

  web:
    image: nginx:alpine
    container_name: verdi
    ports:
      - "8080:80"

volumes:
  donnees-verdi:
EOF
\`\`\`

3. **Valide avant de lancer.** C'est le geste le plus important de l'atelier :

\`\`\`bash
docker compose config
\`\`\`

La commande affiche la pile telle que Docker l'a comprise. Lis-la : services,
volumes, ports. Si une faute de frappe s'y glisse, tu le vois ici.

4. Vérifie que Compose n'a **rien** lancé. Un fichier décrit, il n'exécute pas :

\`\`\`bash
docker compose ls
docker ps
\`\`\`

5. **L'instruction manquante.** Deux services doivent se joindre par leur nom,
   et Compose ne le fait que si tu le dis. Ajoute la dépendance :

\`\`\`bash
cat > compose.yaml <<'EOF'
services:
  db:
    image: redis:alpine
    container_name: verdi-db
    volumes:
      - donnees-verdi:/data

  web:
    image: nginx:alpine
    container_name: verdi
    ports:
      - "8080:80"
    networks:
      - verdi
    depends_on:
      - db

networks:
  verdi:

volumes:
  donnees-verdi:
EOF
docker compose config --quiet && echo "fichier valide"
\`\`\`

6. Relis ce que Compose a compris, et cherche une chose en particulier : le nom
   du réseau. Compose en a créé un, qui n'existait pas.

**Ce que tu observes**

- Étape 3 : \`docker compose config\` affiche toute la pile sans rien lancer. C'est
  le garde-fou : une faute est visible avant qu'elle ne coûte.
- Étape 4 : \`docker compose ls\` ne liste rien, \`docker ps\` ne montre pas les
  conteneurs. Le fichier **décrit**, il ne fait rien.
- \`config\` affiche un réseau \`verdi_pile_verdi\` — un nom que tu n'as jamais écrit,
  construit à partir du nom du projet et du réseau déclaré.

**Bon à retenir**

- \`depends_on\` décrit un **ordre de démarrage**, pas une disponibilité. La base
  peut ne pas encore accepter de connexions quand le site se lève. C'est un
  point que la plupart des déploiements glossent.
- Dans Compose v2, la ligne \`version:\` est inutile — elle est même signalée comme
  obsolète. Ne la recopie pas depuis de vieux tutoriels.
- \`environment:\` accepte deux écritures, \`MOT: valeur\` et \`MOT=valeur\`. Compose
  normalise les deux.

**Ton mot de passe**

Un service Compose peut aller chercher le mot de passe dans ses propres
journaux — c'est ce que fait la commande ci-dessous :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
mkdir -p /tmp/atelier-m7 && cd /tmp/atelier-m7 && printf '%s\\n' 'services:' '  journal:' '    image: alpine' "    command: wget -qO- https://SERVER_IP/api/secret/m7-01-un-seul-fichier/raw?token=$ARENA_TOKEN" > compose.yaml
docker compose up journal; docker compose logs journal; docker compose down
\`\`\`

Le mot de passe s'affiche dans les journaux de la pile.`,
      hints: [
        "L'indentation est la syntaxe de YAML : deux espaces par niveau. Une tabulation, ou un espace manquant, fait échouer `docker compose config` avec un message qui indique la ligne.",
        "`docker compose config` se lance depuis le répertoire qui contient le fichier. Sinon Docker ne trouve rien à décrire.",
        "`depends_on:` prend une liste de services, avec un `-` devant chacun. C'est un ordre de démarrage, pas une attente de disponibilité.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm7-01-decrire',
          kind: 'mcq',
          prompt: 'Que fait un fichier `compose.yaml` ?',
          choices: [
            'Il décrit la pile, sans rien lancer',
            'Il lance la pile dès qu\'il est écrit',
            'Il construit les images manquantes',
            'Il remplace le Dockerfile',
          ],
          answer: 0,
          explanation: "Un fichier Compose décrit. Rien ne tourne tant que tu n'as pas demandé `up`. C'est ce qui permet de relire et de corriger avant de lancer quoi que ce soit.",
          required: true,
        },
        {
          id: 'm7-01-depends',
          kind: 'mcq',
          prompt: 'Que garantit `depends_on` entre deux services ?',
          choices: [
            'Un ordre de démarrage, pas que le service soit prêt',
            'Que le second attend que le premier accepte les connexions',
            'Que le second ne démarre jamais si le premier échoue',
            'Rien : c\'est décoratif',
          ],
          answer: 0,
          explanation: "C'est l'erreur la plus fréquente sur Compose. `depends_on` ordonne le démarrage et rien d'autre : le service peut être lancé et pas encore prêt. Les vraies attentes se déclarent dans les `healthcheck`.",
          required: true,
        },
        {
          id: 'm7-01-version',
          kind: 'boolean',
          prompt: 'Dans Compose v2, la ligne `version: \"3.8\"` est encore utile.',
          answer: false,
          explanation: "Non, elle est signalée comme obsolète. Compose v2 lit le format directement ; la ligne est ignorée, et les vieux tutoriels qui la proposent vous font perdre une ligne.",
          required: false,
        },
      ],
      solution: `\`\`\`bash
docker compose version
# -> Docker Compose version v5.1.0

mkdir -p ~/verdi-pile && cd ~/verdi-pile
cat > compose.yaml <<'EOF'
services:
  db:
    image: redis:alpine
    container_name: verdi-db
    volumes:
      - donnees-verdi:/data

  web:
    image: nginx:alpine
    container_name: verdi
    ports:
      - "8080:80"
    networks:
      - verdi
    depends_on:
      - db

networks:
  verdi:

volumes:
  donnees-verdi:
EOF

docker compose config
# -> name: verdi-pile
# -> services:
# ->   db:
# ->     volumes:
# ->       - type: volume
# ->         source: donnees-verdi
# ->         target: /data
# ->   web:
# ->     networks:
# ->       verdi: {}
# ->     ports:
# ->       - mode: ingress
# ->         target: 80
# ->         published: "8080"
# ->     depends_on:
# ->       db:
# ->         condition: service_started
# -> networks:
# ->   verdi:
# ->     name: verdi-pile_verdi

docker compose ls
# -> (rien : le fichier décrit, il ne lance pas)
\`\`\`

\`verdi-pile_verdi\` est le nom du réseau : le nom du projet, un tiret bas, puis le
réseau déclaré. Compose l'a inventé, et il le recyclera tel quel.`,
      teaches: ['docker compose version', 'docker compose config', 'compose.yaml', 'clé services', 'depends_on'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
mkdir -p /tmp/atelier-m7 && cd /tmp/atelier-m7 && printf '%s\\n' 'services:' '  journal:' '    image: alpine' "    command: wget -qO- https://SERVER_IP/api/secret/m7-01-un-seul-fichier/raw?token=$ARENA_TOKEN" > compose.yaml
docker compose up journal; docker compose logs journal; docker compose down`,
      checkpoint: "Tu as compris quand tu sais dire ce que `depends_on` ne garantit pas — et pourquoi `config` se lance avant `up`.",
    },

    {
      id: 'm7-02-piloter-la-pile',
      order: 2,
      title: 'Piloter la pile',
      points: 50,
      flag: 'FLAG{COMPOSE_UP_PS_LOGS_READ_SITE}',
      estMinutes: 16,
      brief: `# Piloter la pile

Le fichier est écrit. Maintenant on le fait vivre, et surtout on le **pilote** sans
connaître les commandes de la semaine passée.

**Ta mission**

1. Lance toute la pile d'un coup. \`up\` veut dire « monte » :

\`\`\`bash
cd ~/verdi-pile
docker compose up -d
docker compose ps
\`\`\`

2. Vérifie que les **deux** services tournent, et pas seulement celui du site :

\`\`\`bash
docker compose ps
curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8080
\`\`\`

3. Lis les journaux de toute la pile, puis d'un service seul. L'option \`-f\`
   suit en direct — c'est l'équivalent de \`docker logs -f\` :

\`\`\`bash
docker compose logs
docker compose logs db
docker compose logs -f --tail 5
\`\`\`

4. Entre dans un service **de la pile**, sans \`docker exec\` :

\`\`\`bash
docker compose exec web sh
\`\`\`

Vérifie depuis l'intérieur que la base est joignable par son nom, puis sors :

\`\`\`bash
docker compose exec web sh -c 'ping -c 1 db'
\`\`\`

5. Arrête **le site** sans toucher à la base, et regarde ce que Compose fait :

\`\`\`bash
docker compose stop web
docker compose ps
docker compose start web
\`\`\`

6. Et pour finir : qu'est-ce que \`down\` ne fait **pas** ? Prédis la réponse, puis
   vérifie :

\`\`\`bash
docker compose down
docker volume ls
\`\`\`

Le volume \`donnees-verdi\` est-il encore là ?

**Ce que tu observes**

- Étape 1 : deux conteneurs montent. \`up -d\` les détache, comme \`docker run -d\`.
- Étape 3 : \`docker compose logs\` sans nom affiche **tous** les services, ce qui
  est exactement l'intérêt — le diagnostic est dans un seul endroit.
- Étape 4 : \`exec\` prend le **nom du service**, pas le nom du conteneur. Le fichier
  fait l'abstraction.
- Étape 6 : \`down\` arrête et supprime les conteneurs et les réseaux du projet. Il
  **ne touche pas** aux volumes nommés. C'est la raison pour laquelle tes
  données sont encore là.

**Bon à retenir**

\`docker compose down -v\` supprime les volumes. Cette lettre \`-v\` est la seule
difference entre « je redeploie » et « je repars de zéro ». Ne l'écrivez jamais
sans y avoir pensé.

**Et le vrai réflexe**

Un déploiement, c'est trois commandes et un fichier. \`config\` pour vérifier,
\`up -d\` pour monter, \`logs\` pour regarder. Le reste est de la curiosity.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
mkdir -p /tmp/atelier-m7b && cd /tmp/atelier-m7b && printf '%s\\n' 'services:' '  journal:' '    image: alpine' "    command: wget -qO- https://SERVER_IP/api/secret/m7-02-piloter-la-pile/raw?token=$ARENA_TOKEN" > compose.yaml
docker compose up journal; docker compose logs journal; docker compose down
\`\`\``,
      hints: [
        "`docker compose ps` affiche une ligne par service, avec son état. C'est l'équivalent de `docker ps` pour toute la pile.",
        "`docker compose logs` sans nom affiche tous les services. C'est ce qui fait gagner du temps en cas de panne : un seul endroit à regarder.",
        "Après `docker compose down`, un `docker compose up -d` reconstruit tout. Les volumes restent, donc les données aussi — sauf si tu as ajouté `-v`.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      // Pas de `recall` : `down` est écrit dans l'énoncé. La règle de l'atelier
      // est constante — le réflexe ne vaut que là où l'élève doit retrouver, et
      // dans un atelier où toutes les commandes sont données, il n'y a rien à
      // retrouver.
      check: [
        {
          id: 'm7-02-down',
          kind: 'mcq',
          prompt: 'Que fait `docker compose down` ?',
          choices: [
            'Il arrête et supprime les conteneurs et les réseaux, mais garde les volumes',
            'Il arrête tout, y compris les données',
            'Il arrête un seul service',
            'Il relance la pile à jour',
          ],
          answer: 0,
          explanation: "C'est ce qui rend le redéploiement possible sans perdre les données. Le `-v` est la seule différence entre « je redeploie » et « je repars de zéro ».",
          required: true,
        },
        {
          id: 'm7-02-exec',
          kind: 'boolean',
          prompt: '`docker compose exec` utilise le nom du service, pas le nom du conteneur.',
          answer: true,
          explanation: "Vrai. C'est tout l'intérêt du fichier : on ne manipule plus de conteneurs nommés, mais des services décrits. Le nom du service suffit, et le reste est de l'abstraction.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
cd ~/verdi-pile

docker compose up -d
# -> Container verdi-db   Created
# -> Container verdi      Created
# -> Network verdi-pile_verdi  Created
# -> Container verdi-db   Started
# -> Container verdi      Started

docker compose ps
# -> NAME       IMAGE           STATUS
# -> verdi-db   redis:alpine    Up 2 seconds
# -> verdi      nginx:alpine    Up 2 seconds

curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8080
# -> 200

docker compose logs
# -> verdi-db 1:1 ... * Ready to accept connections
# -> verdi    1:1 ... start worker processes

docker compose logs db
# -> verdi-db 1:1 ... * Ready to accept connections

docker compose exec web sh -c 'ping -c 1 db'
# -> PING db (172.19.0.2): 56 data bytes
# -> 64 bytes from 172.19.0.2: seq=0 ttl=64 time=0.089 ms

docker compose stop web
docker compose ps
# -> verdi-db  Up 30 seconds
# -> verdi     Exited (0)
docker compose start web
# -> verdi  Started

docker compose down
# -> Container verdi      Removed
# -> Container verdi-db   Removed
# -> Network verdi-pile_verdi  Removed

docker volume ls
# -> DRIVER    VOLUME NAME
# -> local     donnees-verdi     <- toujours là : les données ont survécu
\`\`\``,
      teaches: ['docker compose up', 'docker compose ps', 'docker compose logs', 'docker compose exec', 'docker compose down'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
mkdir -p /tmp/atelier-m7b && cd /tmp/atelier-m7b && printf '%s\\n' 'services:' '  journal:' '    image: alpine' "    command: wget -qO- https://SERVER_IP/api/secret/m7-02-piloter-la-pile/raw?token=$ARENA_TOKEN" > compose.yaml
docker compose up journal; docker compose logs journal; docker compose down`,
      checkpoint: "Tu as compris quand tu sais dire ce que `down` laisse en place, et quelle lettre rend cette commande irréversible.",
    },

    {
      id: 'm7-03-recuperer-une-pile-entiere',
      order: 3,
      title: 'Récupérer une pile entière',
      points: 600,
      flag: 'FLAG{VERDI_PILE_RECOVERED_ON_CLEAN_MACHINE}',
      estMinutes: 20,
      brief: `# Récupérer une pile entière

Dernier jalon du chantier. L'administrateur part en vacances, et la machine de
la librairie **meurt** : disque mort, ou réinstallation complète.

Il ne garde qu'une chose : les deux fichiers texte. Tout le reste — la base, le
site, le réseau, les conteneurs — disparaît avec la machine.

La question du jour : **peut-on tout retrouver ?**

**Ta mission**

1. Récupère la pile depuis la machine neuve. Un seul fichier à recopier :

\`\`\`bash
mkdir -p ~/verdi-pile && cd ~/verdi-pile
cp ~/compose-bien-sauvegarde.yaml compose.yaml
\`\`\`

2. Regarde ce qui existe déjà sur cette machine : des conteneurs qui tournent,
   que personne ne sait expliquer.

\`\`\`bash
docker compose ls
docker ps -a
\`\`\`

3. Vérifie le fichier, puis monte la pile :

\`\`\`bash
docker compose config --quiet && echo "valide"
docker compose up -d
docker compose ps
\`\`\`

4. **La démonstration.** Coupe tout, et reconstruis depuis le seul fichier :

\`\`\`bash
docker compose down
docker ps -a
docker compose up -d
docker compose ps
\`\`\`

Deux conteneurs sont apparus, avec le bon réseau, le bon port, et le bon
volume. Aucune commande de \`docker run\` n'a été tapée.

5. Teste que les données ont bien survécu au cycle. Écris, coupe, reconstruis,
   relis :

\`\`\`bash
docker compose exec db redis-cli SET cle "la librairie tient debout"
docker compose down
docker compose up -d
docker compose exec db redis-cli GET cle
\`\`\`

**Ce que tu observes**

- Étape 3 : \`config\` valide avant de lancer, comme à la quête 1. Le garde-fou ne
  prend pas de vacances.
- Étape 4 : la pile **revient à l'identique** après un \`down\`. C'est la
  définition d'un déploiement reproductible.
- Étape 5 : les données ont traversé le cycle parce qu'elles vivent dans un
  volume nommé, pas dans un conteneur.

**Ce que ça change pour la librairie**

C'est la réponse à la question posée à l'atelier 1 : « comment on fait si la
machine est morte ? ». On ne restaure pas une image, on ne copie pas des
conteneurs. On recopie **deux fichiers**, et on rejoue trois commandes.

Un déploiement tient dans un fichier versionné. C'est tout.

**Ce qui reste à faire — et c'est important**

Le chantier s'arrête ici, mais la librairie n'est pas terminée. Trois choses ne
sont pas faites, et l'élève doit les nommer :

1. **La sauvegarde.** Un volume n'est pas une sauvegarde. Il est sur la même
   machine que ce qu'il protège : si le disque meurt, le volume meurt avec.
2. **La version.** Le fichier est écrit, mais rien n'est versionné. Un
   \`git init\` et un \`git commit\` donneraient un historique des changements de
   configuration.
3. **Le HTTPS.** Le site est joignable en \`http://localhost\`, sans certificat.
   Pour le public, il faut un nom de domaine et un certificat — c'est le sujet
   d'un atelier que l'atelier 4 a préparé sans le dire.

**La phrase à retenir du chantier**

Un conteneur ne porte pas de données. Une image ne porte pas de secrets. Un
fichier ne porte pas l'état. Répartir ce qui doit survivre dans des endroits
qui survivent : c'est tout l'atelier.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
mkdir -p /tmp/atelier-m7c && cd /tmp/atelier-m7c && printf '%s\\n' 'services:' '  journal:' '    image: alpine' "    command: wget -qO- https://SERVER_IP/api/secret/m7-03-recuperer-une-pile-entiere/raw?token=$ARENA_TOKEN" > compose.yaml
docker compose up journal; docker compose logs journal; docker compose down
\`\`\``,
      hints: [
        "`docker compose ls` liste les **projets**, pas les conteneurs. Un conteneur qui tourne sans projet n'apparaît pas — c'est le premier indice du problème.",
        "Un `down` suivi d'un `up -d` dans le même répertoire reconstruit tout. C'est exactement ce qu'un redéploiement fait en production.",
        "Les données survivent parce qu'elles sont dans un volume nommé. Un dossier monté ferait la même chose ; un fichier dans le conteneur, non.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm7-03-reconstruire',
          kind: 'mcq',
          prompt: 'Après un `docker compose down` suivi d\'un `docker compose up -d`, qu\'est-ce qui a été reconstruit ?',
          choices: [
            'Tout, à partir du seul fichier : conteneurs, réseau, port et volume',
            'Rien : il faut tout retaper à la main',
            'Seulement les images',
            'Seulement les données',
          ],
          answer: 0,
          explanation: "C'est la définition d'un déploiement reproductible. Aucune commande `docker run` n'est tapée, et c'est le fichier qui décrit tout.",
          required: true,
        },
        {
          id: 'm7-03-sauvegarde',
          kind: 'boolean',
          prompt: 'Un volume nommé constitue une sauvegarde des données de la librairie.',
          answer: false,
          explanation: "Faux, et c'est la dernière chose à retenir du chantier. Le volume est sur la même machine que ce qu'il protège : si le disque meurt, il meurt avec. Il faut une copie **ailleurs**.",
          required: true,
        },
        {
          id: 'm7-03-ls',
          kind: 'mcq',
          prompt: 'Que liste `docker compose ls` ?',
          choices: [
            'Les projets Compose, c\'est-à-dire les répertoires qui contiennent un fichier',
            'Tous les conteneurs de la machine',
            'Les volumes',
            'Les images',
          ],
          answer: 0,
          explanation: "Un conteneur qui tourne sans projet Compose n'apparaît pas dans cette liste. C'est ce qui rend visible, dès la première étape, qu'une machine a perdu sa trace.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
mkdir -p ~/verdi-pile && cd ~/verdi-pile
cp ~/compose-bien-sauvegarde.yaml compose.yaml

docker compose ls
# -> (rien : la nouvelle machine ne connaît aucun projet)

docker ps -a
# -> des conteneurs sans projet : personne ne sait d'où ils viennent

docker compose config --quiet && echo "valide"
docker compose up -d
docker compose ps
# -> NAME       IMAGE           STATUS          PORTS
# -> verdi-db   redis:alpine    Up 2 seconds
# -> verdi      nginx:alpine    Up 2 seconds    0.0.0.0:8080->80/tcp

docker compose down
docker ps -a
# -> (vide)
docker compose up -d
docker compose ps
# -> les deux sont revenus, à l'identique

docker compose exec db redis-cli SET cle "la librairie tient debout"
docker compose down
docker compose up -d
docker compose exec db redis-cli GET cle
# -> "la librairie tient debout"   (le volume a survécu au cycle)

docker compose down
\`\`\``,
      teaches: ['déploiement reproductible', 'compose down', 'compose up -d', 'ce qui reste : sauvegarde, version, HTTPS'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
mkdir -p /tmp/atelier-m7c && cd /tmp/atelier-m7c && printf '%s\\n' 'services:' '  journal:' '    image: alpine' "    command: wget -qO- https://SERVER_IP/api/secret/m7-03-recuperer-une-pile-entiere/raw?token=$ARENA_TOKEN" > compose.yaml
docker compose up journal; docker compose logs journal; docker compose down`,
      checkpoint: "Tu as compris quand tu sais répondre à la question de l'atelier 1 — « et si la machine meurt ? » — en trois commandes et un fichier.",
    },
  ],
};