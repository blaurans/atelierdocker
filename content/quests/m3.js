// Module 3 — Le conteneur en détail
// La quête phare qui termine le module est la mission officielle n°2 « Infiltration Interactive ».
export default {
  meta: {
    slug: 'm3-conteneur-en-detail',
    module: 3,
    title: 'Le conteneur en détail',
    tagline: 'Créer, démarrer, explorer, renommer, puis nettoyer',
    icon: '🧰',
  },

  quests: [
    {
      id: 'm3-01-creer-sans-demarrer',
      order: 1,
      title: 'Créer sans démarrer',
      points: 25,
      flag: 'FLAG{CREATE_THEN_START_DECOUPLED}',
      estMinutes: 15,
      brief: `# Créer sans démarrer

\`docker run\` crée **et** démarre dans la foulée. Mais Docker sait aussi séparer les deux opérations. C'est utile : tu prépares un conteneur à l'avance, puis tu le lances quand tu veux.

**Ta mission**

1. Crée un conteneur **sans** le démarrer, et donne-lui un nom :

\`\`\`bash
docker create --name journal alpine sh -c 'echo "journal cree et pret"; sleep 300'
\`\`\`

2. Regarde son état : il existe, mais il ne tourne pas.

\`\`\`bash
docker ps -a
\`\`\`

3. Démarre-le, regarde, puis lis ce qu'il a affiché :

\`\`\`bash
docker start journal
docker ps
docker logs journal
\`\`\`

4. Arrête-le, regarde son état, et relis les logs : ils sont toujours là.

\`\`\`bash
docker stop journal
docker ps -a
docker logs journal
\`\`\`

5. Demande à Docker le statut brut, sans tableau, puis supprime le conteneur :

\`\`\`bash
docker inspect journal --format '{{.State.Status}}'
docker rm journal
\`\`\`

**Ce que tu observes**

- Un conteneur créé se voit dans \`docker ps -a\` avec le statut **Created**, pas **Up**.
- \`docker start\` est réutilisable : on arrête puis on redémarre le même conteneur, sans jamais le recréer.
- L'arrêt peut prendre une dizaine de secondes : Docker envoie d'abord un signal d'arrêt demandé, puis insiste.
- Les logs restent disponibles après l'arrêt.

**Ton mot de passe**

Il n'est écrit nulle part : il sort du conteneur en marche. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f m3-prepa > /dev/null 2>&1; docker run -d --name m3-prepa alpine sleep 300 && docker exec m3-prepa wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m3-01-creer-sans-demarrer/raw?token=$ARENA_TOKEN"
docker exec m3-prepa cat /secret.txt && docker rm -f m3-prepa
\`\`\`

Le conteneur affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "La commande de préparation s'appelle presque comme `docker run`, mais elle ne démarre rien.",
        "Le nom du conteneur se donne avec l'option `--name`, à placer avant le nom de l'image.",
      ],
      solution: `\`\`\`bash
docker create --name journal alpine sh -c 'echo "journal cree et pret"; sleep 300'
# -> affiche l'identifiant du conteneur cree ; RIEN n'est execute

docker ps -a
# -> journal  Created  alpine   "sh -c 'echo \"journa..."

docker start journal
docker ps
# -> journal  Up ...
docker logs journal
# -> journal cree et pret

docker stop journal
docker ps -a
# -> journal  Exited (137) ...
docker logs journal
# -> journal cree et pret   (toujours disponible)

docker inspect journal --format '{{.State.Status}}'
# -> exited

docker rm journal
\`\`\``,
      teaches: ['docker create', 'docker start', 'docker logs', 'option --name', 'statut Created'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f m3-prepa > /dev/null 2>&1; docker run -d --name m3-prepa alpine sleep 300 && docker exec m3-prepa wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m3-01-creer-sans-demarrer/raw?token=$ARENA_TOKEN"
docker exec m3-prepa cat /secret.txt && docker rm -f m3-prepa`,
      checkpoint: "Tu as réussi quand tu as vu le statut passer de Created à Up puis à Exited sur le même conteneur, et quand ses logs sont restés lisibles après l'arrêt.",
    },

    {
      id: 'm3-02-verbes-du-cycle-de-vie',
      order: 2,
      title: 'Les verbes du cycle de vie',
      points: 25,
      flag: 'FLAG{PAUSE_KILL_LIFECYCLE_VERBS}',
      estMinutes: 12,
      brief: `# Les verbes du cycle de vie

Un conteneur a son propre petit vocabulaire d'actions. Une fois que tu le connais, tu sais agir sur n'importe quel conteneur du monde.

**Ta mission**

1. Démarre en arrière-plan un conteneur qui écrit un mot toutes les deux secondes :

\`\`\`bash
docker run -d --name rythme alpine sh -c 'while true; do echo tick; sleep 2; done'
\`\`\`

2. Regarde-le tourner et lis ses dernières lignes :

\`\`\`bash
docker ps
docker logs --tail 3 rythme
\`\`\`

3. Suspends son activité, regarde le statut, puis reprends :

\`\`\`bash
docker pause rythme
docker ps
docker unpause rythme
\`\`\`

4. Redémarre-le, puis arrête-le normalement :

\`\`\`bash
docker restart rythme
docker stop rythme
\`\`\`

5. Relance-le et tue-le sans cérémonie, puis nettoie :

\`\`\`bash
docker start rythme
docker kill rythme
docker rm rythme
\`\`\`

**Ce que tu observes**

- \`-d\` signifie détaché : le conteneur tourne en arrière-plan, le terminal reste libre.
- **pause** fige tous les processus du conteneur, sans l'arrêter. Le statut devient *Up (Paused)*.
- **restart** enchaîne arrêt puis démarrage.
- **stop** demande l'arrêt proprement. **kill** coupe net, sans préavis.
- Les deux laissent le conteneur arrêté : il faut \`docker rm\` pour le supprimer.

**Ton mot de passe**

Il n'est écrit nulle part : il sort du conteneur en marche. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f m3-horloge > /dev/null 2>&1; docker run -d --name m3-horloge alpine sleep 300 && docker exec m3-horloge wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m3-02-verbes-du-cycle-de-vie/raw?token=$ARENA_TOKEN"
docker exec m3-horloge cat /secret.txt && docker rm -f m3-horloge
\`\`\`

Le conteneur affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "L'option qui met le conteneur en arrière-plan tient en une seule lettre : `-d`.",
        "Le statut des conteneurs est dans la colonne STATUS de `docker ps`.",
      ],
      solution: `\`\`\`bash
docker run -d --name rythme alpine sh -c 'while true; do echo tick; sleep 2; done'
# -> identifiant du conteneur ; le terminal est libere

docker ps
# -> rythme  Up ...
docker logs --tail 3 rythme
# -> tick / tick / tick

docker pause rythme
docker ps
# -> rythme  Up 4 seconds (Paused)   <- le statut le dit
docker unpause rythme

docker restart rythme
docker stop rythme
docker ps -a
# -> rythme  Exited ...

docker start rythme
docker kill rythme
# -> arret brutal, aucun message
docker rm rythme
docker ps -a
# -> plus rien
\`\`\``,
      teaches: ['option -d', 'docker pause', 'docker unpause', 'docker restart', 'docker kill'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f m3-horloge > /dev/null 2>&1; docker run -d --name m3-horloge alpine sleep 300 && docker exec m3-horloge wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m3-02-verbes-du-cycle-de-vie/raw?token=$ARENA_TOKEN"
docker exec m3-horloge cat /secret.txt && docker rm -f m3-horloge`,
      checkpoint: "Tu as réussi quand `docker ps` a affiché le statut *Up (Paused)* juste après `docker pause`, et quand le conteneur a disparu de `docker ps -a` après le `docker rm` final.",
    },

    {
      id: 'm3-03-entrer-sortir-renommer',
      order: 3,
      title: 'Entrer, sortir, renommer',
      points: 50,
      flag: 'FLAG{EXEC_CP_RENAME_INSIDE_THE_BOX}',
      estMinutes: 18,
      brief: `# Entrer, sortir, renommer

Un conteneur en marche, c'est une petite machine à part entière. On y entre, on en sort, on lui donne un nom plus parlant.

**Ta mission**

1. Démarre un conteneur en arrière-plan qui attend une demi-heure :

\`\`\`bash
docker run -d --name atelier alpine sleep 600
\`\`\`

2. Entre dedans avec un terminal interactif :

\`\`\`bash
docker exec -it atelier sh
\`\`\`

À l'intérieur, écris un fichier, puis sors :

\`\`\`bash
echo "note interne" > /tmp/note.txt
ls -l /tmp
exit
\`\`\`

3. Sans y entrer, exécute quand même une commande dedans, puis regarde le fichier créé :

\`\`\`bash
docker exec atelier ls -l /tmp
\`\`\`

4. Sors le fichier du conteneur vers ta machine, puis vérifie :

\`\`\`bash
docker cp atelier:/tmp/note.txt ./note-extrait.txt
cat ./note-extrait.txt
\`\`\`

5. Fais l'inverse : pousse un fichier de ta machine dans le conteneur.

\`\`\`bash
docker cp ./note-extrait.txt atelier:/tmp/note-copie.txt
docker exec atelier cat /tmp/note-copie.txt
\`\`\`

6. Renomme le conteneur, vérifie, puis supprime-le :

\`\`\`bash
docker rename atelier atelier-renomme
docker ps
docker rm -f atelier-renomme
\`\`\`

**Bon à retenir**

- \`docker exec\` lance une commande **dans** un conteneur déjà démarré : il ne crée rien.
- \`docker cp\` est le pont entre ta machine et le conteneur, dans les deux sens.
- Le chemin source s'écrit \`nom_conteneur:/chemin/à_l'intérieur\`.

**Ton mot de passe**

Il n'est écrit nulle part : il sort du conteneur en marche. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f m3-atelier > /dev/null 2>&1; docker run -d --name m3-atelier alpine sleep 300 && docker exec m3-atelier wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m3-03-entrer-sortir-renommer/raw?token=$ARENA_TOKEN"
docker cp m3-atelier:/secret.txt ./secret.txt && cat ./secret.txt && docker rm -f m3-atelier && rm -f ./secret.txt
\`\`\`

Le conteneur affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "Les deux options `-i` et `-t` d'`exec` veulent dire interactif et terminal : sans elles, tu ne peux pas taper au clavier.",
        "Pour copier un fichier depuis le conteneur, le chemin doit commencer par le nom du conteneur, puis deux-points, puis le chemin interne.",
      ],
      solution: `\`\`\`bash
docker run -d --name atelier alpine sleep 600

docker exec -it atelier sh
# a l'interieur :
#   echo "note interne" > /tmp/note.txt
#   ls -l /tmp
#   exit

docker exec atelier ls -l /tmp
# -> -rw-r--r-- 1 root root 14 ... /tmp/note.txt

docker cp atelier:/tmp/note.txt ./note-extrait.txt
cat ./note-extrait.txt
# -> note interne

docker cp ./note-extrait.txt atelier:/tmp/note-copie.txt
docker exec atelier cat /tmp/note-copie.txt
# -> note interne

docker rename atelier atelier-renomme
docker ps
# -> atelier-renomme  Up ...
docker rm -f atelier-renomme
\`\`\``,
      teaches: ['docker exec', 'options -i et -t', 'docker cp', 'docker rename'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f m3-atelier > /dev/null 2>&1; docker run -d --name m3-atelier alpine sleep 300 && docker exec m3-atelier wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m3-03-entrer-sortir-renommer/raw?token=$ARENA_TOKEN"
docker cp m3-atelier:/secret.txt ./secret.txt && cat ./secret.txt && docker rm -f m3-atelier && rm -f ./secret.txt`,
      checkpoint: "Tu as réussi quand le fichier écrit dans le conteneur apparaît sur ta machine avec `docker cp`, et quand `docker ps` affiche le nouveau nom après le renommage.",
    },

    {
      id: 'm3-04-infiltration-interactive',
      order: 4,
      title: 'Infiltration Interactive',
      points: 200,
      flag: 'FLAG{ALPINE_SH_INSPECTION_HERO}',
      estMinutes: 20,
      brief: `# Mission phare — Infiltration Interactive

Objectif : maîtriser le mode interactif, comprendre l'isolation des processus et manipuler les fichiers d'un conteneur.

**Mission**

1. Lance un terminal interactif à l'intérieur d'un conteneur Alpine Linux :

\`\`\`bash
docker run -it --name agent-infiltrator alpine /bin/sh
\`\`\`

2. Explore l'environnement isolé, avec ces quatre commandes :

\`\`\`bash
id
ps aux
cat /etc/os-release
echo "message de l'agent infiltrateur"
\`\`\`

- \`id\` te dit qui tu es **dans** le conteneur : tu es root, même si tu ne l'es pas sur ta machine.
- \`ps aux\` ne montre que les processus du conteneur : tes programmes de la machine sont invisibles d'ici.
- \`cat /etc/os-release\` confirme que tu es bien dans Alpine Linux, et non sur ta machine.
- \`echo\` écrit ton message dans la sortie standard : il reste dans les journaux du conteneur, même après la mort de celui-ci.

3. Tape \`exit\` pour quitter le conteneur.

4. Constate qu'il est arrêté, demande son statut exact, et relis les logs : ton message y est resté :

\`\`\`bash
docker ps -a
docker inspect agent-infiltrator --format '{{.State.Status}}'
docker logs agent-infiltrator
\`\`\`

5. Supprime le conteneur pour nettoyer :

\`\`\`bash
docker rm agent-infiltrator
\`\`\`

**Ton mot de passe**

Il n'est écrit nulle part : il sort du conteneur en marche. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace dq_xxxxxxxxxxxxxxxx par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f m3-agent > /dev/null 2>&1; docker run -d --name m3-agent alpine sleep 300 && docker exec m3-agent wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m3-04-infiltration-interactive/raw?token=$ARENA_TOKEN"
docker exec m3-agent cat /secret.txt && docker rm -f m3-agent
\`\`\`

Le mot de passe s'affiche dans le terminal : envoie-le tel quel au portail.`,
      hints: [
        "L'option `-it` associe deux options : `-i` pour garder l'entrée standard ouverte, `-t` pour allouer un terminal.",
        "Pour que le conteneur ne s'arrête pas aussitôt, il lui faut une commande qui dure : ici le chemin du shell, `/bin/sh`.",
        "Le mot de passe se récupère sans terminal interactif : un conteneur lancé en arrière-plan et un `docker exec` suffisent.",
      ],
      solution: `\`\`\`bash
docker run -it --name agent-infiltrator alpine /bin/sh
# a l'interieur du conteneur :
#   $ id
#   uid=0(root) gid=0(root) groups=0(root)
#   $ ps aux
#   PID   USER     TIME  COMMAND
#     1   root      0:00 /bin/sh            <- le shell du conteneur EST le processus 1
#   $ cat /etc/os-release
#   NAME="Alpine Linux"
#   $ echo "message de l'agent infiltrateur"
#   message de l'agent infiltrateur
#   $ exit

docker ps -a
# -> agent-infiltrator  Exited (0) ...
docker inspect agent-infiltrator --format '{{.State.Status}}'
# -> exited
docker logs agent-infiltrator
# -> message de l'agent infiltrateur   (les journaux survivent a l'arret)

docker rm agent-infiltrator
# -> le mot de passe, lui, ne demande aucun terminal interactif :
#    cf. la section « Ton mot de passe » de l'enonce.
\`\`\``,
      teaches: ['mode interactif', 'isolation des processus', 'PID 1', 'docker logs', 'docker rm'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker rm -f m3-agent > /dev/null 2>&1; docker run -d --name m3-agent alpine sleep 300 && docker exec m3-agent wget -qO /secret.txt "http://SERVER_IP:8000/api/secret/m3-04-infiltration-interactive/raw?token=$ARENA_TOKEN"
docker exec m3-agent cat /secret.txt && docker rm -f m3-agent`,
      checkpoint: "Tu as réussi quand `id` a affiché root à l'intérieur du conteneur, que `ps aux` n'a montré aucun processus de ta machine, que `docker logs agent-infiltrator` a retrouvé ton message, et que `docker exec` t'a affiché le mot de passe sans terminal interactif.",
    },
  ],
};