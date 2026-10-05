# Vérification dans un vrai navigateur

Ces scripts pilotent Chromium en CDP et jouent le jeu **par les pixels** :
clics, saisies, captures. Aucune dépendance à installer — le client WebSocket
est dans Node depuis la 22, et le projet n'a qu'une dépendance.

## Pourquoi c'est nécessaire

Cinq des neuf défauts corrigés avant la v1.0 étaient **invisibles** depuis les
tests unitaires, qui exécutent `public/app.js` contre un DOM de substitution :

| défaut | pourquoi les tests ne l'avaient pas vu |
|---|---|
| les 70 QCM n'étaient jamais rendus | ils appelaient `renderPortal` directement, sans ouvrir la vraie page |
| le bouton d'indice naissait `disabled` | `.click()` respecte `disabled` ; le test le déclenchait donc, et le deadlock ne se voyait pas |
| le bilan de validation ne s'affichait pas | il était écrit dans `#submitMsg`, qui n'existe pas pour une quête validée |
| « Quitter » ne faisait rien | le test substituait `globalThis.confirm` **après** que `loadClient` l eut capturé en paramètre |
| la page d'accueil affichait un toast d'erreur | `/api/overview` était fermée, et le test de la page ne l'appelait pas |

Leçon générale : **un test qui exercise une fonction n'exerce pas la page.**
Il faut au moins un passage par un vrai navigateur pour les défauts de rendu.

## Chromium

```bash
chromium --headless=new --no-sandbox --disable-gpu \
  --disable-dev-shm-usage --remote-debugging-port=9222 \
  --remote-allow-origins='*' --user-data-dir=/tmp/chrome-atelier about:blank &
```

`--remote-allow-origins` est nécessaire : sans lui, le WebSocket CDP est
refusé par la vérification d'origine du navigateur.

## Les scripts

| script | ce qu'il joue | arguments |
|---|---|---|
| `pilote.mjs` | outil générique : navigue, attend, évalue, capture | `<url> [sortie.png] [--wait=sélecteur] [--ms=3000] [--eval="expr"] [--largeur=] [--hauteur=] [--pleinePage=1] [--port=]` |
| `verifie-jeu.mjs` | une session complète : inscription, QCM, indice, validation, rechargement | `<url> [équipe] [quêtes=4,9,21] [port]` |
| `verifie-admin.mjs` | l'écran `/admin` : mauvais mot de passe, bon mot de passe, la classe, la confirmation avant remise à zéro | `<url> [mdp] [port]` |
| `verifie-reprise.mjs` | le formulaire de reconnexion (pseudo + secret) dans les deux modes | `<url> [port]` |
| `verifie-accueil.mjs` | `/`, `/#/` et une ancre inconnue : les trois mènent-elles au jeu ? | `<url> [port]` |
| `verifie-quitter.mjs` | « Quitter » déconnecte-t-il vraiment ? rechargement, puis reprise | `<url> [port] [équipe]` |

Les captures vont dans `$ATELIER_SHOTS` (défaut `/tmp/atelier-shots`).

## Exemple

```bash
# 1. un conteneur de recette
docker build -t atelier-docker:test .
docker run -d --name recette -p 127.0.0.1:8094:8000 \
  -e ADMIN_KEY=mdp -e RATE_LIMIT=off -e QUIET=1 atelier-docker:test

# 2. Chromium
chromium --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --remote-debugging-port=9222 --remote-allow-origins='*' \
  --user-data-dir=/tmp/chrome-atelier about:blank &

# 3. jouer
node verifie-jeu.mjs http://127.0.0.1:8094 Recette 1,4,9,21 9222
node verifie-admin.mjs http://127.0.0.1:8094 mdp 9222
```

## Pièges déjà payés

**Un `confirm` natif bloque le renderer de son onglet.** Après un clic qui ouvre
un dialogue, `Page.enable` sur cet onglet ne répond plus jamais. `verifie-quitter`
crée un onglet neuf à chaque exécution et accepte les dialogues
automatiquement — ne le remplacez pas par une sélection du premier onglet.

**Naviguer vers la même URL ne recharge pas la page.** L'app reste dans son état
précédent, et le script rapporte fidèlement un bug déjà corrigé. Ajoutez `?r=<aléatoire>`
à chaque navigation (`verifie-accueil` le fait).

**Désactivez le cache.** `Network.setCacheDisabled({cacheDisabled: true})`, sinon
Chromium sert l'ancien `app.js`.

**`Page.captureScreenshot({captureBeyondViewport: true})` ment.** Elle recompose
toute la hauteur de page et laisse des couches peintes là où un élément
`display: none` se trouvait : la capture montre un écran qui n'existe plus. Pour
vérifier une présence/absence, capturez le **viewport** seul. C'est ce qui a
produit une fausse conclusion « le champ est invisible ».

**Les erreurs console sont le signal.** `Runtime.exceptionThrown` donne
`exceptionDetails.exception.description` (avec la pile) ; `exceptionDetails.text`
ne vaut que « Uncaught ». Sans ça, un échec de module est totalement invisible.

**Un test de rendu se pilote par les pixels.** Choisir un mode, remplir, envoyer :
un champ `hidden` ne se voit pas dans une assertion sur le JavaScript, et c'est
précisémment le défaut qu'il fallait trouver.