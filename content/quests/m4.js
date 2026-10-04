// Atelier 4 — Faire les se parler
//
// Le site de la librairie tourne, mais il est seul sur sa machine. L'atelier
// 3 a montré qu'un conteneur est cloisonné ; celui-ci montre ce que ce
// cloisonnement permet : plusieurs conteneurs qui se parlent, sur un réseau
// privé, sans être exposés.
//
// Le fil rouge avance : la librairie a deux services — le site et une petite
// base de données — et ils doivent se trouver sans passer par la machine hôte.
//
// Mêmes règles qu'aux ateliers 1 à 3 : aucun artefact mort, un `recall` seulement
// quand la réponse n'est pas dans l'énoncé, un `charge` qui finit par 0.
export default {
  meta: {
    slug: 'm4-faire-les-se-parler',
    module: 4,
    title: 'Faire les se parler',
    tagline: 'Ports, réseaux privés, et un service qui trouve l\'autre par son nom',
    icon: '🔗',
  },

  quests: [
    {
      id: 'm4-01-le-reseau-par-defaut',
      order: 1,
      title: 'Le réseau par défaut',
      points: 25,
      flag: 'FLAG{BRIDGE_DEFAULT_INSPECTED_PRIVATE_IP}',
      estMinutes: 13,
      brief: `# Le réseau par défaut

Quand tu lances un conteneur sans rien demander, Docker le branche sur un réseau
qui existe déjà. Tu n'as rien configuré, et pourtant ton conteneur est
joignable — de l'intérieur, par d'autres conteneurs.

**Ta mission**

1. Liste les réseaux. Un seul devrait s'appeler \`bridge\` :

\`\`\`bash
docker network ls
\`\`\`

2. Regarde ce réseau de près. Il a un sous-réseau, une passerelle, et des
   conteneurs connectés :

\`\`\`bash
docker network inspect bridge
\`\`\`

Trois informations à en retenir : \`Subnet\`, \`Gateway\`, et la liste des
conteneurs sous \`Containers\`.

3. Lance un conteneur et regarde **de l'intérieur** son adresse IP. L'image
   \`alpine\` a une commande \`ip\` :

\`\`\`bash
docker run --rm alpine ip -4 addr show eth0
\`\`\`

4. Relance un conteneur, et compare son adresse avec celle de l'étape 3. Les
   deux sont-elles identiques ?

\`\`\`bash
docker run --rm alpine sh -c 'hostname -i'
\`\`\`

**Ce que tu observes**

- L'adresse du conteneur commence par \`172.\` — un préfixe **privé**, prévu pour
  un réseau interne. Deux conteneurs du même réseau peuvent se joindre par leur
  adresse.
- Chaque conteneur a une adresse **différente**. L'IP d'un conteneur n'est pas
  stable : elle change au redémarrage.
- Le réseau \`bridge\` est celui par défaut. Tu ne l'as pas demandé, il est là.

**Bon à retenir**

Une adresse \`172.17.\` sur ta machine n'est pas celle de ton conteneur — c'est
celle d'un **autre** poste du réseau de l'établissement. Si deux machines se
croient sur le même \`172.17.0.2\`, c'est normal : ils ont chacune leur propre
Docker.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m4-01-le-reseau-par-defaut/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "`docker network ls` liste trois réseaux par défaut : bridge, host et none. bridge est celui qui t'intéresse — les deux autres sont des modes particuliers.",
        "`docker network inspect bridge` sort du JSON : cherche `Subnet`, `Gateway` et `Containers`. C'est là que tu vois qui est connecté.",
        "`ip -4 addr show eth0` : `-4` pour IPv4, `addr show` pour les adresses, `eth0` pour l'interface réseau du conteneur. `hostname -i` fait la même chose en plus court.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm4-01-adresse',
          kind: 'mcq',
          prompt: 'Deux conteneurs lancés l\'un après l\'autre sur le réseau `bridge` ont-ils la même adresse IP ?',
          choices: [
            'Non : chaque conteneur reçoit une adresse différente du sous-réseau',
            'Oui : l\'adresse du réseau est la même pour tous',
            'Oui, si ils ont le même nom',
            'Cela dépend du nombre de conteneurs déjà lancés',
          ],
          answer: 0,
          explanation: "Chaque conteneur a sa adresse dans le sous-réseau du réseau. C'est ce qui rend l'IP inutilisable comme référence durable — d'où la résolution par nom, qu'on verra en quête 3.",
          required: true,
        },
        {
          id: 'm4-01-prefixe',
          kind: 'mcq',
          prompt: 'Un conteneur affiche `172.17.0.2`. Où se trouve cette machine ?',
          choices: [
            'Dans un réseau privé, propre au réseau Docker de ce poste',
            'Sur Internet',
            'Sur le réseau de l\'établissement, forcément',
            'Sur la machine qui héberge le portail',
          ],
          answer: 0,
          explanation: "Le préfixe 172.16 à 172.31 est réservé aux réseaux privés (RFC 1918). Deux postes ayant chacun leur Docker ont chacun un 172.17.0.2 : ce n'est pas une collision, c'est normal.",
          required: true,
        },
        {
          id: 'm4-01-bridge',
          kind: 'boolean',
          prompt: 'Il faut créer un réseau avant de lancer un conteneur pour qu\'il soit joignable.',
          answer: false,
          explanation: "Faux : le réseau `bridge` existe déjà et s'applique par défaut. Créer son propre réseau (quête 3) ne sert que quand on veut un cloisonnement ou des noms lisibles.",
          required: false,
        },
      ],
      solution: `\`\`\`bash
docker network ls
# -> NETWORK ID     NAME      DRIVER    SCOPE
# -> a1b2c3d4e5f6   bridge    bridge    local
# -> 9f8e7d6c5b4a   host      host      local
# -> 0a1b2c3d4e5   none      null      local

docker network inspect bridge
# -> "Subnet": "172.17.0.0/16",
# -> "Gateway": "172.17.0.1",
# -> "Containers": {}

docker run --rm alpine ip -4 addr show eth0
# -> inet 172.17.0.2/16 brd 172.17.255.255 scope global eth0

docker run --rm alpine sh -c 'hostname -i'
# -> 172.17.0.3
\`\`\``,
      teaches: ['docker network ls', 'docker network inspect', 'réseau bridge', 'adresse privée', 'hostname -i'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m4-01-le-reseau-par-defaut/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais dire où se trouve l'adresse \`172.17.0.2\`, et pourquoi elle ne peut pas servir de référence durable.",
    },

    {
      id: 'm4-02-publier-un-port',
      order: 2,
      title: 'Publier un port',
      points: 25,
      flag: 'FLAG{PORT_PUBLISHED_VERDI_REACHABLE}',
      estMinutes: 13,
      brief: `# Publier un port

Un conteneur joignable par les autres conteneurs, c'est bien. Mais l'administrateur
de la librairie veut **tester depuis son navigateur**, et lui est sur la
machine hôte. Il faut donc ouvrir un passage : la publication de port.

**Ta mission**

1. Lance le site de la librairie avec un port publié, et note bien l'ordre des
   deux nombres :

\`\`\`bash
docker run -d --name verdi -p 8081:80 nginx:alpine
\`\`\`

2. Vérifie par trois chemins différents, et note lequel répond :

\`\`\`bash
curl -s -o /dev/null -w "localhost:8081 -> %{http_code}\\n" http://localhost:8081
curl -s -o /dev/null -w "172.17.0.1 -> %{http_code}\\n" http://172.17.0.1:8081
curl -s -o /dev/null -w "port 80 -> %{http_code}\\n" http://localhost:80
\`\`\`

3. Regarde ce que Docker a retenu, et compare avec ce que tu avais tapé :

\`\`\`bash
docker port verdi
\`\`\`

4. Inverse les deux nombres, juste pour voir ce qui se passe. Préviens-toi :
   le lancement va peut-être échouer.

\`\`\`bash
docker rm -f verdi
docker run -d --name verdi -p 80:8081 nginx:alpine
curl -s -o /dev/null -w "8081 -> %{http_code}\\n" http://localhost:8081
\`\`\`

5. Nettoie et remets les choses dans l'ordre :

\`\`\`bash
docker rm -f verdi
\`\`\`

**Ce que tu observes**

- Seul \`localhost:8081\` répond. Ni le port 80, ni l'adresse du réseau bridge :
  la publication crée un point d'entrée **sur la machine**, pas dans le réseau
  des conteneurs.
- \`docker port verdi\` affiche \`80/tcp -> 0.0.0.0:8081\`. À gauche ce qu'écoute
  dans le conteneur, à droite ce qui est atteint de l'extérieur. Docker a bien
  compris \`hôte:conteneur\`.
- À l'étape 4, \`curl localhost:8081\` ne répond plus : Nginx écoute sur 80 dans le
  conteneur, et tu as publié le 8081 de la machine sur le **80 du conteneur**,
  où personne n'écoute.

**Le piège, en une phrase**

\`hôte:conteneur\`, dans cet ordre. L'erreur inverse est la plus fréquente de
tout Docker, et elle ne dit rien.

**Bon à savoir**

Par défaut \`-p 8081:80\` publie sur **toutes** les interfaces de la machine. Pour
n'ouvrir que le localhost, on écrit \`-p 127.0.0.1:8081:80\` — utile quand le
service n'a rien à faire sur le réseau de l'établissement.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m4-02-publier-un-port/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "Le format est toujours `hôte:conteneur`. Si Nginx ne répond pas, tu as probablement inversé les deux nombres.",
        "`%{http_code}` est la façon de demander à `curl` d'afficher le code de réponse sans le corps. Pratique pour tester trois ports d'affilée.",
        "`docker port` affiche `port_conteneur -> port_hôte`. L'ordre y est l'inverse de celui de la commande : c'est normal, Docker affiche ce qu'il a compris.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      // Pas de `recall` : les deux nombres sont écrits dans le brief. Le QCM
      // porte la vraie difficulté, qui est l'ordre.
      check: [
        {
          id: 'm4-02-ordre',
          kind: 'mcq',
          prompt: 'Un serveur web écoute sur 80 dans le conteneur. Comment le rendre accessible sur le port 9090 de la machine ?',
          choices: ['`-p 9090:80`', '`-p 80:9090`', '`-p 8080:80`', '`--port 9090`'],
          answer: 0,
          explanation: "`hôte:conteneur`. Avec `-p 80:9090`, on publierait le port 80 de la machine sur le 9090 du conteneur, où Nginx n'écoute pas : rien ne répond, sans message d'erreur.",
          required: true,
        },
        {
          id: 'm4-02-portee',
          kind: 'mcq',
          prompt: 'Avec `-p 8081:80`, où le port 8081 est-il joignable ?',
          choices: [
            'Sur la machine hôte, depuis l\'extérieur',
            'Uniquement depuis les autres conteneurs',
            'Dans le réseau bridge, à l\'adresse 172.17.0.1',
            'Nulle part : `-p` ne publie rien',
          ],
          answer: 0,
          explanation: "`-p` crée une entrée sur la machine hôte. Les conteneurs se joignent entre eux par le réseau bridge sans aucune publication — c'est l'objet de la quête suivante.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
docker run -d --name verdi -p 8081:80 nginx:alpine

curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8081
# -> 200
curl -s -o /dev/null -w "%{http_code}\\n" http://172.17.0.1:8081
# -> 000        (rien : le port 8081 n'est pas sur le bridge)
curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:80
# -> 000

docker port verdi
# -> 80/tcp -> 0.0.0.0:8081

docker rm -f verdi
docker run -d --name verdi -p 80:8081 nginx:alpine
curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8081
# -> 000        (le 80 du conteneur n'a personne)

docker rm -f verdi
\`\`\``,
      teaches: ['-p', 'hôte:conteneur', 'docker port', 'codes curl', 'publication locale'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m4-02-publier-un-port/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand, devant un site qui ne répond pas sur le bon port, tu sais dire en une phrase quel nombre il faut inverser.",
    },

    {
      id: 'm4-03-se-parler-par-son-nom',
      order: 3,
      title: 'Se parler par son nom',
      points: 50,
      flag: 'FLAG{DNS_INTERNAL_BY_CONTAINER_NAME}',
      estMinutes: 16,
      brief: `# Se parler par son nom

La librairie a deux services : le site, et une base qui garde les commandes des
libraires. Sur la machine hôte, il faudrait publier des ports, se souvenir des
adresses IP, et les changer à chaque redémarrage.

Docker a mieux. Sur un réseau qu'on lui donne, les conteneurs se trouvent
**par leur nom**.

**Ta mission**

1. Crée un réseau nommé pour la librairie. Sur un réseau qu'on crée soi-même,
   Docker installe un résolveur de noms :

\`\`\`bash
docker network create reseau-verdi
docker network ls
\`\`\`

2. Lance la base de données, sans publier de port. \`redis\` est une base
   fréquemment utilisée, son image est petite :

\`\`\`bash
docker run -d --name verdi-db --network reseau-verdi redis:alpine
\`\`\`

3. Vérifie qu'aucun port n'a été publié, et regarde son adresse **dans son
   réseau** :

\`\`\`bash
docker port verdi-db
docker inspect verdi-db --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
\`\`\`

4. **Le test décisif.** Lance un conteneur sur le même réseau et demande-lui de
   joindre la base **par son nom** :

\`\`\`bash
docker run --rm --network reseau-verdi alpine sh -c 'ping -c 2 verdi-db'
\`\`\`

5. Vérifie que le nom est bien résolu, en lisant le DNS plutôt qu'en devinant :

\`\`\`bash
docker run --rm --network reseau-verdi alpine nslookup verdi-db
\`\`\`

6. Cherche ce qui échoue. Le site et la base sont deux conteneurs séparés : le
   site, lancé sans \`--network\`, n'est pas sur \`reseau-verdi\` :

\`\`\`bash
docker run --rm alpine nslookup verdi-db
\`\`\`

**Ce que tu observes**

- Étape 4 : \`verdi-db\` répond. Aucun port publié, aucune IP à connaître.
- Étape 5 : la résolution renvoie l'adresse de la base, confirmée par
  \`nslookup\`.
- Étape 6 : la même commande **échoue** hors du réseau. Le nom n'existe que pour
  les conteneurs du même réseau.

**Ce que ça change**

Un nom qui ne marche que dans un réseau est une **frontière**. Les services de la
librairie se parlent par leur nom, et personne ne peut les atteindre depuis la
machine sans publier un port. C'est le principe du « réseau privé par défaut » :
on n'expose que ce qui a besoin de l'être.

**Attention aux vieux noms**

Ces résolutions par nom ne fonctionnent que sur les réseaux que **vous** créez. Sur
le réseau \`bridge\` par défaut, une seule entrée DNS : celle du gateway. Un nom
comme \`verdi-db\` n'y fonctionnera pas, même si le conteneur s'appelle ainsi.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m4-03-se-parler-par-son-nom/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "Le réseau doit être **créé** avant. Sur `bridge`, le résolveur de noms n'installe qu'une entrée : celle du gateway.",
        "`docker run --network reseau-verdi` est l'option qui compte. Sans elle, le conteneur atterrit sur `bridge` et ne voit pas `verdi-db`.",
        "`nslookup` demande au résolveur. `ping` suppose que la cible réponde ; `nslookup` marche même si le service est arrêté.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      // Pas de `recall` non plus : `--network` figure dans les commandes.
      check: [
        {
          id: 'm4-03-dns',
          kind: 'mcq',
          prompt: 'Un conteneur nommé `verdi-db` est joignable par `ping verdi-db`. Depuis où ?',
          choices: [
            'Depuis n\'importe quel conteneur du même réseau',
            'Depuis n\'importe quelle machine du réseau de l\'établissement',
            'Depuis la machine hôte, sans configurer de port',
            'Depuis n\'importe quel conteneur, quel que soit son réseau',
          ],
          answer: 0,
          explanation: "C'est le principe : le nom est une frontière. Il n'existe que dans le réseau où le conteneur est, et c'est exactement ce qui rend un réseau privé sûr.",
          required: true,
        },
        {
          id: 'm4-03-bridge-dns',
          kind: 'boolean',
          prompt: 'La résolution par nom de conteneur fonctionne aussi sur le réseau `bridge` par défaut.',
          answer: false,
          explanation: "Faux, et c'est une surprise courante. Sur `bridge`, le résolveur ne connaît que le gateway. Pour avoir des noms, il faut créer son propre réseau — c'est l'objet de cette quête.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
docker network create reseau-verdi
# -> Network ID a1b2c3d4e5f6…   (le nom lisible suffit)

docker run -d --name verdi-db --network reseau-verdi redis:alpine
docker port verdi-db
# -> (rien : aucun port publié)
docker inspect verdi-db --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
# -> 172.18.0.2

docker run --rm --network reseau-verdi alpine sh -c 'ping -c 2 verdi-db'
# -> PING verdi-db (172.18.0.2): 56 data bytes
# -> 64 bytes from 172.18.0.2: seq=0 ttl=64 time=0.096 ms

docker run --rm --network reseau-verdi alpine nslookup verdi-db
# -> Name:    verdi-db
# -> Address: 172.18.0.2

docker run --rm alpine nslookup verdi-db
# -> nslookup: can't resolve 'verdi-db'   (hors du réseau, rien ne résout)

docker rm -f verdi-db
docker network rm reseau-verdi
\`\`\``,
      teaches: ['docker network create', '--network', 'résolution DNS interne', 'nslookup', 'réseau privé'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m4-03-se-parler-par-son-nom/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais pourquoi un nom de conteneur ne se résout pas hors de son réseau — et pourquoi c'est une bonne nouvelle.",
    },

    {
      id: 'm4-04-deux-services',
      order: 4,
      title: 'Deux services, une machine',
      points: 300,
      flag: 'FLAG{VERDI_STACK_SITE_AND_DB_ISOLATED}',
      estMinutes: 22,
      brief: `# Deux services, une machine

Le jalon de la migration : le site de la librairie et sa base tournent sur la
même machine, **sans que la base soit accessible de l'extérieur**. C'est le
déploiement qu'on veut au bout de l'atelier.

**Ta mission**

1. Prépare le terrain : un réseau pour la librairie, une base dedans, aucun port
   publié pour elle :

\`\`\`bash
docker network create reseau-verdi 2>/dev/null || true
docker run -d --name verdi-db --network reseau-verdi redis:alpine
\`\`\`

2. Lance le site, sur **le même** réseau, et publie son port. C'est le site qui
   est public, la base ne l'est pas :

\`\`\`bash
docker run -d --name verdi --network reseau-verdi -p 8080:80 nginx:alpine
curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8080
\`\`\`

3. Vérifie que le site voit la base par son nom, **depuis l'intérieur du
   conteneur du site** :

\`\`\`bash
docker exec verdi sh -c 'getent hosts verdi-db'
\`\`\`

4. Vérifie l'inverse : la base n'a pas de port, elle n'est donc joignable que
   depuis le réseau :

\`\`\`bash
curl -s -m 3 -o /dev/null -w "%{http_code}\\n" http://localhost:6379
\`\`\`

Le code \`000\` est la bonne nouvelle.

5. **Le test d'indépendance.** Supprime le site, et vérifie que la base
   continue de vivre :

\`\`\`bash
docker rm -f verdi
docker ps
\`\`\`

Puis recrée le site et vérifie qu'il retrouve la base par son nom. Rien à
reconfigurer.

6. Compare ta pile à ce que tu avais avant la migration : un serveur,
   un processus. Combien de ports sont publiés ? Combien de conteneurs ?

**Ce que tu observes**

- Étape 3 : \`verdi-db\` se résout **depuis le conteneur du site**.
- Étape 4 : le port 6379 de la machine est fermé. La base n'a aucune entrée
  depuis l'extérieur.
- Étape 5 : supprimer le site ne touche pas à la base. Ils sont indépendants —
  c'est tout l'intérêt.

**Ce que ça change en exploitation**

Ce schéma a une conséquence qu'il faut savoir nommer : si la base tombe, le site
reste debout mais ne fonctionne plus. On **peut** redémarrer un conteneur sans
toucher à l'autre. Sur une installation V1 où tout tournait dans le même
processus, un plantage emportait tout.

La consequence à dire au directeur : la base est un **point de défaillance
unique**, et c'est la prochaine étape du chantier — la sauvegarder.

**Ce que tu observes aussi**

Les conteneurs de cette pile se parlent par leur nom, jamais par une adresse IP.
C'est la seule chose à retenir de l'atelier : une IP change, un nom non.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m4-04-deux-services/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "Les deux conteneurs doivent être sur le **même** réseau. Si le site répond mais ne trouve pas la base, c'est qu'il est resté sur `bridge`.",
        "`docker exec` entre dans un conteneur en marche. La base de résolution y est `getent hosts`, disponible sans installer quoi que ce soit.",
        "Un `curl` qui expire affiche `000`. C'est le code de retour quand aucune connexion n'a pu être établie — donc le port est bien fermé.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm4-04-independance',
          kind: 'mcq',
          prompt: 'Tu supprimes le conteneur du site. Que devient la base ?',
          choices: [
            'Elle continue de tourner : les conteneurs sont indépendants',
            'Elle s\'arrête : elle dépend du site',
            'Elle est supprimée avec lui',
            'Elle redémarre sur un autre port',
          ],
          answer: 0,
          explanation: "Aucune dépendance de cycle de vie entre conteneurs : ils partagent un réseau, pas un destin. C'est l'inverse d'une installation où tout tournait dans un processus unique.",
          required: true,
        },
        {
          id: 'm4-04-exposition',
          kind: 'mcq',
          prompt: 'Quel conteneur de la pile est accessible depuis l\'extérieur ?',
          choices: [
            'Seulement le site : c\'est le seul à avoir un port publié',
            'Les deux : ils sont sur le même réseau',
            'La base : elle a un port 6379',
            'Aucun : la pile est privée',
          ],
          answer: 0,
          explanation: "Le site a `-p 8080:80`, la base n'a rien. Le réseau privé protège la base sans configuration supplémentaire : c'est le principe « réseau privé par défaut ».",
          required: true,
        },
        {
          id: 'm4-04-ssp',
          kind: 'boolean',
          prompt: 'Dans cette pile, la base de données est un point de défaillance unique : si elle tombe, le site ne peut plus rien faire.',
          answer: true,
          explanation: "Vrai — et c'est la prochaine étape du chantier. On le sait parce qu'on vient de voir que les deux conteneurs sont indépendants : la panne de l'un n'arrête pas l'autre, mais elle le rend inutile.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
docker network create reseau-verdi
docker run -d --name verdi-db --network reseau-verdi redis:alpine
docker run -d --name verdi --network reseau-verdi -p 8080:80 nginx:alpine

curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8080
# -> 200

docker exec verdi sh -c 'getent hosts verdi-db'
# -> 172.18.0.2      verdi-db

curl -s -m 3 -o /dev/null -w "%{http_code}\\n" http://localhost:6379
# -> 000             (fermé, c'est voulu)

docker rm -f verdi
docker ps
# -> CONTAINER ID  IMAGE           STATUS    NAMES
# -> 9a8b7c6d5e4f   redis:alpine   Up 1 min   verdi-db

# Le site se recrée et retrouve la base, sans rien reconfigurer :
docker run -d --name verdi --network reseau-verdi -p 8080:80 nginx:alpine
docker exec verdi sh -c 'getent hosts verdi-db'
# -> 172.18.0.2      verdi-db

docker rm -f verdi verdi-db
docker network rm reseau-verdi
\`\`\``,
      teaches: ['pile de conteneurs', 'réseau privé', 'port unique publié', 'indépendance', 'point de défaillance'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m4-04-deux-services/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais expliquer à la direction pourquoi le port de la base est fermé, et ce qu'il faudrait mettre en place pour que sa panne n'arrête pas le site.",
    },
  ],
};