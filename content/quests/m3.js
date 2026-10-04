// Atelier 3 — Régler en service
//
// L'atelier 2 a fait tourner un conteneur. Cet atelier répond à la prochaine
// question du fil rouge : le site de la librairie est en ligne, mais il est
// mal réglé. Il perd ses données à chaque redémarrage, et personne ne peut le
// consulter depuis l'extérieur.
//
// On réglera le problème au bon endroit : la configuration d'un conteneur se
// décide à la création, et les modifications se font en recréant. C'est le
// point le plus contre-intuitif de Docker, et l'atelier est construit autour.
//
// Mêmes règles qu'aux ateliers 1 et 2 : aucun artefact mort, un `recall` seulement
// quand la réponse n'est pas dans l'énoncé, et un `charge` qui finit par 0.
export default {
  meta: {
    slug: 'm3-regler-en-service',
    module: 3,
    title: 'Régler en service',
    tagline: 'Ports, variables d\'environnement, cycle de vie : le site tient debout',
    icon: '⚙️',
  },

  quests: [
    {
      id: 'm3-01-ports-et-variables',
      order: 1,
      title: 'Ports et variables d\'environnement',
      points: 25,
      flag: 'FLAG{PORT_9090_ENV_CONFIGURED_VERDI}',
      estMinutes: 14,
      brief: `# Ports et variables d'environnement

Le site de la librairie tourne, mais **personne ne peut le consulter** : depuis
la machine hôte, le port est fermé. Et l'administrateur du site ne peut pas
changer le texte affiché sans qu'on reconstruise l'image.

Ce sont deux réglages de création. Un conteneur se **configure en le créant** —
on ne le règle pas après.

**Ta mission**

1. Arrête et supprime le conteneur de l'atelier 2, puis confirme qu'il a bien
   disparu :

\`\`\`bash
docker rm -f verdi
docker ps -a
\`\`\`

2. Recrée-le avec un port publié. L'option se lit \`--publish\` ou \`-p\`, et son
   format est **hôte : conteneur** — l'ordre est le piège le plus fréquent :

\`\`\`bash
docker run -d --name verdi -p 9090:80 nginx:alpine
curl -s http://localhost:9090 | head -3
\`\`\`

3. Regarde ce que Docker a retenu comme configuration :

\`\`\`bash
docker port verdi
\`\`\`

4. Recrée encore une fois, cette fois avec une variable d'environnement. La
   syntaxe est \`NOM=valeur\`, sans espace autour du signe égal :

\`\`\`bash
docker rm -f verdi
docker run -d --name verdi -p 9090:80 \\
  -e NOM_DU_SITE="Librairie Verdi" \\
  -e MODE_LANGUE=fr \\
  nginx:alpine
docker inspect verdi --format '{{range .Config.Env}}{{println .}}{{end}}'
\`\`\`

**Ce que tu observes**

- \`curl http://localhost:9090\` répond : le port est publié. Mais
  \`curl http://localhost:80\` non — rien n'est lié au port 80 de la machine.
- \`docker port verdi\` affiche \`80/tcp -> 0.0.0.0:9090\` : à gauche ce qu écoute
  **dans** le conteneur, à droite ce qui est joignable **dehors**.
- Les variables d'environnement apparaissent dans l'inspection, avec les
  variables que Docker pose lui-même.

**Bon à retenir**

Deux conteneurs ne peuvent pas sepublished sur le même port de la machine : le
second échoue avec \`port is already allocated\`. Si la librairie a déjà un
service sur 9090, on choisira autre chose.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m3-01-ports-et-variables/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "Le format du port est `hôte:conteneur`. Si `curl` ne répond pas, inverse les deux nombres et réessaie — c'est l'erreur la plus fréquente au monde.",
        "La variable d'environnement se passe avec `-e`. L'espace autour du `=` fait échouer la commande : `-e NOM = valeur` est trois arguments, pas un.",
        "Si le lancement échoue sur `port is already allocated`, c'est qu'un autre conteneur occupe le port. Change de port, ou supprime l'autre.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm3-01-ordre-port',
          kind: 'mcq',
          prompt: 'Avec `-p 9090:80`, que signifie le 9090 ?',
          choices: [
            'Le port sur la machine hôte, joignable depuis l\'extérieur',
            'Le port à l\'intérieur du conteneur',
            'Le port du serveur web Nginx',
            'Un port temporaire, réattribué à chaque démarrage',
          ],
          answer: 0,
          explanation: "Le format est `hôte:conteneur`. Nginx écoute sur 80 dans le conteneur, et on publie ce 80 sur le 9090 de la machine. Inverser les deux est l'erreur classique.",
          required: true,
        },
        {
          id: 'm3-01-configuration',
          kind: 'mcq',
          prompt: 'Comment change-t-on une variable d\'environnement d\'un conteneur déjà lancé ?',
          choices: [
            'On ne peut pas : il faut recréer le conteneur avec `-e`',
            'Avec `docker exec -e`',
            'En éditant un fichier de configuration dans le conteneur',
            'Avec `docker env`',
          ],
          answer: 0,
          explanation: "Un conteneur est figé à sa création : c'est ce qui rend son comportement reproductible. Changer une variable impose de recréer — ce qui est l'objet de la quête suivante.",
          required: true,
        },
        {
          id: 'm3-01-env-syntaxe',
          kind: 'boolean',
          prompt: 'L\'option `-e MON_SITE = "Chez moi"` est correcte et pose la variable MON_SITE.',
          answer: false,
          explanation: "Faux : aucun espace autour du `=`. `-e MON_SITE = \"Chez moi\"` est interprété comme trois arguments distincts, et le lancement échoue ou pose une variable vide.",
          required: false,
        },
      ],
      solution: `\`\`\`bash
docker rm -f verdi
docker ps -a

docker run -d --name verdi -p 9090:80 nginx:alpine
curl -s http://localhost:9090 | head -3
# -> <!DOCTYPE html>
# -> <html>
# -> <head><title>Welcome to nginx!</title></head>

docker port verdi
# -> 80/tcp -> 0.0.0.0:9090

docker rm -f verdi
docker run -d --name verdi -p 9090:80 \\
  -e NOM_DU_SITE="Librairie Verdi" \\
  -e MODE_LANGUE=fr \\
  nginx:alpine

docker inspect verdi --format '{{range .Config.Env}}{{println .}}{{end}}'
# -> PATH=/usr/local/sbin:/usr/local/bin:...
# -> NOM_DU_SITE=Librairie Verdi
# -> MODE_LANGUE=fr
# -> NGINX_VERSION=1.27
\`\`\``,
      teaches: ['docker port', '-p port_hôte:port_conteneur', '-e', 'variable d\'environnement', 'docker inspect'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m3-01-ports-et-variables/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais expliquer à l'administrateur pourquoi il ne peut pas changer le nom du site sans qu'on recrée le conteneur — et ce que ça implique pour l'exploitation.",
    },

    {
      id: 'm3-02-modifier-un-conteneur',
      order: 2,
      title: 'Modifier un conteneur',
      points: 25,
      flag: 'FLAG{RECREATED_AFTER_CONFIG_CHANGE_VERDI}',
      estMinutes: 14,
      brief: `# Modifier un conteneur

L'administrateur veut que le site affiche « Librairie Verdi » au lieu de la page
par défaut. Une variable d'environnement ne suffit pas : il faut que le serveur
la lise au démarrage.

Il existe une méthode très tentante et **très mauvaise** : entrer dans le
conteneneur et modifier les fichiers. Montrons ce qu'elle coûte.

**Ta mission**

1. Entre dans le conteneur de la quête précédente et modifie la page d'accueil
   directement. \`exec\` avec \`-i\` (entrée) et \`-t\` (terminal) donne un
   shell :

\`\`\`bash
docker exec -it verdi sh
\`\`\`

À l'intérieur, écris une page qui porte le nom de la librairie, sors, et
vérifie que le changement est visible de l'extérieur :

\`\`\`bash
curl -s http://localhost:9090 | grep -i verdi
\`\`\`

2. Supprime le conteneur, recrée-le **identiquement**, et regarde ce qui
   disparaît :

\`\`\`bash
docker rm -f verdi
docker run -d --name verdi -p 9090:80 \\
  -e NOM_DU_SITE="Librairie Verdi" \\
  -e MODE_LANGUE=fr \\
  nginx:alpine
curl -s http://localhost:9090 | grep -i verdi
echo "code de retour : $?"
\`\`\`

La seconde commande ne trouve rien, et affiche un code de retour **1**. C'est
le moment de la quête.

3. Compare avec la bonne méthode. On prépare le fichier **avant** de lancer, et
   on le monte dans le conteneur :

\`\`\`bash
mkdir -p ~/verdi
echo 'Librairie Verdi - Accueil du site' > ~/verdi/index.html
docker rm -f verdi
docker run -d --name verdi -p 9090:80 \\
  -v ~/verdi:/usr/share/nginx/html:ro \\
  nginx:alpine
curl -s http://localhost:9090 | grep -i verdi
echo "code de retour : $?"
\`\`\`

L'option \`ro\` signifie *lecture seule* : le conteneur peut lire, pas écrire.
C'est ce qu'on veut pour du contenu servi.

**Ce que tu observes**

- Ta modification de l'étape 1 fonctionne… jusqu'au \`docker rm\`.
- Après recréation à l'identique, la modification a disparu. Le conteneur
  recréé est identique au premier.
- Le montage de l'étape 3 rend la modification **durable** : elle vit dans
  \`~/verdi\`, sur la machine, pas dans le conteneur.

**La leçon**

Un conteneur est jetable par construction. Tout ce qu'on y écrit à la main est
perdu au premier \`docker rm\`. Ce qui doit durer vit **dehors** — dans un volume
(étape 3) ou dans une image reconstruite (atelier 6).

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m3-02-modifier-un-conteneur/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "`grep` renvoie 0 s'il a trouvé, 1 sinon. C'est la façon la plus simple de vérifier qu'un changement est passé.",
        "Le montage se dit `-v source:destination`, et le `:ro` final interdit l'écriture. Sans lui, le conteneur pourrait modifier tes fichiers.",
        "`~` est ton dossier personnel. Vérifie qu'il existe avant de monter : un montage d'un dossier inexistant crée un dossier vide à la place.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm3-02-jetable',
          kind: 'mcq',
          prompt: 'Tu as modifié un fichier dans un conteneur, puis relancé un conteneur identique. Que reste-t-il de ta modification ?',
          choices: [
            'Rien : le nouveau conteneur repart de l\'image',
            'Elle reste, Docker conserve les modifications',
            'Elle reste si le nom du conteneur est le même',
            'Elle reste dans les logs',
          ],
          answer: 0,
          explanation: "Un conteneur est une instance jetable d'une image. Il n'existe aucun mécanisme de persistance implicite : c'est ce qui le rend reproductible, et c'est sa contrepartie.",
          required: true,
        },
        {
          id: 'm3-02-volume',
          kind: 'mcq',
          prompt: 'Quelle est la bonne façon de faire durer une modification ?',
          choices: [
            'La stocker hors du conteneur et la monter avec `-v`',
            'Utiliser `docker commit`',
            'La réappliquer après chaque `docker rm`',
            'La mettre dans une variable d\'environnement',
          ],
          answer: 0,
          explanation: "`-v source:destination` monte un dossier de la machine dans le conteneur. La modification vit alors dans la source, et survit à tout `docker rm`. C'est l'objet de l'atelier 6, sur les volumes nommés.",
          required: true,
        },
        {
          id: 'm3-02-ro',
          kind: 'boolean',
          prompt: 'Monter un dossier avec `:ro` empêche le conteneur d\'écrire dedans.',
          answer: true,
          explanation: "`:ro` pour *read-only*. Pour du contenu servi en statique, c'est le bon réglage : le conteneur peut lire, et un bug du programme ne peut pas abîmer tes fichiers.",
          required: false,
        },
      ],
      solution: `\`\`\`bash
docker exec -it verdi sh
# /usr/share/nginx/html # echo 'Librairie Verdi - Accueil du site' > index.html
# exit
curl -s http://localhost:9090 | grep -i verdi
# -> Librairie Verdi - Accueil du site   (code de retour 0)

docker rm -f verdi
docker run -d --name verdi -p 9090:80 -e NOM_DU_SITE="Librairie Verdi" nginx:alpine
curl -s http://localhost:9090 | grep -i verdi
# -> (rien)
echo "code de retour : $?"
# -> 1                            (la modification a disparu)

mkdir -p ~/verdi
echo 'Librairie Verdi - Accueil du site' > ~/verdi/index.html
docker rm -f verdi
docker run -d --name verdi -p 9090:80 -v ~/verdi:/usr/share/nginx/html:ro nginx:alpine
curl -s http://localhost:9090 | grep -i verdi
# -> Librairie Verdi - Accueil du site   (code de retour 0 : ça tient)
\`\`\``,
      teaches: ['docker exec -it', 'docker rm -f', '-v montage', 'option :ro', 'grep code de retour'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m3-02-modifier-un-conteneur/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais dire où doit vivre une modification pour survivre à un `docker rm`, et pourquoi c'est un travail hors du conteneur.",
    },

    {
      id: 'm3-03-le-cycle-de-vie',
      order: 3,
      title: 'Le cycle de vie',
      points: 50,
      flag: 'FLAG{LIFECYCLE_VERBS_MASTERED_PAUSED}',
      estMinutes: 14,
      brief: `# Le cycle de vie

Un conteneur en marche, on peut le suspendre, le redémarrer, l'arrêter, le tuer.
Ces verbes se ressemblent mais ne font pas la même chose — et le choix du
mauvais verbe est un diagnostic raté.

**Ta mission**

1. Lance un conteneur qui écrit \`tick\` toutes les deux secondes, en
   arrière-plan :

\`\`\`bash
docker run -d --name rythme alpine sh -c 'while true; do echo tick; sleep 2; done'
\`\`\`

2. Regarde-le tourner, et lis ses dernières lignes sans tout le journal :

\`\`\`bash
docker ps
docker logs --tail 3 rythme
\`\`\`

3. **Suspends** son activité et compare avec \`docker ps\` : le statut change-t-il
   en \`Up\` tout court ? Les \`tick\` continuent-ils ?

\`\`\`bash
docker pause rythme
docker ps
docker logs --tail 3 rythme
sleep 5
docker logs --tail 3 rythme
\`\`\`

Regarde les deux sorties de logs : ont-elles changé entre elles ?

4. Reprends, puis redémarre :

\`\`\`bash
docker unpause rythme
docker restart rythme
docker logs --tail 3 rythme
\`\`\`

5. Arrête proprement, puis compare avec un arrêt brutal :

\`\`\`bash
docker stop rythme
docker inspect rythme --format '{{.State.ExitCode}}'

docker start rythme
docker kill rythme
docker inspect rythme --format '{{.State.ExitCode}}'
\`\`\`

**Ce que tu observes**

- \`pause\` fige **tous** les processus du conteneur sans l'arrêter. Le statut
  devient \`Up (Paused)\`, et les logs ne changent plus : c'est la preuve que le
  conteneur est gelé, pas éteint.
- \`restart\` enchaîne arrêt puis démarrage. Le compteur \`tick\` repart.
- \`stop\` demande l'arrêt proprement : le code de sortie est \`0\`.
- \`kill\` coupe net : le code de sortie est \`137\`. C'est la valeur classique
  d'une mort par signal — Docker a fini par devoir tuer le processus.

**Ce que ça change en exploitation**

Un service qui plante et redémarre tout seul, c'est bien. Un service qu'on
**tue** pour le relancer, c'est une fuite : on perd la trace de ce qu'il
faisait. La différence entre 0 et 137 dans un journal est souvent tout le
diagnostic.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m3-03-le-cycle-de-vie/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "Le statut de `docker ps` et la longueur de `docker logs` sont les deux seules choses à comparer avant et après `docker pause`.",
        "`docker inspect --format '{{.State.ExitCode}}'` accepte n'importe quelle propriété du conteneur. C'est la façon la plus rapide de lire un état précis.",
        "137 = 128 + 9 : le processus a été tué par le signal numéro 9, qui est SIGKILL. Docker l'emploie quand un `stop` n'a pas fait son travail dans le délai imparti.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      // Pas de `recall` : `docker pause` est écrit dans l'énoncé. Le réflexe
      // ne sert que là où l'élève doit retrouver.
      check: [
        {
          id: 'm3-03-pause',
          kind: 'mcq',
          prompt: 'Après `docker pause`, qu\'observe-t-on sur `docker logs` ?',
          choices: [
            'Rien de nouveau : les processus sont gelés',
            'Les messages s\'accumulent plus vite',
            'Le journal est vidé',
            'Une erreur de permission',
          ],
          answer: 0,
          explanation: "C'est la meilleure preuve que `pause` gèle et n'arrête pas : le conteneur existe, son statut est `Up (Paused)`, mais plus rien ne s'y écrit. Un arrêt aurait laissé le statut `Exited`.",
          required: true,
        },
        {
          id: 'm3-03-exit-code',
          kind: 'mcq',
          prompt: 'Un conteneur arrêté par `docker kill` affiche un code de sortie de 137. Que signifie ce nombre ?',
          choices: [
            'Le processus a été tué par un signal, pas arrêté proprement',
            'Le conteneur a utilisé 137 Mo',
            'Le conteneur est mort après 137 secondes',
            'C\'est un code d\'erreur du portail',
          ],
          answer: 0,
          explanation: "137 = 128 + 9 : le signal numéro 9, SIGKILL. Docker l'emploie quand `stop` n'a pas terminé dans le délai imparti. Un `stop` propre, lui, donne 0.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
docker run -d --name rythme alpine sh -c 'while true; do echo tick; sleep 2; done'
docker logs --tail 3 rythme
# -> tick
# -> tick
# -> tick

docker pause rythme
docker ps
# -> 4f2a8b1c9d3e  alpine  Up 10 seconds (Paused)  ...

docker logs --tail 3 rythme
sleep 5
docker logs --tail 3 rythme
# -> identiques : aucun nouveau tick

docker unpause rythme
docker restart rythme
docker logs --tail 3 rythme
# -> le compteur repart

docker stop rythme
docker inspect rythme --format '{{.State.ExitCode}}'
# -> 0

docker start rythme
docker kill rythme
docker inspect rythme --format '{{.State.ExitCode}}'
# -> 137

docker rm rythme
\`\`\``,
      teaches: ['docker pause', 'docker unpause', 'docker restart', 'docker kill', 'code de sortie'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m3-03-le-cycle-de-vie/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu sais dire, devant un journal, si un service s'est arrêté proprement ou a été tué — et ce que chaque code de sortie t'apprend.",
    },

    {
      id: 'm3-04-le-conteneur-est-isole',
      order: 4,
      title: 'Le conteneur est isolé',
      points: 200,
      flag: 'FLAG{ISOLATION_VERIFIED_PID1_INSIDE_AGENT}',
      estMinutes: 20,
      brief: `# Le conteneur est isolé

Le site de la librairie tourne. Reste une question que l'administrateur pose
toujours, et qui décide de la sécurité de toute l'infrastructure : **un
conteneur peut-il toucher à la machine ?**

Un conteneur n'est pas une machine virtuelle : c'est un ensemble de
restrictions sur les processus du noyau. Comprendre *comment* elles sont
posées, c'est comprendre ce qui sépare la librairie d'un programme qui
s'échappe.

**Ta mission**

1. Compare deux mondes. Sur ta machine, puis dans un conteneur :

\`\`\`bash
docker run -it --name agent alpine /bin/sh
\`\`\`

À l'intérieur, trois commandes, dans cet ordre :

\`\`\`bash
id
ps aux
cat /etc/os-release
\`\`\`

- \`id\` dit qui tu es **dedans**. Note le résultat.
- \`ps aux\` liste **un seul** processus. Compare avec la sortie de \`ps aux\` sur
  ta machine, en sortant du conteneur.
- \`cat /etc/os-release\` dit quelle distribution tourne **dedans**.

2. Sors (\`exit\`), puis regarde ce que tu vois sur la machine, et compare :

\`\`\`bash
ps aux | wc -l
docker ps -a
\`\`\`

3. Le point clé, à l'intérieur du conteneur : le processus numéro 1. Relance
   un shell interactif et regarde :

\`\`\`bash
docker run -it alpine /bin/sh
\`\`\`

À l'intérieur, \`ps aux\`. Le shell que tu as lancé n'est pas numéro 1. **Quel
est le numéro 1, et pourquoi n'est-ce pas ton shell ?**

4. Le journal du conteneur et celui de la machine sont deux choses séparées.
   Vérifie :

\`\`\`bash
docker run -d --name journal alpine sh -c 'echo "secret de la librairie"; sleep 300'
docker logs journal
docker exec journal sh -c 'ls /var/log'
\`\`\`

**Ce que tu observes**

- \`id\` dit \`root\`. Tu es root **dans** le conteneur, et pas sur ta machine.
  C'est vrai même si tu n'es pas root sur l'hôte : les deux root n'ont rien à
  voir.
- \`ps aux\` dans le conteneur ne montre qu'un processus. Dehors, ta machine en
  a des centaines. Les deux listes ne se recoupent pas.
- \`/etc/os-release\` dit Alpine, même si ta machine est sous Ubuntu.
- **Le processus numéro 1 dans le conteneur est le shell du conteneur**, pas le
  tien. Le noyau démarre un seul processus, le reste de la machine est dans un
  autre espace. C'est pour ça qu'un PID 1 dans un conteneur doit surveiller ses
  enfants : quand il meurt, le conteneur s'arrête.

**Ce que ça change en exploitation**

Un conteneur n'est **pas** une frontière de sécurité parfaite. Un programme
vulnérable tourne avec les droits root *à l'intérieur*. Ce qui protège la
machine, c'est que le conteneur ne voit qu'un processus, un système de fichiers
et un réseau restreints. Ce n'est pas une virtualisation : c'est un
cloisonnement, beaucoup plus léger et beaucoup moins solide.

C'est exactement pourquoi la librairie n'est **pas** seule derrière son
conteneur : un second conteneur tient le portail, et aucun des deux ne monte le
répertoire de l'autre en écriture.

**Ton mot de passe**

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m3-04-le-conteneur-est-isole/raw?token=$ARENA_TOKEN"
\`\`\``,
      hints: [
        "`ps aux | wc -l` compte les lignes. Compare le chiffre dehors et celui dedans — l'écart est le cloisonnement, en une seule mesure.",
        "Le PID 1 est toujours le premier processus que le noyau démarre. Ton shell arrive après : il ne peut pas être le premier.",
        "`docker exec` entre dans un conteneur **en marche**. Sur un conteneur arrêté, il échoue — c'est ce qui distingue cette quête de l'atelier 2.",
      ],
      charge: { perHint: 1, autonomy: [1, 1, 0] },
      check: [
        {
          id: 'm3-04-root',
          kind: 'mcq',
          prompt: 'Dans un conteneur Alpine, `id` affiche `uid=0(root)`. Qu\'est-ce que cela dit de tes droits sur la machine hôte ?',
          choices: [
            'Rien : ce root est cantonné au conteneur',
            'Que tu es root sur toute la machine',
            'Que le conteneur a été lancé avec `sudo`',
            'Que Docker a modifié tes droits',
          ],
          answer: 0,
          explanation: "C'est le point le plus important de l'atelier, et le plus mal compris. Le root du conteneur est un root dans un espace de noms restreint : il ne voit pas la machine, et ne peut pas y écrire.",
          required: true,
        },
        {
          id: 'm3-04-pid1',
          kind: 'mcq',
          prompt: 'Dans un conteneur, quel processus porte le numéro 1 (PID 1) ?',
          choices: [
            'La commande principale du conteneur, lancée par Docker',
            'Le shell que tu as ouvert avec `docker run -it`',
            'Le noyau Linux de la machine',
            'Le démon Docker',
          ],
          answer: 0,
          explanation: "Le noyau démarre un seul processus dans l'espace de noms, et c'est la commande principale du conteneur. Ton shell arrive après et ne peut pas être le premier. D'où la règle : un PID 1 doit surveiller ses enfants.",
          required: true,
        },
        {
          id: 'm3-04-securite',
          kind: 'boolean',
          prompt: 'Un conteneur est une frontière de sécurité aussi solide qu\'une machine virtuelle.',
          answer: false,
          explanation: "Faux, et c'est ce que l'atelier doit faire passer. Un conteneur n'est pas une VM : c'est un cloisonnement du noyau, beaucoup plus léger. Un programme vulnérable y tourne en root. La vraie défense est la redondance et le cloisonnement entre conteneurs.",
          required: true,
        },
      ],
      solution: `\`\`\`bash
docker run -it --name agent alpine /bin/sh
# / # id
# uid=0(root) gid=0(root) groups=0(root)
# / # ps aux
# PID   USER     TIME  COMMAND
#   1   root      0:00 /bin/sh
# / # cat /etc/os-release
# NAME="Alpine Linux"
# / # exit

ps aux | wc -l
# -> 148          (sur ta machine)
docker ps -a
# -> agent  Exited (0) ...

docker run -it alpine /bin/sh
# / # ps aux
#   1   root   0:00 /bin/sh     <- le shell du conteneur, pas le tien

docker run -d --name journal alpine sh -c 'echo "secret de la librairie"; sleep 300'
docker logs journal
# -> secret de la librairie
docker exec journal sh -c 'ls /var/log'
# -> (vide ou minimal : les journaux du conteneur ne sont pas ceux de la machine)
\`\`\``,
      teaches: ['isolation', 'espace de noms', 'PID 1', 'root cloisonné', 'docker exec'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine wget -qO- "https://SERVER_IP/api/secret/m3-04-le-conteneur-est-isole/raw?token=$ARENA_TOKEN"`,
      checkpoint: "Tu as compris quand tu peux expliquer à l'administrateur pourquoi un conteneur n'est pas une machine virtuelle, et ce que ça implique pour la sécurité du site de la librairie.",
    },
  ],
};