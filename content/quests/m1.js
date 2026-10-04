// Module 1 — Les fondamentaux
// Quêtes d'observation : on regarde, on compare, on lit l'aide.
// Aucune quête à points_phare ici, le module démarre doucement.
export default {
  meta: {
    slug: 'm1-fondamentaux',
    module: 1,
    title: 'Les fondamentaux',
    tagline: 'Deux mots à comprendre avant de taper la moindre commande',
    icon: '🧭',
  },

  quests: [
    {
      id: 'm1-01-image-ou-conteneur',
      order: 1,
      title: 'Image ou conteneur ?',
      points: 25,
      flag: 'FLAG{IMAGE_TEMPLATE_CONTAINER_PROCESS}',
      estMinutes: 10,
      brief: `# Image ou conteneur ?

Bienvenue dans l'arène. Avant de lancer la moindre commande, il faut deux mots dans la tête.

- Une **image**, c'est un modèle figé. Elle ne fait rien toute seule.
- Un **conteneur**, c'est une instance de ce modèle, en train de tourner.

Pense à un programme que tu compiles : tu obtiens un fichier, c'est tout. Le fichier ne travaille pas. C'est le lancement du fichier qui travaille. L'image, c'est le fichier. Le conteneur, c'est le lancement.

**Ta mission**

1. Ouvre un terminal et demande à Docker la liste des images qu'il connaît :

\`\`\`bash
docker images
\`\`\`

2. Demande-lui la liste des conteneurs en marche :

\`\`\`bash
docker ps
\`\`\`

3. Compare les deux listes. Sur une machine où tu n'as encore rien lancé, laquelle est vide ?

4. Note la réponse dans un fichier, pour t'y référer plus tard :

\`\`\`bash
mkdir -p ~/arena-notes
echo "Image = modèle figé, conteneur = instance en marche" > ~/arena-notes/m1.txt
\`\`\`

Tu peux remplacer la phrase par la tienne : l'important est de l'avoir écrite, pas d'avoir la bonne formule.

**Ton mot de passe**

Il n'est écrit nulle part : il sort du fichier que le conteneur vient de lire. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine sh -c "mkdir -p /arena && wget -qO /arena/secret.txt 'https://SERVER_IP/api/secret/m1-01-image-ou-conteneur/raw?token=$ARENA_TOKEN' && cat /arena/secret.txt"
\`\`\`

Le mot de passe s'affiche dans le terminal : envoie-le tel quel au portail.`,
      hints: [
        "Oublie Docker deux secondes : quelle commande liste ce qui est téléchargé, et quelle commande liste ce qui tourne en ce moment ?",
        "Docker a deux verbes de lecture : `docker images` et `docker ps`. Lance les deux, côte à côte, et compare les colonnes.",
      ],
      solution: `\`\`\`bash
docker images
# -> la liste des images deja telechargees : des modeles figes, identifiees par
#    REPOSITORY:TAG et un IMAGE ID.

docker ps
# -> la liste des conteneurs en cours d'execution. Vide tant que tu n'as rien lance.

# Phrase attendue (tes mots) :
# une image est un modele fige (comme un programme compile) ;
# un conteneur est une instance de ce modele, en train de tourner (comme le processus lance).
\`\`\``,
      teaches: ['image', 'conteneur', 'modèle figé', 'processus'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine sh -c "mkdir -p /arena && wget -qO /arena/secret.txt 'https://SERVER_IP/api/secret/m1-01-image-ou-conteneur/raw?token=$ARENA_TOKEN' && cat /arena/secret.txt"`,
      checkpoint: "Tu as réussi quand `docker ps` renvoie une liste vide alors que `docker images` te donne au moins une ligne, et quand tu arrives à expliquer la différence en une phrase.",
    },

    {
      id: 'm1-02-qui-tourne-qui-dort',
      order: 2,
      title: 'Qui tourne, et qui dort ?',
      points: 25,
      flag: 'FLAG{STATES_UP_EXITED_PS_ALL}',
      estMinutes: 12,
      brief: `# Qui tourne, et qui dort ?

Docker fait la différence entre une image, un conteneur en marche et un conteneur arrêté. Savoir lire ces états, c'est savoir diagnostiquer une panne en dix secondes.

**Ta mission**

1. Lance un conteneur qui affiche un message puis attend cinq minutes. Cette commande occupe le terminal : garde-la en vie et ouvre un **deuxième onglet ou un deuxième terminal** pour la suite.

\`\`\`bash
docker run --name etat-demo alpine sh -c 'echo "premier lancement"; sleep 300'
\`\`\`

2. Dans le second terminal, regarde les conteneurs en marche, puis tous les conteneurs :

\`\`\`bash
docker ps
docker ps -a
\`\`\`

3. Arrête le conteneur, regarde encore, puis redémarre-le et relis ses logs :

\`\`\`bash
docker stop etat-demo
docker ps -a
docker start etat-demo
docker logs etat-demo
\`\`\`

4. Supprime le conteneur, puis regarde où va l'espace disque :

\`\`\`bash
docker rm etat-demo
docker system df
\`\`\`

**Ce que tu observes**

- \`docker ps\` ne liste que les conteneurs dont le statut commence par **Up**.
- \`docker ps -a\` ajoute les conteneurs arrêtés, avec le statut **Exited**.
- Les logs survivent à l'arrêt, et se cumulent à chaque redémarrage.
- \`docker system df\` donne l'espace utilisé par les images, les conteneurs, les volumes et le cache de build.

**Ton mot de passe**

Il n'est écrit nulle part : il sort du fichier que le conteneur vient de lire. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine sh -c "mkdir -p /arena && wget -qO /arena/secret.txt 'https://SERVER_IP/api/secret/m1-02-qui-tourne-qui-dort/raw?token=$ARENA_TOKEN' && cat /arena/secret.txt"
\`\`\`

Le mot de passe s'affiche dans le terminal : envoie-le tel quel au portail.`,
      hints: [
        "Le mot « tous » dans la deuxième commande est une lettre : `ps -a` signifie « all », c'est-à-dire tous les conteneurs, arrêtés compris.",
        "Le statut se lit dans la colonne STATUS de `docker ps -a`. Compare la colonne STATUS avant et après `docker stop`.",
      ],
      solution: `\`\`\`bash
# Terminal 1 : le conteneur occupe le terminal tant qu'il tourne
docker run --name etat-demo alpine sh -c 'echo "premier lancement"; sleep 300'

# Terminal 2
docker ps          # -> etat-demo  Up  ...
docker ps -a       # -> etat-demo  Up  ... (identique, il tourne)

docker stop etat-demo
docker ps -a       # -> etat-demo  Exited (137) ...   (137 = tue par SIGKILL apres le delai de stop)
docker start etat-demo
docker logs etat-demo
# -> deux lignes "premier lancement" : une par demarrage, les logs ne s'effacent jamais tout seuls

docker rm etat-demo
docker system df
# -> un tableau : TOTAL, ACTIVE, SIZE, RECLAIMABLE pour images, conteneurs, volumes, cache
\`\`\``,
      teaches: ['docker ps', 'docker ps -a', 'statut Up', 'statut Exited', 'docker system df'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine sh -c "mkdir -p /arena && wget -qO /arena/secret.txt 'https://SERVER_IP/api/secret/m1-02-qui-tourne-qui-dort/raw?token=$ARENA_TOKEN' && cat /arena/secret.txt"`,
      checkpoint: "Tu as réussi quand tu as vu le statut passer de Up à Exited puis revenir à Up, et quand `docker system df` t'a affiché un tableau d'espace disque.",
    },

    {
      id: 'm1-03-la-doc-dans-le-terminal',
      order: 3,
      title: 'La doc est dans le terminal',
      points: 50,
      flag: 'FLAG{HELP_IS_THE_MANUAL_CLI}',
      estMinutes: 12,
      brief: `# La doc est dans le terminal

Tu n'as pas besoin de retenir les options de Docker : elles sont écrites dans la commande elle-même. Apprendre à lire l'aide, c'est apprendre Docker.

**Ta mission**

1. Affiche le sommaire de la CLI :

\`\`\`bash
docker help
\`\`\`

2. Demande l'aide de la seule commande \`run\` :

\`\`\`bash
docker help run
\`\`\`

3. Retrouve dans cette sortie la ligne qui explique l'option \`--rm\`. Note aussi le nombre d'options listées.

4. Demande l'aide détaillée d'une commande, avec ses options :

\`\`\`bash
docker run --help
docker ps --help
\`\`\`

5. Affiche la version de ton moteur, puis seulement la version **du serveur** grâce à \`--format\` :

\`\`\`bash
docker version
docker version --format '{{.Server.Version}}'
docker version --format '{{.Server.Os}} / {{.Server.Arch}}'
\`\`\`

**Bon à retenir**

- \`docker\` tout seul affiche l'aide, comme \`docker ps\` tout seul affiche la liste des conteneurs.
- \`--format\` utilise un mini langage : \`{{.NomDuChamp}}\` est remplacé par la valeur.
- Tout ce que tu peux faire au terminal, tu peux l'automatiser dans un script. C'est tout l'intérêt.

**Ton mot de passe**

Il n'est écrit nulle part : il sort du fichier que le conteneur vient de lire. Il est différent pour chaque équipe, et le portail ne le livre qu'à toi.

Remplace \`dq_xxxxxxxxxxxxxxxx\` par ton jeton d'équipe — celui que le portail a affiché à l'inscription — puis colle ces lignes dans ton terminal :

\`\`\`bash
export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine sh -c "mkdir -p /arena && wget -qO /arena/secret.txt 'https://SERVER_IP/api/secret/m1-03-la-doc-dans-le-terminal/raw?token=$ARENA_TOKEN' && cat /arena/secret.txt"
\`\`\`

Le mot de passe s'affiche dans le terminal : envoie-le tel quel au portail.`,
      hints: [
        "Trois portes d'entrée vers l'aide : `docker help`, `docker help run`, et `docker run --help`.",
        "Pour n'afficher qu'une partie de `docker version`, le mini langage de `--format` utilise des accolades doubles autour d'un nom de champ.",
      ],
      solution: `\`\`\`bash
docker help
# -> la liste des commandes disponibles, regroupees par theme (Common Commands, Management Commands...)

docker help run
docker run --help
# -> la syntaxe : docker run [OPTIONS] IMAGE [COMMAND] [ARG...]
#    et l'option --rm : "Automatically remove the container when it exits"

docker ps --help

docker version
# -> deux blocs : Client (la CLI) et Server (le demon Docker)

docker version --format '{{.Server.Version}}'
# -> par exemple 24.0.7 : uniquement la version du serveur

docker version --format '{{.Server.Os}} / {{.Server.Arch}}'
# -> par exemple linux / amd64
\`\`\``,
      teaches: ['docker help', 'docker version', 'option --help', 'option --format', 'client et serveur'],
      fetchHint: `export ARENA_TOKEN='dq_xxxxxxxxxxxxxxxx'
docker run --rm alpine sh -c "mkdir -p /arena && wget -qO /arena/secret.txt 'https://SERVER_IP/api/secret/m1-03-la-doc-dans-le-terminal/raw?token=$ARENA_TOKEN' && cat /arena/secret.txt"`,
      checkpoint: "Tu as réussi quand tu as trouvé la ligne d'aide de `--rm` sans quitter le terminal, et quand `docker version --format` t'affiche une seule ligne.",
    },
  ],
};