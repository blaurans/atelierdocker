// Atelier 5 — Figer la version
//
// Le site de la librairie tourne, mais il tourne « comme ça » : quelqu'un a
// modifié un fichier à la main, dans un conteneur, et personne ne sait
// comment reproduire ce qu'il voit. C'est le problème que les images
// reproductibles résolvent.
//
// L'atelier est construit comme une progression de moins en moins acceptable :
//
//   1. modifier un conteneur et le committer   → ça marche, c'est affreux
//   2. écrire les instructions à la main        → correct, mais opaque
//   3. écrire un Dockerfile                     → l'image reproductible
//   4. construire, versionner, distribuer       → le jalon du chantier
//
// Le point non négociable de l'atelier est écrit dans l'énoncé de la quête 1 :
// `docker commit` fonctionne, et il ne faut surtout pas l'utiliser. C'est un
// anti-pédagogie, et il faut le dire.
//
// La quête 1 garde un `recall` : le nom du fichier que `docker commit` ne prend
// pas est précisément ce que l'élève doit retrouver. C'est le seul endroit de
// l'atelier où le réflexe a du sens.
export default {
  meta: {
    slug: 'm5-figer-la-version',
    module: 5,
    title: 'Figer la version',
    tagline: 'D\'un conteneur modifié à la main à une image reproductible',
    icon: '🧪',
  },

  quests: [
    {
      id: 'm5-01-le-raccourci-qu-on-oublie',
      order: 1,
      title: 'Le raccourci qu\'on oublie',
      points: 25,
      flag: 'FLAG{COMMIT_SHORTCUT_REJECTED_ON_PURPOSE}',
      estMinutes: 13,
      brief: `# Le raccourci qu'on oublie

Il y a une commande qui répond à la question « comment je sauvegarde ce que je
vien de faire dans le conteneur ? » en une ligne. Elle est là, et elle ne
sera pas ce qu'on fera à la fin de l'atelier.

**Ta mission**

1. Reproduis le problème. Lance le site de la librairie, entre dedans, et modifie
   sa page d'accueil à la main, comme un administrateur pressé un vendredi :

\`\`\`bash
docker run -d --name brouillon nginx:alpine
docker exec -it brouillon sh
\`\`\`

À l'intérieur, écris un fichier \`index.html\` qui porte le nom de la librairie,
puis sors. Vérifie que ça marche :

\`\`\`bash
docker exec brouillon sh -c 'cat /usr/share/nginx/html/index.html'
\`\`\`

2. Sauvegarde ce conteneur sous forme d'image, avec le nom qu'il faut pour
   pouvoir revenir en arrière :

\`\`\`bash
docker commit brouillon verdi-site:nouvelle
docker images
\`\`\`

3. **Puis détruis tout**, et vérifie que tu as perdu le travail de l'étape 1 :

\`\`\`bash
docker rm -f brouillon
docker run -d --name brouillon nginx:alpine
docker exec brouillon sh -c 'cat /usr/share/nginx/html/index.html'
\`\`\`

La page est celle de Nginx, pas la tienne. Mais l'image \`verdi-site:nouvelle\`
elle, elle contient ton fichier.

4. Repars de l'image sauvegardée. L'option \`--rm\` à la création évite d'avoir à
   nettoyer :

\`\`\`bash
docker run -d --rm --name brouillon verdi-site:nouvelle
docker exec brouillon sh -c 'cat /usr/share/nginx/html/index.html'
\`\`\`

5. **Le piège.** Regarde ce que \`docker commit\` a mis dans l'image :

\`\`\`bash
docker history verdi-site:nouvelle
\`\`\`

Une seule couche, qui dit \`CMD\`. Aucune trace de la commande qui a écrit le
fichier.

**Ce que tu observes**

Le raccourci marche : ton fichier est là, il survit à la destruction du
conteneur. Et il ne marche pas, parce que personne — personne, dans six mois —
ne peut dire comment le fichier est arrivé là.

**Les trois raisons pour lesquelles c'est un anti-pédagogie**

1. **Rien n'est écrit.** L'image est un objet binaire. Pour savoir ce qu'elle
   contient, il faut lancer \`docker history\`, qui affiche \`CMD\` et rien d'autre.
2. **Ce n'est pas reproductible.** Si l'administrateur part en vacances, personne
   ne peut reconstruire cette image. Le mot « sauvegarde » est un piège : une
   image n'est pas une sauvegarde, c'est un résultat.
3. **Rien n'est vérifiable.** Aucun contrôle automatique ne peut dire si deux
   machines ont la même image. On ne peut pas dire « le serveur de préproduction
   est identique à celui de production ».

La commande s'appelle \`docker commit\`. Retiens son nom pour savoir qu'elle
existe, et pour ne pas l'utiliser.

**Bon à retenir**

Ce qu'on veut, c'est **écrire** l'image plutôt que la capturer. Un fichier texte,
versionné, relu, et qui se construit en une commande. C'est l'objet de la quête
suivante.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m5-01-le-raccourci-qu-on-oublie/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "Le message d'accueil de Nginx est dans `/usr/share/nginx/html/index.html`. C'est le fichier à écrire.",
        "`docker commit` prend le nom du conteneur en premier, puis le nom de l'image : `docker commit source destination`.",
        "`docker history` sur une image créée par commit n'affiche qu'une seule couche. C'est normal : aucune instruction n'a jamais été écrite.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm5-01-commit',
          kind: 'mcq',
          prompt: 'Quel est le défaut principal de `docker commit` ?',
          choices: [
            'Rien n\'est écrit : l\'image est un résultat, pas une description',
            'L\'image obtenue est plus grosse',
            'Elle ne fonctionne qu\'avec les images officielles',
            'Elle supprime les couches d\'origine',
          ],
          answer: 0,
          explanation: "Un `docker commit` capture un état, il ne le décrit pas. Aucune instruction n'est écrite, donc personne ne peut le refaire — et c'est ce qui rend la construction reproductible.",
          required: true,
        },
        {
          id: 'm5-01-image-sauvegarde',
          kind: 'boolean',
          prompt: '`docker commit` sert de sauvegarde : l\'image obtenue suffit à retrouver l\'état du conteneur.',
          answer: true,
          explanation: "Vrai pour « retrouver », faux pour « reproduire ». L'image contient bien le fichier — l'étape 3 le montre. Mais on ne sait pas comment le fichier y est arrivé, donc on ne peut pas le refaire sur une autre machine.",
          required: true,
        },
      ],
      recall: {
        id: 'm5-01-instruction',
        prompt: 'Quel fichier décrit les instructions de construction d\'une image, et que `docker commit` n\'écrit jamais ?',
        accept: ['Dockerfile', 'dockerfile'],
        hint: 'Un mot unique, en majuscules, sans extension. C\'est le seul fichier d\'une image Docker.',
      },
      solution: `\`\`\`bash
docker run -d --name brouillon nginx:alpine
docker exec -it brouillon sh
# /usr/share/nginx/html # echo 'Librairie Verdi' > index.html
# exit

docker exec brouillon sh -c 'cat /usr/share/nginx/html/index.html'
# -> <h1>Librairie Verdi</h1>

docker commit brouillon verdi-site:nouvelle
docker images
# -> verdi-site  nouvelle  a1b2c3d4e5f6  10 seconds ago  22.3MB

docker rm -f brouillon
docker run -d --name brouillon nginx:alpine
docker exec brouillon sh -c 'cat /usr/share/nginx/html/index.html'
# -> (la page de Nginx : le travail est perdu)

docker run -d --rm --name brouillon verdi-site:nouvelle
docker exec brouillon sh -c 'cat /usr/share/nginx/html/index.html'
# -> Librairie Verdi   (retrouvé depuis l'image)

docker history verdi-site:nouvelle
# -> IMAGE        CREATED BY   SIZE
# -> a1b2c3d4e5   CMD ["nginx" …]   22.3MB
# ->                     aucune trace du echo
\`\`\``,
      teaches: ['docker commit', 'docker rmi', 'image non reproductible', 'Dockerfile'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m5-01-le-raccourci-qu-on-oublie/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu peux expliquer à quelqu'un pourquoi une image faite par `commit` n'est pas une sauvegarde — alors qu'elle contient bien les fichiers.",
    },

    {
      id: 'm5-02-ecrire-le-dockerfile',
      order: 2,
      title: 'Écrire le Dockerfile',
      points: 25,
      flag: 'FLAG{DOCKERFILE_WRITTEN_AND_BUILT}',
      estMinutes: 17,
      brief: `# Écrire le Dockerfile

On va écrire ce que \`docker commit\` ne sait pas écrire. Un **Dockerfile** est
un fichier texte qui décrit une image, ligne par ligne. On ne le lance pas : on
le **build**.

**Ta mission**

1. Prépare un répertoire de travail et le fichier d'instructions. Commence par la
   ligne la plus importante : celle qui dit **de quoi** part l'image.

\`\`\`bash
mkdir -p ~/verdi-image && cd ~/verdi-image
cat > Dockerfile <<'EOF'
FROM nginx:alpine
EOF
\`\`\`

2. Ajoute la copie de ta page. \`COPY\` prend la source puis la destination, et la
   source est relative au fichier \`Dockerfile\` :

\`\`\`bash
cat > index.html <<'EOF'
Librairie Verdi
Commandes, romans, et du papier.
EOF
cat >> Dockerfile <<'EOF'
COPY index.html /usr/share/nginx/html/index.html
EOF
\`\`\`

3. Construis l'image. Le nom se lit \`nom:étiquette\` :

\`\`\`bash
docker build -t verdi-site:1.0 .
\`\`\`

4. Lance-la et vérifie que ta page est là, **sans** avoir touché à un conteneur :

\`\`\`bash
docker run -d --name verdi-test -p 8080:80 verdi-site:1.0
docker exec verdi-test sh -c 'cat /usr/share/nginx/html/index.html'
curl -s http://localhost:8080
\`\`\`

5. Regarde maintenant ce que \`docker history\` affiche. Compare avec l'image de
   la quête précédente :

\`\`\`bash
docker history verdi-site:1.0
\`\`\`

**Ce que tu observes**

- \`docker build\` a pris quelques secondes. Chaque instruction \`RUN\` **est**
  devenue une couche, et \`docker history\` la liste.
- La ligne \`COPY\` apparaît dans l'historique, avec le chemin de la destination.
  On lit ce que l'image a été faite.
- Le conteneur n'a jamais été modifié à la main. Il est **sorti** de l'image.

**Les trois instructions de base**

- \`FROM\` — de quoi on part. Toujours en premier.
- \`COPY\` — je mets ce fichier là. Source puis destination.
- \`RUN\` — j'exécute une commande pendant la construction. C'est celle qui crée
  des couches, et la seule qui ralentisse le build.

**Bon à retenir**

L'ordre des instructions est l'ordre d'exécution. L'ordre dans le fichier n'est
pas un détail : c'est le programme. Inverser \`COPY\` et \`RUN\` donne une image
différente.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m5-02-ecrire-le-dockerfile/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "`FROM nginx:alpine` reprend l'image que tu utilisais jusqu'ici. On ne part pas de zéro : on part de l'image d'un conteneur qui marche.",
        "`COPY` prend la source **puis** la destination, dans cet ordre. Inversé, le build échoue avec un message qui parle de « destination ».",
        "`docker build` a besoin du point final : c'est le répertoire de contexte, celui qui contient le Dockerfile. Sans lui, Docker ne sait pas où le trouver.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm5-02-from',
          kind: 'mcq',
          prompt: 'Que fait l\'instruction `FROM nginx:alpine` ?',
          choices: [
            'Elle indique de quelle image part la construction',
            'Elle télécharge le site de la librairie',
            'Elle lance le conteneur après le build',
            'Elle déclare le port du serveur',
          ],
          answer: 0,
          explanation: "`FROM` est toujours la première instruction. Elle dit de quoi on part — ici l'image officielle de Nginx, sur laquelle on ne construit qu'un fichier.",
          required: true,
        },
        {
          id: 'm5-02-copy',
          kind: 'mcq',
          prompt: 'Dans `COPY index.html /usr/share/nginx/html/index.html`, que vaut le premier chemin ?',
          choices: [
            'La source, relative au fichier Dockerfile',
            'La destination, à l\'intérieur de l\'image',
            'Le nom de l\'image à construire',
            'Le répertoire de contexte',
          ],
          answer: 0,
          explanation: "`COPY source destination`, dans cet ordre. La source est relative au fichier Dockerfile, donc elle est toujours lisible sans se demander où l'on est.",
          required: true,
        },
        {
          id: 'm5-02-contexte',
          kind: 'boolean',
          prompt: 'Le point à la fin de `docker build -t nom:tag .` est décoratif.',
          answer: false,
          explanation: "Faux : c'est le répertoire de contexte, celui qui contient le Dockerfile et les fichiers à copier. Sans lui, le build ne trouve pas ses fichiers — et c'est aussi ce qui décide de ce qui part dans le build.",
          required: false,
        },
      ],
      solution: `\`\`\`bash
mkdir -p ~/verdi-image && cd ~/verdi-image

cat > index.html <<'EOF'
Librairie Verdi
Commandes, romans, et du papier.
EOF

cat > Dockerfile <<'EOF'
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
EOF

docker build -t verdi-site:1.0 .
# -> Step 1/2 : FROM nginx:alpine
# -> Step 2/2 : COPY index.html /usr/share/nginx/html/index.html
# -> Successfully built 4f2a8b1c9d3e

docker run -d --name verdi-test -p 8080:80 verdi-site:1.0
docker exec verdi-test sh -c 'cat /usr/share/nginx/html/index.html'
# -> Librairie Verdi
# -> Commandes, romans, et du papier.

docker history verdi-site:1.0
# -> IMAGE        CREATED BY                                   SIZE
# -> 9a8b7c6d     COPY index.html /usr/share/nginx/html/ind…   1.02kB
# -> 4f2a8b1c     /bin/sh -c #(nop) CMD ["nginx" "-g" "da…    0B
# -> b1c2d3e4     /bin/sh -c #(nop)  ENTRYPOINT …              0B

docker rm -f verdi-test
\`\`\`

L'historique montre enfin l'instruction \`COPY\`. C'est toute la différence avec
\`docker commit\`.`,
      teaches: ['Dockerfile', 'FROM', 'COPY', 'docker build', 'répertoire de contexte'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m5-02-ecrire-le-dockerfile/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais dire quelle ligne de ton Dockerfile a produit la couche que \`docker history\` affiche.",
    },

    {
      id: 'm5-03-cmd-et-entrypoint',
      order: 3,
      title: 'CMD, ENTRYPOINT et le processus 1',
      points: 50,
      flag: 'FLAG{CMD_ENTRYPOINT_PID1_UNDER_CONTROL}',
      estMinutes: 16,
      brief: `# CMD, ENTRYPOINT et le processus 1

Une image décrit un programme à lancer. Deux instructions s'en chargent, et leur
interaction est la source d'un piège qui arrête beaucoup de monde.

**Ta mission**

1. Deux instructions, deux rôles. \`ENTRYPOINT\` dit **ce qui** fait le
   conteneur ; \`CMD\` dit **avec quels arguments** :

\`\`\`bash
cd ~/verdi-image
cat > Dockerfile <<'EOF'
FROM alpine
ENTRYPOINT ["echo"]
CMD ["bonjour"]
EOF
docker build -t demo-cmd:1 .
\`\`\`

2. Lance l'image **sans** lui donner d'arguments, puis **avec** :

\`\`\`bash
docker run --rm demo-cmd:1
docker run --rm demo-cmd:1 monde
\`\`\`

La première commande remplace \`CMD\`. La seconde, non. Vois-tu pourquoi ?

3. Supprime \`ENTRYPOINT\`, et regarde ce que \`CMD\` devient :

\`\`\`bash
cat > Dockerfile <<'EOF'
FROM alpine
CMD ["echo", "bonjour"]
EOF
docker build -t demo-cmd:2 .
docker run --rm demo-cmd:2
docker run --rm demo-cmd:2 monde
\`\`\`

4. Le cas réel. \`ENTRYPOINT\` avec la forme \`shell\` :

\`\`\`bash
cat > Dockerfile <<'EOF'
FROM alpine
ENTRYPOINT echo bonjour
CMD monde
EOF
docker build -t demo-cmd:3 .
docker run --rm demo-cmd:3
\`\`\`

La forme \`shell\` — sans crochets — change tout : Docker passe la commande à un
interpréteur, et les arguments de \`docker run\` **s'ajoutent** à la fin plutôt
que de remplacer.

**Ce que tu observes**

- Étape 2 : \`docker run demo-cmd:1 monde\` affiche \`bonjour monde\`. Les
  arguments s'ajoutent à \`ENTRYPOINT\`, ils ne remplacent pas \`CMD\`.
- Étape 3 : sans \`ENTRYPOINT\`, \`CMD monde\` **remplace** tout : la sortie est
  \`monde\` seule. \`CMD\` seul, c'est une commande complète qu'on remplace.
- Étape 4 : la forme \`shell\` fait se comporter \`CMD\` comme dans l'étape 2. Deux
  surprises au lieu d'une.

**La règle à retenir**

Mets toujours \`ENTRYPOINT\` et \`CMD\` entre crochets. La forme \`shell\` est un
raccourci ancien, et elle fait hériter \`CMD\` d'un comportement qu'on n'attend pas.

**Le processus 1**

La commande que tu as définie devient le **processus numéro 1** du conteneur — on
l'a vu à l'atelier 3. Deux conséquences :

- Un PID 1 n'a pas de parent : personne ne le surveille. Si ton programme
  s'arrête, le conteneur s'arrête, et c'est bien.
- Un PID 1 ne reçoit pas les signaux comme les autres : il doit les traiter
  lui-même, sinon \`docker stop\` attend le délai complet avant de tuer le
  processus.

C'est la raison d'être de \`exec\` dans beaucoup d'images de production : le
programme reçoit directement le signal, sans intermédiaire.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m5-03-cmd-et-entrypoint/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "`ENTRYPOINT` fixe le programme, `CMD` propose des arguments. `docker run image mot` donne des arguments : la question est de savoir laquelle des deux instructions ils touchent.",
        "Sans `ENTRYPOINT`, `CMD` est la commande complète. Elle est alors entièrement remplacée, arguments compris.",
        "Le crochet change tout : `[\"echo\"]` est la forme exec, Docker lance le programme directement. `echo bonjour` passe par un interpréteur, et le comportement de `CMD` change avec.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      // Pas de `recall` : « exec » est écrit dans l'énoncé, et c'est
      // justement parce qu'il y est que la règle est applicable. Le QCM porte
      // la distinction de comportement, qui est la vraie difficulté.
      check: [
        {
          id: 'm5-03-cmd-remplace',
          kind: 'mcq',
          prompt: 'Une image a `ENTRYPOINT [\"echo\"]` et `CMD [\"bonjour\"]`. Que produit `docker run img monde` ?',
          choices: [
            '`monde` seul : CMD sans ENTRYPOINT est entièrement remplacé',
            '`bonjour` seul : ENTRYPOINT est ignoré',
            '`bonjour monde` : les arguments s\'ajoutent à ENTRYPOINT',
            'Une erreur : les deux instructions ne peuvent pas coexister',
          ],
          answer: 2,
          explanation: "`ENTRYPOINT` fixe le programme ; les arguments de `docker run` s'ajoutent à `CMD`, ils ne le remplacent pas. C'est le comportement voulu : un `ENTRYPOINT nginx` doit pouvoir recevoir des options.",
          required: true,
        },
        {
          id: 'm5-03-crochets',
          kind: 'mcq',
          prompt: 'Pourquoi mettre toujours `ENTRYPOINT` et `CMD` entre crochets ?',
          choices: [
            'La forme exec lance le programme directement, sans interpréteur intermédiaire',
            'Les crochets sont obligatoires pour que le Dockerfile soit valide',
            'C\'est plus court à écrire',
            'Cela rend l\'image plus petite',
          ],
          answer: 0,
          explanation: "La forme exec ne passe pas par un shell : le programme est le PID 1 et reçoit les signaux directement. La forme shell introduit un interpréteur, qui change le comportement de `CMD` et retarde l'arrêt.",
          required: true,
        },
        {
          id: 'm5-03-pid1',
          kind: 'boolean',
          prompt: 'Le processus 1 d\'un conteneur est surveillé par un processus parent, comme les autres processus.',
          answer: false,
          explanation: "Faux : il n'y a pas de parent. C'est pourquoi un PID 1 doit surveiller ses propres enfants — et pourquoi `docker stop` doit attendre quand le programme ne traite pas les signaux.",
          required: false,
        },
      ],
      solution: `\`\`\`bash
# 1. ENTRYPOINT fixe le programme, CMD propose des arguments
cat > Dockerfile <<'EOF'
FROM alpine
ENTRYPOINT ["echo"]
CMD ["bonjour"]
EOF
docker build -t demo-cmd:1 . && docker run --rm demo-cmd:1
# -> bonjour
docker run --rm demo-cmd:1 monde
# -> bonjour monde          (les arguments s'ajoutent)

# 2. Sans ENTRYPOINT, CMD est remplacé entièrement
cat > Dockerfile <<'EOF'
FROM alpine
CMD ["echo", "bonjour"]
EOF
docker build -t demo-cmd:2 . && docker run --rm demo-cmd:2
# -> bonjour
docker run --rm demo-cmd:2 monde
# -> monde                 (remplacé, pas complété)

# 3. La forme shell change le comportement
cat > Dockerfile <<'EOF'
FROM alpine
ENTRYPOINT echo bonjour
CMD monde
EOF
docker build -t demo-cmd:3 . && docker run --rm demo-cmd:3
# -> bonjour monde         (surprise : CMD se complète à nouveau)
\`\`\``,
      teaches: ['ENTRYPOINT', 'CMD', 'forme exec', 'forme shell', 'PID 1'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m5-03-cmd-et-entrypoint/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais dire si `docker run img mot` remplace `CMD` ou s'y ajoute — et pourquoi la forme shell change la réponse.",
    },

    {
      id: 'm5-04-la-methode-de-la-librairie',
      order: 4,
      title: 'La méthode de la librairie',
      points: 400,
      flag: 'FLAG{VERDI_1_0_REPRODUCIBLE_AND_TAGGED}',
      estMinutes: 20,
      brief: `# La méthode de la librairie

Le jalon : la librairie veut une méthode écrite, versionnée, et qui tient dans
trois commandes. L'administrateur part en vacances la semaine prochaine.

Ce que tu as fait à la quête 2 tient déjà en trois lignes. Il reste à le faire
**proprement** : une image qui porte un numéro de version, et un fichier qui
porte la procédure.

**Ta mission**

1. Écris l'image de la librairie, proprement. Cette fois, l'image installe
   ce qu'elle a besoin, expose son port, et se lance toute seule :

\`\`\`bash
cd ~/verdi-image
cat > Dockerfile <<'EOF'
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
EOF
\`\`\`

\`EXPOSE\` documente le port — il ne le publie pas. \`daemon off;\` garde Nginx au
premier plan, sinon le conteneur s'arrêterait aussitôt.

2. Construis, en portant un numéro de version :

\`\`\`bash
docker build -t verdi-site:1.0 .
\`\`\`

3. Lance **exactement** comme en production, et vérifie la page :

\`\`\`bash
docker rm -f verdi 2>/dev/null
docker run -d --name verdi -p 8080:80 verdi-site:1.0
curl -s http://localhost:8080
\`\`\`

4. **La démonstration qui compte.** Construis la même image une deuxième fois,
   dans un répertoire vide, avec le même Dockerfile, et compare les identifiants :

\`\`\`bash
docker images verdi-site
mkdir -p /tmp/rebuild && cp Dockerfile index.html /tmp/rebuild/
cd /tmp/rebuild && docker build -t verdi-site:1.0 .
docker images verdi-site
\`\`\`

Les deux identifiants d'image sont-ils identiques ? Ils ne peuvent pas l'être :
une construction n'est jamais tout à fait déterministe. Mais le **conteneur**
produit est le même. C'est ce qui compte.

5. Écris la procédure. Un fichier, trois commandes, c'est tout ce que l'ont
   système doit recevoir :

\`\`\`bash
cd ~/verdi-image
cat > DEPLOYER.md <<'EOF'
Déployer le site de la librairie
--------------------------------

1. Construire l'image :
   docker build -t verdi-site:1.0 .

2. Remplacer le conteneur en service :
   docker rm -f verdi
   docker run -d --name verdi -p 8080:80 verdi-site:1.0

3. Vérifier :
   curl -s http://localhost:8080
EOF
\`\`\`

6. Tags. La convention dit qu'une image sans version est une image **jetable** :

\`\`\`bash
docker tag verdi-site:1.0 verdi-site:latest
docker images verdi-site
docker rmi verdi-site:latest
\`\`\`

**Ce que tu observes**

- Étape 1 : \`daemon off;\` est obligatoire. Sans lui, Nginx démonise, le PID 1
  se termine, et le conteneur s'arrête immédiatement.
- Étape 4 : les identifiants diffèrent, les contenus produits sont identiques. La
  reproductibilité est **du contenu**, pas de l'identifiant.
- Étape 6 : \`latest\` n'est qu'un nom. Sans lui, une image ne se lance qu'avec sa
  version exacte — ce qui est le comportement qu'on veut.

**Ce que ça change pour la librairie**

La direction peut maintenant répondre à deux questions qu'elle ne pouvait pas
poser avant :

- « Quelle version tourne en production ? » → \`docker images verdi-site\`
- « Comment la reconstruire ? » → \`cat DEPLOYER.md\`

La seconde était sans réponse pendant tout le chantier. C'est ce qui s'appelle
une chaîne de reconstruction.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m5-04-la-methode-de-la-librairie/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "`daemon off;` est une option de Nginx, pas de Docker. Sans elle, le processus se démonise et le conteneur n'a plus de PID 1.",
        "`EXPOSE 80` documente, il ne publie pas. Sans `-p`, le port 80 du conteneur reste inaccessible de la machine — c'est le sujet de l'atelier 4.",
        "`docker images verdi-site` liste toutes les étiquettes de cette image. Deux lignes avec deux identifiants, c'est ce qu'on cherche à voir.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm5-04-daemon',
          kind: 'mcq',
          prompt: 'Que se passe-t-il si un conteneur Nginx est lancé sans l\'option `daemon off;` dans son CMD ?',
          choices: [
            'Le conteneur s\'arrête immédiatement : le processus principal se termine',
            'Nginx démarre deux fois',
            'Le conteneur refuse de démarrer',
            'Rien : l\'option est facultative',
          ],
          answer: 0,
          explanation: "Nginx se démonise et le processus du premier plan se termine. Le conteneur vit le temps de sa commande principale : il s'arrête. C'est le piège le plus courant des images construites soi-même.",
          required: true,
        },
        {
          id: 'm5-04-reproductibilite',
          kind: 'boolean',
          prompt: 'Construire deux fois le même Dockerfile donne nécessairement le même identifiant d\'image.',
          answer: false,
          explanation: "Faux, et c'est important à ne pas croire. Une construction n'est pas déterministe : horodatage, ordre des couches. Ce qui est reproductible, c'est le **conteneur obtenu**, pas l'identifiant.",
          required: true,
        },
        {
          id: 'm5-04-expose',
          kind: 'mcq',
          prompt: 'Que fait `EXPOSE 80` dans un Dockerfile ?',
          choices: [
            'Il documente le port du service, sans le publier',
            'Il publie le port 80 sur la machine',
            'Il redirige le trafic du port 80',
            'Il réserve le port pour le build',
          ],
          answer: 0,
          explanation: "`EXPOSE` est une déclaration d'intention, lisible par l'image. La publication reste le rôle de `-p` au lancement — c'est ce qui permet à la même image d'être lancée sur des ports différents.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
cd ~/verdi-image
cat > Dockerfile <<'EOF'
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
EOF

docker build -t verdi-site:1.0 .
docker rm -f verdi
docker run -d --name verdi -p 8080:80 verdi-site:1.0
curl -s http://localhost:8080
# -> Librairie Verdi

docker images verdi-site
# -> REPOSITORY    TAG   IMAGE ID       CREATED       SIZE
# -> verdi-site    1.0   4f2a8b1c9d3e   2 minutes ago  22.3MB

# Reconstruction dans un répertoire vide :
mkdir -p /tmp/rebuild && cp Dockerfile index.html /tmp/rebuild/
cd /tmp/rebuild && docker build -t verdi-site:1.0 .
docker images verdi-site
# -> verdi-site 1.0  9a8b7c6d5e4f   (identifiant différent,
#                                        contenu identique)

docker tag verdi-site:1.0 verdi-site:latest
docker images verdi-site
# -> deux étiquettes, un seul identifiant
docker rmi verdi-site:latest
\`\`\`

Sans \`daemon off;\`, le build réussit et le conteneur s'arrête tout de suite :
c'est le piège que cet énoncé évite en l'écrivant directement.`,
      teaches: ['docker build', 'EXPOSE', 'daemon off;', 'docker tag', 'chaîne de reconstruction'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m5-04-la-methode-de-la-librairie/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu peux répondre aux deux questions que la direction posait : quelle version tourne, et comment la reconstruire.",
    },
  ],
};