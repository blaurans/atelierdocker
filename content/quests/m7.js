// Module 7 — Docker Compose
// La quête phare qui termine le module est la mission officielle n°6 « Compose Overlord ».
export default {
  meta: {
    slug: 'm7-docker-compose',
    module: 7,
    title: 'Docker Compose',
    tagline: 'Décrire toute une pile dans un seul fichier, puis la piloter',
    icon: '⚡',
  },

  quests: [
    {
      id: 'm7-01-un-seul-fichier',
      order: 1,
      title: 'Un seul fichier pour tout dire',
      points: 50,
      flag: 'FLAG{COMPOSE_YAML_VALIDATED_CONFIG}',
      estMinutes: 18,
      brief: `# Un seul fichier pour tout dire

Écrire une pile de conteneurs avec des \`docker run\` à la chaîne, c'est long et fragile. Docker Compose décrit l'ensemble dans **un seul fichier YAML**, que tu peux relire, versionner et partager.

**Ta mission**

1. Vérifie que Compose est installé, et regarde son aide :

\`\`\`bash
docker compose version
docker compose --help
\`\`\`

2. Compare avec le résultat qu'on obtient à la main : Compose ne lance rien tant que tu ne le demandes pas, il se contente de décrire.

3. Prépare ton projet et écris un \`docker-compose.yml\` minimal : un seul service, un port publié, une variable d'environnement.

\`\`\`bash
mkdir -p ~/arena-compose && cd ~/arena-compose
cat > docker-compose.yml <<'EOF'
services:
  web:
    image: nginx:alpine
    container_name: compose-preview
    ports:
      - "8081:80"
    environment:
      - "ARENA_BIENVENUE=bienvenue-dans-l-arene"
    restart: unless-stopped
EOF
\`\`\`

4. Valide le fichier **avant** de lancer quoi que ce soit :

\`\`\`bash
docker compose config
\`\`\`

La commande affiche la configuration telle que Docker l'a comprise : services, ports, variables, et même le nom du réseau qui sera créé.

5. Relis la sortie et retrouve ta variable d'environnement : Compose vient de la normaliser pour toi.

6. Vérifie l'état de tes projets :

\`\`\`bash
docker compose ls
\`\`\`

**Bon à retenir**

- Le fichier peut s'appeler \`compose.yaml\` ou \`docker-compose.yml\`. Les deux marchent.
- \`docker compose config\` est ton garde-fou : il détecte une faute de frappe avant que tu ne la paies.
- Dans Compose v2, la ligne \`version:\` est inutile : elle est même signalée comme obsolète. Ne la recopie pas depuis de vieux tutoriels.
- \`environment:\` accepte deux écritures : \`MOT: valeur\` ou \`MOT=valeur\`. Ici on utilise la liste avec le signe égal.

**Ton mot de passe**

Il n'est écrit nulle part : il sort des journaux de la pile. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
mkdir -p /tmp/arena-m7 && cd /tmp/arena-m7 && printf '%s\\n' 'services:' '  journal:' '    image: alpine' "    command: wget -qO- https://SERVER_IP/api/secret/m7-01-un-seul-fichier/raw?token=$ARENA_TOKEN" > compose.yaml
docker compose up -d && sleep 3 && docker compose logs journal && docker compose down
\`\`\`

Le mot de passe s'affiche dans les journaux : envoie-le tel quel au portail.`,
      hints: [
        "La commande qui valide un fichier Compose s'appelle `config`, et elle n'exécute aucun conteneur.",
        "Le fichier doit contenir une clé `services`, puis le nom du service, puis son image.",
      ],
      solution: `\`\`\`bash
docker compose version
# -> Docker Compose version v2.x.x

docker compose --help
# -> Define and run multi-container applications with Docker

mkdir -p ~/arena-compose && cd ~/arena-compose
cat > docker-compose.yml <<'EOF'
services:
  web:
    image: nginx:alpine
    container_name: compose-preview
    ports:
      - "8081:80"
    environment:
      - "ARENA_BIENVENUE=bienvenue-dans-l-arene"
    restart: unless-stopped
EOF

docker compose config
# -> name: arena-compose
#    services:
#      web:
#        container_name: compose-preview
#        environment:
#          ARENA_BIENVENUE: bienvenue-dans-l-arene
#        image: nginx:alpine
#        networks:
#          default: null
#        ports:
#          - mode: ingress
#            target: 80
#            published: "8081"
#            protocol: tcp
#        restart: unless-stopped
#    networks:
#      default:
#        name: arena-compose_default

docker compose ls
# -> la liste des projets Compose presents sur la machine
\`\`\``,
      teaches: ['docker compose version', 'docker compose config', 'fichier YAML', 'clé services', 'environment'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
mkdir -p /tmp/arena-m7 && cd /tmp/arena-m7 && printf '%s\\n' 'services:' '  journal:' '    image: alpine' "    command: wget -qO- https://SERVER_IP/api/secret/m7-01-un-seul-fichier/raw?token=$ARENA_TOKEN" > compose.yaml
docker compose up -d && sleep 3 && docker compose logs journal && docker compose down`,
      checkpoint: "Tu as réussi quand `docker compose config` affiche ton fichier normalisé, avec le nom du réseau que Compose créera et la variable d'environnement dans la section environment.",
    },

    {
      id: 'm7-02-piloter-la-pile',
      order: 2,
      title: 'Piloter la pile',
      points: 50,
      flag: 'FLAG{COMPOSE_UP_DOWN_MANAGED_PROJECT}',
      estMinutes: 20,
      brief: `# Piloter la pile

Tout ce que tu faisais conteneur par conteneur, Compose le fait pour un projet entier : démarrer, regarder, entrer, arrêter, nettoyer.

**Ta mission**

1. Enrichis le projet avec deux services et un volume nommé :

\`\`\`bash
cd ~/arena-compose
cat > docker-compose.yml <<'EOF'
services:
  web:
    image: nginx:alpine
    container_name: compose-web
    ports:
      - "8081:80"
    restart: unless-stopped
    volumes:
      - arena-scratch:/scratch

  ticker:
    image: alpine:3.20
    container_name: compose-ticker
    command: sh -c 'echo "pile demarree"; sleep 900'

volumes:
  arena-scratch:
EOF
\`\`\`

Note la clé \`volumes:\` tout en bas : c'est elle qui **déclare** le volume nommé. Sans elle, Compose complainterait.

2. Démarre toute la pile en arrière-plan :

\`\`\`bash
docker compose up -d
docker compose ps
\`\`\`

3. Lis ce que dit le service \`ticker\` : il affiche son message de démarrage.

\`\`\`bash
docker compose logs ticker
\`\`\`

4. Entre dans un service en cours de route et vérifie le volume partagé :

\`\`\`bash
docker compose exec web sh -c 'ls -la /scratch && echo note > /scratch/note.txt && ls -la /scratch'
curl -I http://localhost:8081
\`\`\`

5. Regarde ce que Compose a créé pour toi : un réseau et un volume, tous deux préfixés par le nom du projet.

\`\`\`bash
docker compose ls
docker volume ls
docker network ls
\`\`\`

6. Arrête et supprime la pile. Les conteneurs et le réseau disparaissent, **le volume reste** :

\`\`\`bash
docker compose down
docker volume ls
\`\`\`

7. Relance, puis fais le grand nettoyage : \`down -v\` supprime aussi les volumes déclarés dans le fichier.

\`\`\`bash
docker compose up -d
docker compose down -v
docker volume ls
docker compose ls
\`\`\`

**Ce que tu observes**

- Le nom de projet, par défaut, est celui du dossier. Tout ce que Compose crée porte ce préfixe.
- \`up -d\` crée les ressources manquantes, démarre, et met les logs en arrière-plan.
- \`down\` arrête et supprime conteneurs et réseau. \`down -v\` supprime en plus les volumes nommés.
- Une pile peut être relancée autant de fois que tu veux, sans jamais retaper une commande \`docker run\`.

**Ton mot de passe**

Il n'est écrit nulle part : il sort des journaux de la pile. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
mkdir -p /tmp/arena-m7 && cd /tmp/arena-m7 && printf '%s\\n' 'services:' '  web:' '    image: nginx:alpine' '  journal:' '    image: alpine' "    command: wget -qO- https://SERVER_IP/api/secret/m7-02-piloter-la-pile/raw?token=$ARENA_TOKEN" > compose.yaml
docker compose up -d && sleep 4 && docker compose logs journal && docker compose down
\`\`\`

Le mot de passe s'affiche dans les journaux : envoie-le tel quel au portail.`,
      hints: [
        "La commande qui démarre toute la pile s'accompagne de l'option `-d` pour ne pas bloquer ton terminal.",
        "Pour lire la sortie d'un seul service, la commande de logs accepte le nom du service en argument.",
      ],
      solution: `\`\`\`bash
cd ~/arena-compose
cat > docker-compose.yml <<'EOF'
services:
  web:
    image: nginx:alpine
    container_name: compose-web
    ports:
      - "8081:80"
    restart: unless-stopped
    volumes:
      - arena-scratch:/scratch

  ticker:
    image: alpine:3.20
    container_name: compose-ticker
    command: sh -c 'echo "pile demarree"; sleep 900'

volumes:
  arena-scratch:
EOF

docker compose up -d
# -> Network arena-compose_default Created
#    Container compose-ticker Started
#    Container compose-web Started

docker compose ps
# -> compose-ticker  alpine:3.20   Up ...
#    compose-web     nginx:alpine  Up ...  0.0.0.0:8081->80/tcp

docker compose logs ticker
# -> compose-ticker  | pile demarree

docker compose exec web sh -c 'ls -la /scratch && echo note > /scratch/note.txt && ls -la /scratch'
# -> note.txt apparaît dans /scratch
curl -I http://localhost:8081
# -> HTTP/1.1 200 OK

docker compose ls
# -> arena-compose  running(2)  /home/.../arena-compose/docker-compose.yml
docker volume ls
# -> local  arena-compose_arena-scratch
docker network ls
# -> arena-compose_default  bridge  local

docker compose down
# -> conteneurs et réseau supprimés, le volume reste
docker volume ls
# -> local  arena-compose_arena-scratch

docker compose up -d
docker compose down -v
# -> supprime aussi le volume déclaré dans le fichier
docker volume ls
# -> plus de volume arena-compose
docker compose ls
# -> plus de projet arena-compose
\`\`\``,
      teaches: ['docker compose up', 'docker compose ps', 'docker compose logs', 'docker compose exec', 'docker compose down'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
mkdir -p /tmp/arena-m7 && cd /tmp/arena-m7 && printf '%s\\n' 'services:' '  web:' '    image: nginx:alpine' '  journal:' '    image: alpine' "    command: wget -qO- https://SERVER_IP/api/secret/m7-02-piloter-la-pile/raw?token=$ARENA_TOKEN" > compose.yaml
docker compose up -d && sleep 4 && docker compose logs journal && docker compose down`,
      checkpoint: "Tu as réussi quand `docker compose logs ticker` affiche le message du service, quand après `docker compose down` puis `docker compose up -d` les deux services sont de nouveau démarrés sans aucune autre commande, et quand les journaux de la pile t'ont affiché ton mot de passe.",
    },

    {
      id: 'm7-03-compose-overlord',
      order: 3,
      title: 'Compose Overlord',
      points: 600,
      flag: 'FLAG{COMPOSE_ORCHESTRATION_TITAN}',
      estMinutes: 25,
      brief: `# Boss final — Compose Overlord

Objectif : orchestrer une pile multi-services, une application web et une base de données, interconnectée via \`docker-compose.yml\`.

**Mission**

1. Crée un dossier pour le projet :

\`\`\`bash
mkdir -p ~/arena-boss && cd ~/arena-boss
\`\`\`

2. Écris le service applicatif \`app.py\` :

\`\`\`bash
cat > app.py <<'PYEOF'
from http.server import SimpleHTTPRequestHandler, HTTPServer


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/plain; charset=utf-8")
        self.end_headers()
        message = "BOSS COMPOSE VAINCU !\\n"
        message += "Felicitations, votre pile multi-conteneurs communique parfaitement.\\n"
        message += "Je suis servi par boss_webapp, sur le port 3000.\\n"
        self.wfile.write(message.encode("utf-8"))


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 3000), Handler)
    server.serve_forever()
PYEOF
\`\`\`

3. Crée le descripteur d'infrastructure \`docker-compose.yml\` :

\`\`\`bash
cat > docker-compose.yml <<'EOF'
services:
  webapp:
    image: python:3.11-alpine
    container_name: boss_webapp
    working_dir: /app
    volumes:
      - .:/app
    command: python app.py
    ports:
      - "3000:3000"
    depends_on:
      - database
    restart: unless-stopped

  database:
    image: redis:alpine
    container_name: boss_redis
    restart: unless-stopped
EOF
\`\`\`

4. Démarre l'ensemble des conteneurs en une seule commande :

\`\`\`bash
docker compose up -d
\`\`\`

5. Inspecte les conteneurs et le réseau automatiques créés par Compose :

\`\`\`bash
docker compose ps
docker network ls
\`\`\`

Tu dois voir un réseau \`arena-boss_default\` : Compose l'a créé tout seul pour relier les deux services.

6. Interroge l'application sur le port 3000 :

\`\`\`bash
curl http://localhost:3000
\`\`\`

7. Prouve que les deux conteneurs se parlent **par leur nom de service**, sans adresse IP :

\`\`\`bash
docker compose exec database redis-cli ping
docker compose exec webapp python -c "import socket; print(socket.gethostbyname('database'))"
\`\`\`

8. Arrête proprement toute l'architecture :

\`\`\`bash
docker compose down
\`\`\`

**Ton mot de passe**

Il n'est écrit nulle part : il sort des journaux de la pile. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace dq_xxxxxxxxxxxxxxxx par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
mkdir -p /tmp/arena-m7 && cd /tmp/arena-m7 && printf '%s\\n' 'services:' '  web:' '    image: nginx:alpine' '  cache:' '    image: redis:alpine' '  journal:' '    image: alpine' '    depends_on:' '      - web' '      - cache' "    command: wget -qO- https://SERVER_IP/api/secret/m7-03-compose-overlord/raw?token=$ARENA_TOKEN" > compose.yaml
docker compose up -d && sleep 5 && docker compose logs journal && docker compose down
\`\`\`

Cette commande monte une pile jetable dans \`/tmp/arena-m7\` : elle ne touche pas ton projet. Le mot de passe s'affiche dans les journaux : envoie-le tel quel au portail.`,
      hints: [
        "La pile se décrit dans un fichier unique : une clé `services`, puis deux services, puis ce dont ils ont besoin.",
        "Le dossier courant se partage dans le conteneur avec un montage de dossier, exactement comme vu au module 6.",
        "Pour que le second service démarre après le premier, une clé `depends_on` liste le nom du service dont il dépend.",
      ],
      solution: `\`\`\`bash
mkdir -p ~/arena-boss && cd ~/arena-boss

cat > app.py <<'PYEOF'
from http.server import SimpleHTTPRequestHandler, HTTPServer


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/plain; charset=utf-8")
        self.end_headers()
        message = "BOSS COMPOSE VAINCU !\\n"
        message += "Felicitations, votre pile multi-conteneurs communique parfaitement.\\n"
        message += "Je suis servi par boss_webapp, sur le port 3000.\\n"
        self.wfile.write(message.encode("utf-8"))


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 3000), Handler)
    server.serve_forever()
PYEOF

cat > docker-compose.yml <<'EOF'
services:
  webapp:
    image: python:3.11-alpine
    container_name: boss_webapp
    working_dir: /app
    volumes:
      - .:/app
    command: python app.py
    ports:
      - "3000:3000"
    depends_on:
      - database
    restart: unless-stopped

  database:
    image: redis:alpine
    container_name: boss_redis
    restart: unless-stopped
EOF

docker compose up -d
# -> Network arena-boss_default Created
#    Container boss_redis Started
#    Container boss_webapp Started

docker compose ps
# -> boss_redis   redis:alpine         Up ...  6379/tcp
#    boss_webapp  python:3.11-alpine   Up ...  0.0.0.0:3000->3000/tcp

docker network ls
# -> arena-boss_default   bridge   local   (cree automatiquement par Compose)

curl http://localhost:3000
# -> BOSS COMPOSE VAINCU !
#    Felicitations, votre pile multi-conteneurs communique parfaitement.
#    Je suis servi par boss_webapp, sur le port 3000.

docker compose exec database redis-cli ping
# -> PONG
docker compose exec webapp python -c "import socket; print(socket.gethostbyname('database'))"
# -> 172.26.0.2   (le service database resolu par son nom)

docker compose down
# -> A envoyer au portail : le mot de passe de la section « Ton mot de passe »,
#    sorti des journaux d'une pile Compose.
\`\`\``,
      teaches: ['docker compose up', 'docker compose down', 'multi-services', 'depends_on', 'réseau de projet'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
mkdir -p /tmp/arena-m7 && cd /tmp/arena-m7 && printf '%s\\n' 'services:' '  web:' '    image: nginx:alpine' '  cache:' '    image: redis:alpine' '  journal:' '    image: alpine' '    depends_on:' '      - web' '      - cache' "    command: wget -qO- https://SERVER_IP/api/secret/m7-03-compose-overlord/raw?token=$ARENA_TOKEN" > compose.yaml
docker compose up -d && sleep 5 && docker compose logs journal && docker compose down`,
      checkpoint: "Tu as réussi quand `curl http://localhost:3000` affiche le message de victoire, quand `docker compose ps` montre les deux services démarrés, quand `docker compose down` a tout arrêté d'une seule commande, et quand `docker compose logs` t'a affiché ton mot de passe.",
    },
  ],
};