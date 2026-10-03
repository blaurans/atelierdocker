// Module 5 — Construire une image
// La quête phare qui termine le module est la mission officielle n°4 « Image Alchemist ».
export default {
  meta: {
    slug: 'm5-construire-une-image',
    module: 5,
    title: 'Construire une image',
    tagline: 'Du conteneur jetable à l\'image reproductible et versionnée',
    icon: '⚗️',
  },

  quests: [
    {
      id: 'm5-01-le-raccourci-oublie',
      order: 1,
      title: "Le raccourci qu'on oublie",
      points: 25,
      flag: 'FLAG{COMMIT_SNAPSHOT_AVOID_IN_PROD}',
      estMinutes: 15,
      brief: `# Le raccourci qu'on oublie

Tu peux démarrer un conteneur, le modifier à la main, puis **figer** le résultat en une nouvelle image. C'est tentant. C'est aussi le meilleur moyen de rendre un projet impossible à reconstruire.

**Ta mission**

1. Démarre un conteneur vide en arrière-plan :

\`\`\`bash
docker run --name brouillon -d alpine sleep 600
\`\`\`

2. Modifie-le à la main, comme si tu installais un outil au fil de l'eau :

\`\`\`bash
docker exec brouillon sh -c 'echo "modification manuelle" > /tmp/carnet.txt'
docker exec brouillon cat /tmp/carnet.txt
\`\`\`

3. Fige le conteneur en image, et regarde la liste de tes images :

\`\`\`bash
docker commit brouillon atelier-oublie:1.0
docker images
\`\`\`

4. Vérifie que la modification a bien été figée, et regarde l'historique de la nouvelle image :

\`\`\`bash
docker run --rm atelier-oublie:1.0 cat /tmp/carnet.txt
docker history atelier-oublie:1.0
\`\`\`

5. Supprime le conteneur, puis l'image :

\`\`\`bash
docker rm -f brouillon
docker rmi atelier-oublie:1.0
\`\`\`

**Pourquoi c'est un piège**

- \`docker history\` ne montre qu'**une** couche, dont la colonne CREATED BY reprend le nom de la commande d'origine : \`sleep 600\`. Personne ne sait ce que tu as fait.
- Le résultat n'est pas reproductible : un collègue qui part de l'image officielle ne obtiendra jamais la même chose.
- Un fichier \`Dockerfile\` qui explique chaque étape, lui, se relit, se versionne et se reconstruit à l'identique. C'est la quête suivante.

**Ton mot de passe**

Il n'est écrit nulle part : il sort de la sortie d'une image construite par la commande ci-dessous. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
printf '%s\\n' 'FROM alpine:3.20' 'ARG ARENA' 'RUN wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m5-01-le-raccourci-oublie/raw?token=$ARENA"' 'CMD ["cat","/secret.txt"]' | docker build -q --build-arg ARENA="$ARENA_TOKEN" -t pass-m5-01:1.0 -
docker run --rm pass-m5-01:1.0 && docker rmi pass-m5-01:1.0
\`\`\`

Le conteneur affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "La commande qui transforme un conteneur en image porte un nom de six lettres, comme « committer ».",
        "Pour construire l'image, il te faut le nom du conteneur, puis un nom d'image avec son tag, séparés par deux-points.",
      ],
      solution: `\`\`\`bash
docker run --name brouillon -d alpine sleep 600

docker exec brouillon sh -c 'echo "modification manuelle" > /tmp/carnet.txt'
docker exec brouillon cat /tmp/carnet.txt
# -> modification manuelle

docker commit brouillon atelier-oublie:1.0
# -> sha256:3335790b1cd6...   (l'identifiant de la nouvelle image)
docker images
# -> atelier-oublie  1.0  3335790b1cd6  ...  4.1kB

docker run --rm atelier-oublie:1.0 cat /tmp/carnet.txt
# -> modification manuelle   (le changement a bien ete fige)

docker history atelier-oublie:1.0
# -> 3335790b1cd6  Less than a second ago  sleep 600  4.1kB   <- ta modification, opaque
#    294b683cb724  2 weeks ago             CMD ["/bin/sh"]  0B  <- couche "missing" : reglage seul
#    (ligne suivante) 2 weeks ago           ADD alpine-minirootfs...  10.1MB
#    -> une seule couche ajoutee, aucune trace de la commande reellement utilisee

docker rm -f brouillon
docker rmi atelier-oublie:1.0
\`\`\``,
      teaches: ['docker commit', 'docker rmi', 'non-reproductibilité', 'anti-pattern', 'Dockerfile'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
printf '%s\\n' 'FROM alpine:3.20' 'ARG ARENA' 'RUN wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m5-01-le-raccourci-oublie/raw?token=$ARENA"' 'CMD ["cat","/secret.txt"]' | docker build -q --build-arg ARENA="$ARENA_TOKEN" -t pass-m5-01:1.0 -
docker run --rm pass-m5-01:1.0 && docker rmi pass-m5-01:1.0`,
      checkpoint: "Tu as réussi quand `docker history atelier-oublie:1.0` ne montre qu'une seule couche au-dessus de l'image alpine, alors que `cat /tmp/carnet.txt` renvoie bien la modification que tu as faite.",
    },

    {
      id: 'm5-02-instructions-du-dockerfile',
      order: 2,
      title: 'Les instructions du Dockerfile',
      points: 25,
      flag: 'FLAG{DOCKERFILE_INSTRUCTIONS_LAYERED}',
      estMinutes: 20,
      brief: `# Les instructions du Dockerfile

Un \`Dockerfile\` est un texte qui décrit comment fabriquer une image, ligne par ligne. Chaque instruction crée une couche, et l'ordre compte.

**Ta mission**

1. Prépare ton atelier :

\`\`\`bash
mkdir -p ~/arena-m5
cd ~/arena-m5
printf 'salut depuis mon image\\n' > message.txt
\`\`\`

2. Écris le \`Dockerfile\` qui décrit ton image :

\`\`\`bash
cat > Dockerfile <<'EOF'
FROM alpine:3.20
ARG VERSION_DU_LAB=dev
ENV NIVEAU=apprenti
WORKDIR /app
COPY message.txt .
RUN echo "build $VERSION_DU_LAB" > /app/build-info.txt
CMD ["cat", "/app/message.txt"]
EOF
\`\`\`

3. Construis l'image. Le dernier argument, le point, signifie « le dossier courant » :

\`\`\`bash
docker build -t arena-notices:1.0 .
\`\`\`

4. Lance-la sans rien demander : la commande \`CMD\` s'exécute :

\`\`\`bash
docker run --rm arena-notices:1.0
\`\`\`

5. Remplace la commande par défaut et regarde le contenu de l'image :

\`\`\`bash
docker run --rm arena-notices:1.0 ls -l /app
docker run --rm arena-notices:1.0 cat /app/build-info.txt
\`\`\`

6. Teste \`ENV\` et \`ARG\` :

\`\`\`bash
docker run --rm arena-notices:1.0 printenv NIVEAU
docker run --rm -e NIVEAU=expert arena-notices:1.0 printenv NIVEAU
\`\`\`

7. Reconstruit la même image : cette fois, tout est mis en cache.

\`\`\`bash
docker build -t arena-notices:1.0 .
\`\`\`

8. Change la valeur de l'ARG au moment du build :

\`\`\`bash
docker build --build-arg VERSION_DU_LAB=v2 -t arena-notices:2.0 .
docker run --rm arena-notices:2.0 cat /app/build-info.txt
\`\`\`

**Ce que tu observes**

- \`FROM\` choisit l'image de départ. \`RUN\` exécute une commande pendant la construction.
- \`WORKDIR\` fixe le dossier courant des instructions suivantes. \`COPY\` y dépose des fichiers.
- \`ENV\` est figé dans l'image et visible à l'exécution ; \`ARG\` n'existe que pendant la construction.
- \`COPY message.txt .\` se lit : *copier \`message.txt\` dans le dossier courant*.
- Une couche n'est reconstruite que si elle ou ce qui la précède a changé. C'est le cache.

**Ton mot de passe**

Il n'est écrit nulle part : il sort de la sortie d'une image construite par la commande ci-dessous. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
printf '%s\\n' 'FROM alpine:3.20' 'ARG ARENA' 'RUN wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m5-02-instructions-du-dockerfile/raw?token=$ARENA"' 'CMD ["cat","/secret.txt"]' | docker build -q --build-arg ARENA="$ARENA_TOKEN" -t pass-m5-02:1.0 -
docker run --rm pass-m5-02:1.0 && docker rmi pass-m5-02:1.0
\`\`\`

Le conteneur affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "Six mots suffisent : FROM pour le départ, WORKDIR pour se placer, COPY pour déposer, RUN pour exécuter, ENV et ARG pour les variables.",
        "La construction se lance avec `docker build`, un nom d'image et un tag, puis un point qui désigne le dossier courant comme contexte de build.",
      ],
      solution: `\`\`\`bash
mkdir -p ~/arena-m5
cd ~/arena-m5
printf 'salut depuis mon image\\n' > message.txt

cat > Dockerfile <<'EOF'
FROM alpine:3.20
ARG VERSION_DU_LAB=dev
ENV NIVEAU=apprenti
WORKDIR /app
COPY message.txt .
RUN echo "build $VERSION_DU_LAB" > /app/build-info.txt
CMD ["cat", "/app/message.txt"]
EOF

docker build -t arena-notices:1.0 .
# -> #7 [3/4] COPY message.txt .   DONE
#    #8 [4/4] RUN echo "build dev" ...   DONE
#    -> naming to docker.io/library/arena-notices:1.0 done

docker run --rm arena-notices:1.0
# -> salut depuis mon image      (c'est le CMD qui a joue son role)

docker run --rm arena-notices:1.0 ls -l /app
# -> build-info.txt  message.txt   (le WORKDIR et le COPY ont joue leur role)
docker run --rm arena-notices:1.0 cat /app/build-info.txt
# -> build dev

docker run --rm arena-notices:1.0 printenv NIVEAU
# -> apprenti
docker run --rm -e NIVEAU=expert arena-notices:1.0 printenv NIVEAU
# -> expert     (l'option -e du run ecrase l'ENV de l'image)

docker build -t arena-notices:1.0 .
# -> WORKDIR CACHED / COPY CACHED / RUN CACHED   : rien n'a change

docker build --build-arg VERSION_DU_LAB=v2 -t arena-notices:2.0 .
docker run --rm arena-notices:2.0 cat /app/build-info.txt
# -> build v2     (l'ARG a ete injectee a la construction, sans etre figee dans l'image)
\`\`\``,
      teaches: ['Dockerfile', 'FROM', 'RUN', 'WORKDIR', 'COPY'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
printf '%s\\n' 'FROM alpine:3.20' 'ARG ARENA' 'RUN wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m5-02-instructions-du-dockerfile/raw?token=$ARENA"' 'CMD ["cat","/secret.txt"]' | docker build -q --build-arg ARENA="$ARENA_TOKEN" -t pass-m5-02:1.0 -
docker run --rm pass-m5-02:1.0 && docker rmi pass-m5-02:1.0`,
      checkpoint: "Tu as réussi quand `docker run --rm arena-notices:1.0` affiche le contenu de ton fichier, et quand la seconde construction affiche des étapes marquées CACHED.",
    },

    {
      id: 'm5-03-cmd-entrypoint-pid1',
      order: 3,
      title: 'CMD, ENTRYPOINT et PID 1',
      points: 50,
      flag: 'FLAG{CMD_ENTRYPOINT_PID1_SIGNALS}',
      estMinutes: 20,
      brief: `# CMD, ENTRYPOINT et PID 1

Dernière notion avant la mission phare. Quand tu lances un conteneur, une seule commande devient **le processus numéro 1** à l'intérieur. Cette place a des règles particulières.

**Ta mission**

1. Prépare un atelier avec une image qui a un \`ENTRYPOINT\` :

\`\`\`bash
mkdir -p ~/arena-m5-bis && cd ~/arena-m5-bis
printf 'bonjour depuis entrypoint\\n' > greeting.txt
cat > Dockerfile <<'EOF'
FROM alpine:3.20
COPY greeting.txt /greeting.txt
RUN echo "cle de l'image" > /cle.txt
ENTRYPOINT ["cat", "/greeting.txt"]
EOF
docker build -t demo-entrypoint:1.0 .
\`\`\`

2. Lance-la normalement : l'\`ENTRYPOINT\` s'exécute.

\`\`\`bash
docker run --rm demo-entrypoint:1.0
\`\`\`

3. Ajoute un argument : il s'ajoute **après** l'\`ENTRYPOINT\`, il ne le remplace pas.

\`\`\`bash
docker run --rm demo-entrypoint:1.0 /etc/hostname
\`\`\`

4. Lis un fichier de l'image en contournant l'\`ENTRYPOINT\` :

\`\`\`bash
docker run --rm --entrypoint cat demo-entrypoint:1.0 /cle.txt
\`\`\`

5. Regarde ce que Docker a retenu pour \`ENTRYPOINT\` et \`CMD\` :

\`\`\`bash
docker image inspect demo-entrypoint:1.0 --format '{{.Config.Entrypoint}} {{.Config.Cmd}}'
\`\`\`

6. Observe qui est le processus numéro 1, et ce que vaut un \`CMD\` :

\`\`\`bash
docker run -d --name demon-pid1 alpine sleep 600
docker exec demon-pid1 ps
docker stop demon-pid1
docker rm demon-pid1
\`\`\`

**Ce que tu observes**

- Avec \`ENTRYPOINT\` en forme liste, les arguments de \`docker run\` s'ajoutent à la fin.
- \`CMD\` est la commande par défaut ; \`ENTRYPOINT\` est le programme fixe. Les deux se combinent : le programme, puis ses arguments.
- \`ps\` montre \`sleep\` en **PID 1** : dans un conteneur, le processus numéro 1 est le programme principal.
- Un processus numéro 1 n'applique pas les signaux par défaut : \`docker stop\` attend son délai complet avant d'envoyer le signal le plus fort. C'est pour ça qu'on écrit \`CMD\` et \`ENTRYPOINT\` en forme liste, pour que le vrai programme soit en PID 1.

**Ton mot de passe**

Il n'est écrit nulle part : il sort de la sortie d'une image construite par la commande ci-dessous. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
printf '%s\\n' 'FROM alpine:3.20' 'ARG ARENA' 'RUN wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m5-03-cmd-entrypoint-pid1/raw?token=$ARENA"' 'CMD ["cat","/secret.txt"]' | docker build -q --build-arg ARENA="$ARENA_TOKEN" -t pass-m5-03:1.0 -
docker run --rm pass-m5-03:1.0 && docker rmi pass-m5-03:1.0
\`\`\`

Le conteneur affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "Le fichier `/cle.txt` est écrit dans l'image pendant la construction : relis l'instruction `RUN` du Dockerfile.",
        "Pour changer la commande d'exécution d'un conteneur existant sans toucher à l'image, l'option s'appelle `--entrypoint`.",
      ],
      solution: `\`\`\`bash
mkdir -p ~/arena-m5-bis && cd ~/arena-m5-bis
printf 'bonjour depuis entrypoint\\n' > greeting.txt

cat > Dockerfile <<'EOF'
FROM alpine:3.20
COPY greeting.txt /greeting.txt
RUN echo "cle de l'image" > /cle.txt
ENTRYPOINT ["cat", "/greeting.txt"]
EOF

docker build -t demo-entrypoint:1.0 .

docker run --rm demo-entrypoint:1.0
# -> bonjour depuis entrypoint

docker run --rm demo-entrypoint:1.0 /etc/hostname
# -> bonjour depuis entrypoint
#    9f3a1c7b2d4e      <- l'argument a ete AJOUTE a l'entrypoint

docker run --rm --entrypoint cat demo-entrypoint:1.0 /cle.txt
# -> cle de l'image

docker image inspect demo-entrypoint:1.0 --format '{{.Config.Entrypoint}} {{.Config.Cmd}}'
# -> [cat /greeting.txt] []

docker run -d --name demon-pid1 alpine sleep 600
docker exec demon-pid1 ps
# -> PID   USER     TIME  COMMAND
#       1 root      0:00 sleep 600     <- le programme principal EST le processus 1
docker stop demon-pid1
# -> attend le delai complet (environ 10 s) puis arrete le conteneur
docker rm demon-pid1
\`\`\``,
      teaches: ['ENTRYPOINT', 'CMD', 'forme exec', 'forme shell', 'PID 1'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
printf '%s\\n' 'FROM alpine:3.20' 'ARG ARENA' 'RUN wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m5-03-cmd-entrypoint-pid1/raw?token=$ARENA"' 'CMD ["cat","/secret.txt"]' | docker build -q --build-arg ARENA="$ARENA_TOKEN" -t pass-m5-03:1.0 -
docker run --rm pass-m5-03:1.0 && docker rmi pass-m5-03:1.0`,
      checkpoint: "Tu as réussi quand le fichier `/etc/hostname` s'est affiché **en plus** du message d'accueil, et quand `ps` dans le conteneur a montré le programme principal en PID 1.",
    },

    {
      id: 'm5-04-image-alchemist',
      order: 4,
      title: 'Image Alchemist',
      points: 400,
      flag: 'FLAG{DOCKERFILE_CHEF_CUSTOM_BUILD}',
      estMinutes: 25,
      brief: `# Mission phare — Image Alchemist

Objectif : concevoir une image sur-mesure à l'aide d'un \`Dockerfile\` reproductible.

**Mission**

1. Crée un répertoire de travail :

\`\`\`bash
mkdir -p ~/arena-quest4 && cd ~/arena-quest4
\`\`\`

2. Écris le code d'un microserveur Python \`server.py\`. Il répond sur le port 9000, et lui seul peut le dire :

\`\`\`bash
cat > server.py <<'PYEOF'
from http.server import SimpleHTTPRequestHandler, HTTPServer


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"Mission 4 reussie ! Mon conteneur parle.\\n")


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 9000), Handler)
    print("Serveur en ecoute sur 9000...")
    server.serve_forever()
PYEOF
\`\`\`

3. Rédige le \`Dockerfile\` :

\`\`\`bash
cat > Dockerfile <<'EOF'
FROM python:3.11-alpine
WORKDIR /app
COPY server.py .
EXPOSE 9000
CMD ["python", "server.py"]
EOF
\`\`\`

4. Construis l'image sous le nom \`arena-agent:1.0\` :

\`\`\`bash
docker build -t arena-agent:1.0 .
\`\`\`

5. Instancie un conteneur à partir de ta nouvelle image :

\`\`\`bash
docker run -d -p 9000:9000 --name custom-agent arena-agent:1.0
\`\`\`

6. Interroge ton microserveur, et admire le résultat :

\`\`\`bash
curl http://localhost:9000
\`\`\`

7. Nettoie :

\`\`\`bash
docker stop custom-agent && docker rm custom-agent
\`\`\`

**Ton mot de passe**

Il n'est écrit nulle part : il sort de l'image que tu viens de construire. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace dq_xxxxxxxxxxxxxxxx par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
printf '%s\\n' 'FROM alpine:3.20' 'ARG ARENA' 'RUN wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m5-04-image-alchemist/raw?token=$ARENA"' 'CMD ["cat","/secret.txt"]' | docker build -q --build-arg ARENA="$ARENA_TOKEN" -t pass-m5-04:1.0 -
docker run --rm pass-m5-04:1.0 && docker rmi pass-m5-04:1.0
\`\`\`

Le conteneur affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "Le fichier Python s'écrit d'un coup avec `cat` et un marqueur de fin, pour ne pas taper le code à la main dans un éditeur.",
        "Le \`Dockerfile\` tient en cinq lignes : une image de départ, un dossier de travail, la copie du fichier, un port annoncé et une commande.",
        "Le port 9000 est écouté **dans** le conteneur : il faut aussi le publier vers ta machine avec `-p`.",
      ],
      solution: `\`\`\`bash
mkdir -p ~/arena-quest4 && cd ~/arena-quest4

cat > server.py <<'PYEOF'
from http.server import SimpleHTTPRequestHandler, HTTPServer


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"Mission 4 reussie ! Mon conteneur parle.\\n")


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 9000), Handler)
    print("Serveur en ecoute sur 9000...")
    server.serve_forever()
PYEOF

cat > Dockerfile <<'EOF'
FROM python:3.11-alpine
WORKDIR /app
COPY server.py .
EXPOSE 9000
CMD ["python", "server.py"]
EOF

docker build -t arena-agent:1.0 .
# -> Successfully built / naming to docker.io/library/arena-agent:1.0 done

docker run -d -p 9000:9000 --name custom-agent arena-agent:1.0
# -> identifiant du conteneur

curl http://localhost:9000
# -> Mission 4 reussie ! Mon conteneur parle.

docker stop custom-agent && docker rm custom-agent
# A envoyer au portail : le mot de passe de la section « Ton mot de passe »,
# affiche par l'image construite ci-dessus.
\`\`\``,
      teaches: ['construction d\'image', 'Dockerfile', 'EXPOSE', 'CMD', 'microserveur Python'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
printf '%s\\n' 'FROM alpine:3.20' 'ARG ARENA' 'RUN wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m5-04-image-alchemist/raw?token=$ARENA"' 'CMD ["cat","/secret.txt"]' | docker build -q --build-arg ARENA="$ARENA_TOKEN" -t pass-m5-04:1.0 -
docker run --rm pass-m5-04:1.0 && docker rmi pass-m5-04:1.0`,
      checkpoint: "Tu as réussi quand `curl http://localhost:9000` affiche le message de ton microserveur, quand l'image `arena-agent:1.0` apparaît dans `docker images` avec sa taille, et quand l'image `pass-m5-04` a affiché ton mot de passe.",
    },
  ],
};