// Module 6 — Persistance & volumes
// La quête phare qui termine le module est la mission officielle n°5 « Persistence Guardian ».
export default {
  meta: {
    slug: 'm6-persistance-volumes',
    module: 6,
    title: 'Persistance & volumes',
    tagline: 'Faire survivre les données à la mort du conteneur',
    icon: '💾',
  },

  quests: [
    {
      id: 'm6-01-tout-disparait',
      order: 1,
      title: 'Tout disparaît avec le conteneur',
      points: 25,
      flag: 'FLAG{RM_WIPES_CONTAINER_FILESYSTEM}',
      estMinutes: 12,
      brief: `# Tout disparaît avec le conteneur

Première règle de Docker, et elle surprend tout le monde : le système de fichiers d'un conteneur est **éphémère**. Quand le conteneur est supprimé, ses données vont avec.

**Ta mission**

1. Démarre un conteneur en arrière-plan :

\`\`\`bash
docker run -d --name fragile alpine sleep 600
\`\`\`

2. Dépose un mot dans son système de fichiers, puis relis-le :

\`\`\`bash
docker exec fragile sh -c 'echo "message du conteneur fragile" > /tmp/cle.txt'
docker exec fragile cat /tmp/cle.txt
\`\`\`

3. Supprime le conteneur :

\`\`\`bash
docker rm -f fragile
\`\`\`

4. Demande à un conteneur tout neuf s'il trouve encore la clé :

\`\`\`bash
docker run --rm alpine sh -c 'cat /tmp/cle.txt || echo "fichier absent : la donnee a disparu avec le conteneur"'
\`\`\`

La commande affiche \`fichier absent : la donnee a disparu avec le conteneur\`. C'est le résultat attendu, et c'est tout le problème.

**Ce que tu viens de voir**

- Un conteneur arrêté conserve ses données : seul \`docker rm\` les détruit.
- Deux conteneurs différents ne partagent rien, même avec la même image.
- Une base de données qui tourne dans un conteneur perdrait donc toutes ses données au premier redéploiement.

Pour éviter ça, il existe deux familles de solutions : les dossiers partagés et les volumes nommés. Quêtes suivantes.

**Ton mot de passe**

Il n'est écrit nulle part : il a survécu au conteneur, dans le volume. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker volume create m6-fragile && docker run --rm -v m6-fragile:/donnees alpine sh -c "wget -qO /donnees/secret.txt 'http://SERVER_IP:8000/api/secret/m6-01-tout-disparait/raw?token=$ARENA_TOKEN'"
docker run --rm -v m6-fragile:/donnees alpine cat /donnees/secret.txt && docker volume rm m6-fragile
\`\`\`

Le second conteneur affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "Le contenu doit être écrit **dans** le conteneur avant d'être supprimé : la commande `docker exec` avec un shell et une redirection.",
        "La suppression d'un conteneur en marche se fait avec `docker rm -f`, qui combine suppression et arrêt.",
      ],
      solution: `\`\`\`bash
docker run -d --name fragile alpine sleep 600

docker exec fragile sh -c 'echo "message du conteneur fragile" > /tmp/cle.txt'
docker exec fragile cat /tmp/cle.txt
# -> message du conteneur fragile

docker rm -f fragile
# -> fragile

docker run --rm alpine sh -c 'cat /tmp/cle.txt || echo "fichier absent : la donnee a disparu avec le conteneur"'
# -> cat: can't open '/tmp/cle.txt': No such file or directory
#    fichier absent : la donnee a disparu avec le conteneur
\`\`\``,
      teaches: ['système de fichiers éphémère', 'docker rm', 'docker exec', 'perte de données'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker volume create m6-fragile && docker run --rm -v m6-fragile:/donnees alpine sh -c "wget -qO /donnees/secret.txt 'http://SERVER_IP:8000/api/secret/m6-01-tout-disparait/raw?token=$ARENA_TOKEN'"
docker run --rm -v m6-fragile:/donnees alpine cat /donnees/secret.txt && docker volume rm m6-fragile`,
      checkpoint: "Tu as réussi quand le fichier était lisible avant le `docker rm`, et quand un conteneur neuf affiche le message « fichier absent » après.",
    },

    {
      id: 'm6-02-dossier-partage',
      order: 2,
      title: 'Le dossier partagé',
      points: 25,
      flag: 'FLAG{BIND_MOUNT_HOST_PATH_SHARED}',
      estMinutes: 20,
      brief: `# Le dossier partagé

Première solution : dire à Docker qu'un dossier de ta machine doit apparaître **dedans** le conteneur. C'est un **bind mount** (un montage direct).

**Ta mission**

1. Prépare un dossier de travail sur ta machine :

\`\`\`bash
mkdir -p ~/arena-bind/data
cd ~/arena-bind
printf 'note ecriture depuis la machine hote\\n' > data/note.txt
\`\`\`

2. Monte-le dans un conteneur et regarde ce qu'il y a dedans :

\`\`\`bash
docker run --rm -v "$(pwd)/data":/data alpine sh -c 'ls -la /data && cat /data/note.txt'
\`\`\`

Le fichier écrit sur ta machine est visible depuis le conteneur.

3. Fais l'inverse : dépose un fichier depuis le conteneur, puis relis-le sur ta machine.

\`\`\`bash
docker run --rm -v "$(pwd)/data":/data alpine sh -c 'echo "ecrit depuis le conteneur" > /data/recu.txt'
cat data/recu.txt
\`\`\`

4. Supprime le fichier depuis le conteneur et vérifie sur ta machine :

\`\`\`bash
docker run --rm -v "$(pwd)/data":/data alpine sh -c 'rm /data/recu.txt'
ls -la data
\`\`\`

5. Le piège des permissions. Un conteneur tourne en root : les fichiers qu'il crée t'appartiennent à **root**, et tu ne pourras plus les modifier.

\`\`\`bash
id -u
docker run --rm -v "$(pwd)/data":/data alpine sh -c 'echo "ecrit par uid $(id -u)" > /data/uid.txt'
ls -n data
\`\`\`

6. La parade : lancer le conteneur avec **ton** identifiant utilisateur.

\`\`\`bash
docker run --rm --user "$(id -u)":"$(id -g)" -v "$(pwd)/data":/data alpine sh -c 'echo "meme uid que moi" > /data/uid2.txt'
ls -n data
\`\`\`

**Ce que tu observes**

- Un seul conteneur suffit : le montage n'existe que le temps du \`docker run\`.
- \`$(pwd)/data\` est le chemin **sur ta machine**, \`/data\` est le chemin **dans** le conteneur. Les deux noms peuvent être différents.
- Le dossier n'a pas besoin d'exister dans l'image : Docker le crée au besoin. En revanche, s'il n'existe pas sur ta machine, Docker crée un dossier **vide**.
- \`--user\` règle le piège des permissions, très fréquent en développement.

**Ton mot de passe**

Il n'est écrit nulle part : il a survécu au conteneur, dans le volume. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker volume create m6-partage && docker run --rm -v m6-partage:/donnees alpine sh -c "wget -qO /donnees/secret.txt 'http://SERVER_IP:8000/api/secret/m6-02-dossier-partage/raw?token=$ARENA_TOKEN'"
docker run --rm -v m6-partage:/donnees alpine cat /donnees/secret.txt && docker volume rm m6-partage
\`\`\`

Le second conteneur affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "L'option de montage s'écrit `-v`, avec deux chemins séparés par deux-points : celui de la machine, puis celui du conteneur.",
        "Le chemin de la machine doit être absolu : la commande `pwd` combinée aux parenthèses te le donne.",
      ],
      solution: `\`\`\`bash
mkdir -p ~/arena-bind/data
cd ~/arena-bind
printf 'note ecritue depuis la machine hote\\n' > data/note.txt

docker run --rm -v "$(pwd)/data":/data alpine sh -c 'ls -la /data && cat /data/note.txt'
# -> note.txt          visible
#    note ecritue depuis la machine hote

docker run --rm -v "$(pwd)/data":/data alpine sh -c 'echo "ecrit depuis le conteneur" > /data/recu.txt'
cat data/recu.txt
# -> ecrit depuis le conteneur    (le fichier du conteneur est arrive sur ta machine)

docker run --rm -v "$(pwd)/data":/data alpine sh -c 'rm /data/recu.txt'
ls -la data
# -> recu.txt a disparu de la machine : le montage est dans les deux sens

id -u
# -> par exemple 1000
docker run --rm -v "$(pwd)/data":/data alpine sh -c 'echo "ecrit par uid $(id -u)" > /data/uid.txt'
ls -n data
# -> uid.txt appartient a l'utilisateur 0 (root) : le piege

docker run --rm --user "$(id -u)":"$(id -g)" -v "$(pwd)/data":/data alpine sh -c 'echo "meme uid que moi" > /data/uid2.txt'
ls -n data
# -> uid2.txt appartient a ton propre utilisateur : probleme resolu
\`\`\``,
      teaches: ['bind mount', 'option -v', 'partage de dossier', 'permissions', 'option --user'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker volume create m6-partage && docker run --rm -v m6-partage:/donnees alpine sh -c "wget -qO /donnees/secret.txt 'http://SERVER_IP:8000/api/secret/m6-02-dossier-partage/raw?token=$ARENA_TOKEN'"
docker run --rm -v m6-partage:/donnees alpine cat /donnees/secret.txt && docker volume rm m6-partage`,
      checkpoint: "Tu as réussi quand un fichier créé dans le conteneur apparaît dans `data/` sur ta machine, et quand `ls -n data` montre le fichier `uid.txt` appartenant à root, avant l'étape 6.",
    },

    {
      id: 'm6-03-volume-nomme',
      order: 3,
      title: 'Le volume que Docker gère',
      points: 50,
      flag: 'FLAG{NAMED_VOLUME_MANAGED_BY_DOCKER}',
      estMinutes: 18,
      brief: `# Le volume que Docker gère

Deuxième solution : demander à Docker de créer et de gérer lui-même un espace de stockage, appelé **volume**. C'est plus robuste qu'un dossier partagé, et c'est ce qu'on utilise en production.

**Ta mission**

1. Crée un volume nommé :

\`\`\`bash
docker volume create notes_volume
docker volume ls
\`\`\`

2. Regarde où Docker a prévu de le stocker :

\`\`\`bash
docker volume inspect notes_volume --format '{{.Name}} -> {{.Mountpoint}}'
\`\`\`

3. Monte-le dans un conteneur et dépose-y un fichier :

\`\`\`bash
docker run --rm -v notes_volume:/notes alpine sh -c 'echo "etiquette du volume" > /notes/etiquette.txt'
\`\`\`

4. Relis le contenu avec un **tout autre** conteneur :

\`\`\`bash
docker run --rm -v notes_volume:/notes alpine cat /notes/etiquette.txt
docker run --rm -v notes_volume:/notes alpine ls -la /notes
\`\`\`

5. Compare avec la syntaxe longue, plus explicite, qui accepte plus d'options :

\`\`\`bash
docker run --rm --mount type=volume,source=notes_volume,target=/notes alpine ls -la /notes
\`\`\`

6. Supprime le volume, puis nettoie les volumes inutilisés :

\`\`\`bash
docker volume rm notes_volume
docker volume prune -f
\`\`\`

**Comparé au dossier partagé**

- Un volume nommé a un nom, pas un chemin. Docker choisit le dossier réel et le gère.
- Il est créé par Docker : il n'apparaît nulle part dans tes dossiers.
- Docker le supprime seulement quand tu le demandes, ou lors d'un grand nettoyage.
- \`docker volume prune\` supprime **tous** les volumes inutilisés : vérifie deux fois avant de le lancer sur une vraie machine.

**Ton mot de passe**

Il n'est écrit nulle part : il a survécu au conteneur, dans le volume. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker volume create notes_volume && docker run --rm -v notes_volume:/donnees alpine sh -c "wget -qO /donnees/etiquette.txt 'http://SERVER_IP:8000/api/secret/m6-03-volume-nomme/raw?token=$ARENA_TOKEN'"
docker run --rm -v notes_volume:/donnees alpine cat /donnees/etiquette.txt && docker volume rm notes_volume
\`\`\`

Le second conteneur affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "Un volume nommé a son propre cycle de vie, avec sa propre commande de création et sa propre commande de suppression.",
        "Le chemin à l'intérieur du conteneur est libre : `/notes`, `/vault` ou `/backup` marcheraient tout aussi bien.",
      ],
      solution: `\`\`\`bash
docker volume create notes_volume
# -> notes_volume
docker volume ls
# -> DRIVER    VOLUME NAME
#    local     notes_volume

docker volume inspect notes_volume --format '{{.Name}} -> {{.Mountpoint}}'
# -> notes_volume -> /var/lib/docker/volumes/notes_volume/_data

docker run --rm -v notes_volume:/notes alpine sh -c 'echo "FLAG{NAMED_VOLUME_MANAGED_BY_DOCKER}" > /notes/etiquette.txt'

docker run --rm -v notes_volume:/notes alpine cat /notes/etiquette.txt
# -> etiquette du volume    (conteneur completement different)
docker run --rm -v notes_volume:/notes alpine ls -la /notes
# -> etiquette.txt

docker run --rm --mount type=volume,source=notes_volume,target=/notes alpine ls -la /notes
# -> etiquette.txt   (la forme longue fait la meme chose)

docker volume rm notes_volume
# -> notes_volume
docker volume prune -f
# -> Total reclaimed space: 4.34kB   (supprime TOUS les volumes inutilises)
\`\`\``,
      teaches: ['docker volume create', 'docker volume ls', 'docker volume inspect', 'option --mount', 'docker volume prune'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker volume create notes_volume && docker run --rm -v notes_volume:/donnees alpine sh -c "wget -qO /donnees/etiquette.txt 'http://SERVER_IP:8000/api/secret/m6-03-volume-nomme/raw?token=$ARENA_TOKEN'"
docker run --rm -v notes_volume:/donnees alpine cat /donnees/etiquette.txt && docker volume rm notes_volume`,
      checkpoint: "Tu as réussi quand un second conteneur, sans lien avec le premier, a affiché le fichier déposé dans le volume, et quand `docker volume ls` ne liste plus `notes_volume` après le nettoyage.",
    },

    {
      id: 'm6-04-persistence-guardian',
      order: 4,
      title: 'Persistence Guardian',
      points: 500,
      flag: 'FLAG{DATA_PERSISTENCE_VAULT_RESCUE}',
      estMinutes: 22,
      brief: `# Mission phare — Persistence Guardian

Objectif : garantir la survie des données applicatives après la destruction des conteneurs, grâce aux volumes Docker.

**Mission**

1. Crée un volume nommé géré par Docker :

\`\`\`bash
docker volume create vault_data
\`\`\`

2. Pose d'abord ton jeton d'équipe — celui affiché à l'inscription — avec la commande \`export ARENA_TOKEN='dq_…'\`, puis démarre un conteneur éphémère qui va chercher ton mot de passe au portail et l'écrit dans ce volume avant de s'autodétruire :

\`\`\`bash
docker run --rm -v vault_data:/vault alpine sh -c "wget -qO /vault/safe.key 'http://SERVER_IP:8000/api/secret/m6-04-persistence-guardian/raw?token=$ARENA_TOKEN'"
\`\`\`

3. Le test de continuité : démarre un second conteneur, **distinct**, pour relire la donnée stockée dans le volume. Note bien qu'il ne monte pas le volume au même endroit :

\`\`\`bash
docker run --rm -v vault_data:/backup alpine cat /backup/safe.key
\`\`\`

Si la chaîne s'affiche, tes données sont pérennes : elle a survécu au conteneur qui l'écrivait, et qui n'existe déjà plus.

4. Confirme que le volume existe toujours, puis supprime-le :

\`\`\`bash
docker volume ls
docker volume rm vault_data
\`\`\`

**Ton mot de passe**

Il n'est écrit nulle part : il a survécu au conteneur, dans le volume. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace dq_xxxxxxxxxxxxxxxx par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker volume create vault_data && docker run --rm -v vault_data:/donnees alpine sh -c "wget -qO /donnees/safe.key 'http://SERVER_IP:8000/api/secret/m6-04-persistence-guardian/raw?token=$ARENA_TOKEN'"
docker run --rm -v vault_data:/donnees alpine cat /donnees/safe.key && docker volume rm vault_data
\`\`\`

Le second conteneur affiche le mot de passe : envoie-le tel quel au portail.`,
      hints: [
        "L'option de montage d'un volume nommé s'écrit `-v`, suivie du nom du volume, de deux-points, puis du chemin dans le conteneur.",
        "Les deux conteneurs de l'étape 3 sont jetables et sans aucun rapport : c'est le volume, et lui seul, qui transporte la donnée.",
        "Le chemin dans le conteneur est libre : monte le volume sur `/backup` alors qu'il a été créé pour `/vault`.",
      ],
      solution: `\`\`\`bash
docker volume create vault_data
# -> vault_data

docker run --rm -v vault_data:/vault alpine sh -c "wget -qO /vault/safe.key 'http://SERVER_IP:8000/api/secret/m6-04-persistence-guardian/raw?token=$ARENA_TOKEN'"
# -> le conteneur ecrit, puis disparait immediatement (--rm)

docker run --rm -v vault_data:/backup alpine cat /backup/safe.key
# -> FLAG{...}   <- la donnee a survecu au conteneur qui l'avait ecrite

docker volume ls
# -> DRIVER    VOLUME NAME
#    local     vault_data

docker volume rm vault_data
# -> vault_data
# A envoyer au portail : le mot de passe affiche ci-dessus
\`\`\``,
      teaches: ['volume nommé', 'persistance des données', 'docker volume rm', 'test de continuité'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker volume create vault_data && docker run --rm -v vault_data:/donnees alpine sh -c "wget -qO /donnees/safe.key 'http://SERVER_IP:8000/api/secret/m6-04-persistence-guardian/raw?token=$ARENA_TOKEN'"
docker run --rm -v vault_data:/donnees alpine cat /donnees/safe.key && docker volume rm vault_data`,
      checkpoint: "Tu as réussi quand un second conteneur sans lien avec le premier a affiché le mot de passe, et quand `docker volume ls` confirme que le volume existe encore après la disparition des conteneurs.",
    },
  ],
};