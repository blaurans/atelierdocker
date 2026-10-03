// Module 4 — Réseau & ports
// La quête phare qui termine le module est la mission officielle n°3 « Port Master ».
export default {
  meta: {
    slug: 'm4-reseau-et-ports',
    module: 4,
    title: 'Réseau & ports',
    tagline: 'Le réseau par défaut, la traduction de ports, et le DNS interne',
    icon: '🌐',
  },

  quests: [
    {
      id: 'm4-01-reseau-par-defaut',
      order: 1,
      title: 'Le réseau par défaut',
      points: 25,
      flag: 'FLAG{BRIDGE_DEFAULT_NETWORK_ANATOMY}',
      estMinutes: 12,
      brief: `# Le réseau par défaut

Un conteneur n'est pas seul au monde : Docker le branche automatiquement sur un réseau virtuel privé. Le premier réseau s'appelle \`bridge\`, et c'est celui que tu utilises sans le dire.

**Ta mission**

1. Liste les réseaux de ta machine :

\`\`\`bash
docker network ls
\`\`\`

2. Regarde le réseau par défaut en détail :

\`\`\`bash
docker network inspect bridge
\`\`\`

3. Démarre un conteneur qui attend cinq minutes, puis regarde sur quel réseau il s'est branché :

\`\`\`bash
docker run -d --name pont-demo alpine sleep 300
docker inspect pont-demo --format '{{.HostConfig.NetworkMode}}'
docker inspect pont-demo --format '{{json .NetworkSettings.Networks}}'
\`\`\`

4. Supprime le conteneur :

\`\`\`bash
docker rm -f pont-demo
\`\`\`

**Ce que tu observes**

- Trois réseaux existent toujours : \`bridge\`, \`host\` et \`none\`.
- Le réseau \`bridge\` a un adresseage privé, typiquement en \`172.17.0.0/16\`, avec une passerelle et un serveur DNS interne.
- Un conteneur lancé sans option réseau se branche sur \`bridge\`, et reçoit une adresse IP privée.
- Ce réseau a **deux limites** qu'il faut connaître :
  - sur le \`bridge\` par défaut, deux conteneurs ne se parlent **pas par leur nom** : le DNS interne de Docker ne fonctionne que sur les réseaux que tu crées toi-même (module 4, mission « Se parler par son nom ») ;
  - l'accès à Internet passe par la passerelle, en \`NAT\` : la machine hôte est joignable sur \`172.17.0.1\`, mais elle est surtout là pour le routage sortant.

**Ton mot de passe**

Il n'est écrit nulle part : il sort de la réponse HTTP du port que tu as publié. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f pont-8081 > /dev/null 2>&1; docker run -d -p 8081:80 --name pont-8081 nginx:alpine && docker exec pont-8081 wget -qO /usr/share/nginx/html/index.html "http://SERVER_IP:8000/api/secret/m4-01-reseau-par-defaut/raw?token=$ARENA_TOKEN"
curl -s --retry 5 --retry-delay 1 http://SERVER_IP:8081 && docker rm -f pont-8081
\`\`\`

La réponse HTTP affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "La commande qui liste les objets réseau de Docker est la même que pour les conteneurs, avec un mot de plus.",
        "Le réseau s'appelle bridge, et le paramètre `NetworkMode` d'un conteneur dit sur lequel il est branché.",
      ],
      solution: `\`\`\`bash
docker network ls
# -> NETWORK ID  NAME    DRIVER  SCOPE
#    ee0b6fd     bridge  bridge  local
#    1b6f19d     host    host    local
#    6ab2c39     none    null    local

docker network inspect bridge
# -> un JSON avec la plage d'adresses (IPAM.Config), la passerelle, le serveur DNS interne
#    et un membre "Options" qui contient notamment les regles de masquerade

docker run -d --name pont-demo alpine sleep 300
docker inspect pont-demo --format '{{.HostConfig.NetworkMode}}'
# -> bridge

docker inspect pont-demo --format '{{json .NetworkSettings.Networks}}'
# -> {"bridge":{"IPAddress":"172.17.0.2","Gateway":"172.17.0.1", ...}}

docker rm -f pont-demo
\`\`\``,
      teaches: ['docker network ls', 'docker network inspect', 'réseau bridge', 'NetworkMode', 'adresse IP privée'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f pont-8081 > /dev/null 2>&1; docker run -d -p 8081:80 --name pont-8081 nginx:alpine && docker exec pont-8081 wget -qO /usr/share/nginx/html/index.html "http://SERVER_IP:8000/api/secret/m4-01-reseau-par-defaut/raw?token=$ARENA_TOKEN"
curl -s --retry 5 --retry-delay 1 http://SERVER_IP:8081 && docker rm -f pont-8081`,
      checkpoint: "Tu as réussi quand `docker network ls` montre les trois réseaux bridge, host et none, et que tu sais dire sur quel réseau est branché un conteneur lancé sans option réseau.",
    },

    {
      id: 'm4-02-traduire-un-port',
      order: 2,
      title: 'Traduire un port',
      points: 25,
      flag: 'FLAG{PORT_FLAG_HOST_GUEST_MAPPING}',
      estMinutes: 15,
      brief: `# Traduire un port

Un conteneur a son propre monde : ses ports ne sont pas ceux de ta machine. Pour ouvrir une page web servie par un conteneur, il faut **traduire** un port de ta machine vers un port du conteneur.

La syntaxe est toujours la même : \`-p PORT_HOTE:PORT_CONTENEUR\`.

**Ta mission**

1. Démarre un serveur web dans un conteneur, en arrière-plan, avec le port 9090 de ta machine relié au port 80 du conteneur :

\`\`\`bash
docker run -d -p 9090:80 --name pont-port nginx:alpine
\`\`\`

2. Regarde la colonne **PORTS** de \`docker ps\`, puis demande la traduction à Docker :

\`\`\`bash
docker ps
docker port pont-port
\`\`\`

3. Teste la page servie :

\`\`\`bash
curl -I http://localhost:9090
\`\`\`

Tu dois lire une réponse \`HTTP/1.1 200 OK\`. Ouvre aussi \`http://localhost:9090\` dans ton navigateur.

4. Coupe et relance le conteneur, puis teste de nouveau : la traduction a survécu au redémarrage.

\`\`\`bash
docker stop pont-port
docker start pont-port
curl -I http://localhost:9090
\`\`\`

5. Compare avec l'option \`-P\` (majuscule), qui publie automatiquement tous les ports déclarés par l'image :

\`\`\`bash
docker run -d -P --name pont-auto nginx:alpine
docker port pont-auto
\`\`\`

Docker a choisi un port libre au hasard, souvent au-dessus de 30000. Récupère-le automatiquement, puis teste :

\`\`\`bash
PORT_AUTOMATIQUE=$(docker port pont-auto | sed 's/.*://')
curl -I "http://localhost:$PORT_AUTOMATIQUE"
\`\`\`

6. Nettoie les deux conteneurs :

\`\`\`bash
docker stop pont-auto
docker rm pont-auto pont-port
\`\`\`

**Bon à retenir**

- Le port de gauche est sur **ta** machine, celui de droite est **dans** le conteneur. L'ordre inverse ne fonctionne pas.
- \`-p\` explicite un port, \`-P\` publie d'office tous les ports de l'image. En production, on préfère \`-p\` : on sait ce qu'on ouvre.
- \`localhost\` fonctionne parce que Docker publie le port sur toutes les interfaces de ta machine.

**Ton mot de passe**

Il n'est écrit nulle part : il sort de la réponse HTTP du port que tu as publié. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f pont-9090 > /dev/null 2>&1; docker run -d -p 9090:80 --name pont-9090 nginx:alpine && docker exec pont-9090 wget -qO /usr/share/nginx/html/index.html "http://SERVER_IP:8000/api/secret/m4-02-traduire-un-port/raw?token=$ARENA_TOKEN"
curl -s --retry 5 --retry-delay 1 http://SERVER_IP:9090 && docker rm -f pont-9090
\`\`\`

La réponse HTTP affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "L'option de publication s'écrit `-p`, suivie de deux nombres séparés par deux-points : celui de ta machine d'abord.",
        "La colonne PORTS de `docker ps` affiche la traduction sous la forme 9090 vers 80, avec la flèche entre les deux.",
      ],
      solution: `\`\`\`bash
docker run -d -p 9090:80 --name pont-port nginx:alpine
# -> identifiant du conteneur

docker ps
# -> pont-port  Up ...  0.0.0.0:9090->80/tcp
docker port pont-port
# -> 80/tcp -> 0.0.0.0:9090

curl -I http://localhost:9090
# -> HTTP/1.1 200 OK
#    Server: nginx/1.27.x

docker stop pont-port
docker start pont-port
curl -I http://localhost:9090
# -> HTTP/1.1 200 OK   (la traduction a ete conservee)

docker run -d -P --name pont-auto nginx:alpine
docker port pont-auto
# -> 80/tcp -> 0.0.0.0:32768   (un port libre choisi par Docker)

PORT_AUTOMATIQUE=$(docker port pont-auto | sed 's/.*://')
curl -I "http://localhost:$PORT_AUTOMATIQUE"
# -> HTTP/1.1 200 OK

docker stop pont-auto
docker rm pont-auto pont-port
\`\`\``,
      teaches: ['option -p', 'option -P', 'docker port', 'colonne PORTS', 'curl -I'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f pont-9090 > /dev/null 2>&1; docker run -d -p 9090:80 --name pont-9090 nginx:alpine && docker exec pont-9090 wget -qO /usr/share/nginx/html/index.html "http://SERVER_IP:8000/api/secret/m4-02-traduire-un-port/raw?token=$ARENA_TOKEN"
curl -s --retry 5 --retry-delay 1 http://SERVER_IP:9090 && docker rm -f pont-9090`,
      checkpoint: "Tu as réussi quand `curl -I http://localhost:9090` a répondu `200 OK`, et quand `docker port pont-port` t'a montré la traduction 9090 vers 80.",
    },

    {
      id: 'm4-03-se-parler-par-son-nom',
      order: 3,
      title: 'Se parler par son nom',
      points: 50,
      flag: 'FLAG{DOCKER_DNS_RESOLVES_BY_NAME}',
      estMinutes: 20,
      brief: `# Se parler par son nom

Sur un réseau que **tu** crées, Docker installe un petit serveur DNS : un conteneur trouve un autre conteneur par son nom. Fini les adresses IP à deviner.

**Ta mission**

1. Crée ton propre réseau :

\`\`\`bash
docker network create arena-net
\`\`\`

2. Démarre un serveur web dessus, avec un nom reconnaissable :

\`\`\`bash
docker run -d --name arena-web --network arena-net nginx:alpine
\`\`\`

3. Fais-lui servir une page reconnaissable, puis interroge-le **depuis un autre conteneur, par son nom** :

\`\`\`bash
docker exec arena-web sh -c 'echo "page servie par arena-web" > /usr/share/nginx/html/index.html'
docker run --rm --network arena-net alpine wget -qO- http://arena-web/
\`\`\`

Tu dois lire \`page servie par arena-web\` : le second conteneur a trouvé \`arena-web\` sans connaître son adresse IP.

4. Confirme que le nom est bien résolu en adresse IP :

\`\`\`bash
docker run --rm --network arena-net alpine ping -c 2 arena-web
\`\`\`

5. Ajoute un deuxième service, une base de données, et interroge-la par son nom :

\`\`\`bash
docker run -d --name arena-cache --network arena-net redis:alpine
docker run --rm --network arena-net redis:alpine redis-cli -h arena-cache ping
\`\`\`

Tu dois lire \`PONG\`.

6. Regarde la liste des membres du réseau :

\`\`\`bash
docker network inspect arena-net
\`\`\`

7. Expérience attendue : depuis le réseau par défaut, le nom n'existe plus.

\`\`\`bash
docker run --rm alpine wget -qO- http://arena-web/
\`\`\`

Cette commande **échoue**, et c'est le but : tu dois lire \`wget: bad address 'arena-web'\`. Le réseau \`bridge\` par défaut ne fournit pas ce DNS.

8. Nettoie tout :

\`\`\`bash
docker stop arena-web arena-cache
docker rm arena-web arena-cache
docker network rm arena-net
\`\`\`

**Bon à retenir**

- L'option \`--network\` attache le conteneur au bon réseau dès sa création.
- Sur un réseau personnalisé, le nom du conteneur est directement utilisable comme adresse web ou comme hôte de base de données.
- Un conteneur ne peut être détaché d'un réseau personnalisé une fois créé : il faut en créer un autre.

**Ton mot de passe**

Il n'est écrit nulle part : il sort de la réponse HTTP du port que tu as publié. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f pont-8082 > /dev/null 2>&1; docker run -d -p 8082:80 --name pont-8082 nginx:alpine && docker exec pont-8082 wget -qO /usr/share/nginx/html/index.html "http://SERVER_IP:8000/api/secret/m4-03-se-parler-par-son-nom/raw?token=$ARENA_TOKEN"
curl -s --retry 5 --retry-delay 1 http://SERVER_IP:8082 && docker rm -f pont-8082
\`\`\`

La réponse HTTP affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "La commande pour créer un réseau prend un seul argument : le nom du réseau.",
        "Pour demander une page web depuis un conteneur qui n'a pas curl, l'image alpine contient l'outil `wget`.",
      ],
      solution: `\`\`\`bash
docker network create arena-net
# -> identifiant du nouveau reseau bridge

docker run -d --name arena-web --network arena-net nginx:alpine

docker exec arena-web sh -c 'echo "page servie par arena-web" > /usr/share/nginx/html/index.html'
docker run --rm --network arena-net alpine wget -qO- http://arena-web/
# -> page servie par arena-web   (le nom a ete resolu automatiquement)

docker run --rm --network arena-net alpine ping -c 2 arena-web
# -> PING arena-web (172.26.0.2): 56 data bytes ... 0% packet loss

docker run -d --name arena-cache --network arena-net redis:alpine
docker run --rm --network arena-net redis:alpine redis-cli -h arena-cache ping
# -> PONG

docker network inspect arena-net
# -> dans "Containers" : arena-cache et arena-web avec leur adresse IP

docker run --rm alpine wget -qO- http://arena-web/
# -> wget: bad address 'arena-web'   (echec attendu : pas de DNS sur le bridge par defaut)

docker stop arena-web arena-cache
docker rm arena-web arena-cache
docker network rm arena-net
\`\`\``,
      teaches: ['docker network create', 'option --network', 'résolution DNS interne', 'wget', 'redis-cli'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f pont-8082 > /dev/null 2>&1; docker run -d -p 8082:80 --name pont-8082 nginx:alpine && docker exec pont-8082 wget -qO /usr/share/nginx/html/index.html "http://SERVER_IP:8000/api/secret/m4-03-se-parler-par-son-nom/raw?token=$ARENA_TOKEN"
curl -s --retry 5 --retry-delay 1 http://SERVER_IP:8082 && docker rm -f pont-8082`,
      checkpoint: "Tu as réussi quand `wget -qO- http://arena-web/` a affiché la page servie par `arena-web` depuis un conteneur du réseau `arena-net`, quand la même commande a échoué sur le réseau par défaut, et quand `curl` a affiché ton mot de passe sur le port publié.",
    },

    {
      id: 'm4-04-port-master',
      order: 4,
      title: 'Port Master',
      points: 300,
      flag: 'FLAG{PORT_MAPPING_WEB_EXPERT_8080}',
      estMinutes: 22,
      brief: `# Mission phare — Port Master

Objectif : exécuter un conteneur en arrière-plan et router les connexions jusqu'à lui avec une traduction de port.

**Mission**

1. Démarre un serveur Nginx en arrière-plan, en redirigeant le port 8080 de ta machine vers le port 80 du conteneur :

\`\`\`bash
docker run -d -p 8080:80 --name mission-webserver nginx:alpine
\`\`\`

2. Vérifie que le conteneur tourne bien et que la traduction est en place :

\`\`\`bash
docker ps
\`\`\`

La colonne **PORTS** doit afficher \`0.0.0.0:8080->80/tcp\`.

3. Teste l'accès web avec \`curl\` ou ton navigateur, sur \`http://localhost:8080\` :

\`\`\`bash
curl -I http://localhost:8080
\`\`\`

4. Défi : modifie **en direct** la page servie, sans arrêter le conteneur, grâce à \`docker exec\`. Pose d'abord ton jeton d'équipe — celui affiché à l'inscription — avec la commande \`export ARENA_TOKEN='dq_…'\`, puis :

\`\`\`bash
docker exec mission-webserver wget -qO /usr/share/nginx/html/index.html "http://SERVER_IP:8000/api/secret/m4-04-port-master/raw?token=$ARENA_TOKEN"
\`\`\`

5. Vérifie la modification, toujours sans redémarrer quoi que ce soit :

\`\`\`bash
curl http://localhost:8080
\`\`\`

Tu dois lire ton mot de passe, servi par le conteneur. Remplace SERVER_IP par l'adresse du portail.

6. Nettoie le conteneur :

\`\`\`bash
docker stop mission-webserver && docker rm mission-webserver
\`\`\`

**Ton mot de passe**

Il n'est écrit nulle part : il sort de la réponse HTTP du port que tu as publié. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace dq_xxxxxxxxxxxxxxxx par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f mission-webserver > /dev/null 2>&1; docker run -d -p 8080:80 --name mission-webserver nginx:alpine && docker exec mission-webserver wget -qO /usr/share/nginx/html/index.html "http://SERVER_IP:8000/api/secret/m4-04-port-master/raw?token=$ARENA_TOKEN"
curl -s --retry 5 --retry-delay 1 http://SERVER_IP:8080 && docker rm -f mission-webserver
\`\`\`

La réponse HTTP affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "Reprends le duo `-d` (arrière-plan) et `-p 8080:80` déjà utilisé à la quête précédente, avec un nom de conteneur imposé.",
        "Le serveur web nginx sert ses fichiers dans un dossier précis de l'image. C'est là qu'il faut écrire.",
        "`wget -qO fichier adresse` va chercher une page et l'écrit dans un fichier : le même geste que `echo`, sans guillemet à oublier.",
      ],
      solution: `\`\`\`bash
docker run -d -p 8080:80 --name mission-webserver nginx:alpine
# -> identifiant du conteneur

docker ps
# -> mission-webserver  Up ...  0.0.0.0:8080->80/tcp

curl -I http://localhost:8080
# -> HTTP/1.1 200 OK
#    Server: nginx/1.27.x

docker exec mission-webserver wget -qO /usr/share/nginx/html/index.html "http://SERVER_IP:8000/api/secret/m4-04-port-master/raw?token=$ARENA_TOKEN"
curl http://localhost:8080
# -> FLAG{...}    le mot de passe de TON equipe, servi par le conteneur

docker stop mission-webserver && docker rm mission-webserver
# -> mission-webserver
#    mission-webserver
# A envoyer au portail : le mot de passe affiche ci-dessus
\`\`\``,
      teaches: ['déploiement web', 'traduction de port 8080', 'docker exec en production', 'nginx'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f mission-webserver > /dev/null 2>&1; docker run -d -p 8080:80 --name mission-webserver nginx:alpine && docker exec mission-webserver wget -qO /usr/share/nginx/html/index.html "http://SERVER_IP:8000/api/secret/m4-04-port-master/raw?token=$ARENA_TOKEN"
curl -s --retry 5 --retry-delay 1 http://SERVER_IP:8080 && docker rm -f mission-webserver`,
      checkpoint: "Tu as réussi quand `curl http://localhost:8080` affiche le mot de passe sans qu'aucun conteneur n'ait été redémarré, puis quand le conteneur a été supprimé.",
    },
  ],
};