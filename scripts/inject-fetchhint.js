#!/usr/bin/env node
/**
 * Retire le mot de passe affiché des énoncés et ajoute la commande qui va le
 * chercher.
 *
 *   node scripts/inject-fetchhint.js           # écrit les 7 fichiers
 *   node scripts/inject-fetchhint.js --dry-run # n'écrit rien, montre le bilan
 *
 * Les énoncés suivaient tous le même gabarit : une section finale
 * « **Ton mot de passe** … FLAG{…} ». On la supprime et on la remplace par une
 * section qui renvoie à `fetchHint`, ajouté dans l'objet de la quête.
 */
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const DIR = 'content/quests';

/**
 * La commande de récupération, une par module : elle mobilise la technique
 * que le module vient d'enseigner, et le mot de passe en sort — il n'est écrit
 * nulle part.
 *
 * `--network host` permet à un conteneur d'atteindre le portail sur
 * 127.0.0.1 : c'est la seule méthode qui marche sur Docker Desktop comme sur
 * un Engine Linux, sans avoir à connaître l'IP du serveur. Le repli par
 * l'adresse du serveur est indiqué en commentaire quand il diffère.
 */
const PAR_MODULE = {
  1: (id) => [
    `docker run --rm alpine sh -c 'wget -qO- https://SERVER_IP/api/secret/${id}/raw?t=PLAYER_TOKEN'`,
  ],
  2: (id) => [
    `docker run --rm alpine sh -c 'wget -qO- https://SERVER_IP/api/secret/${id}/raw?t=PLAYER_TOKEN'`,
  ],
  3: (id) => [
    `docker run --rm --network host alpine sh -c 'wget -qO- http://127.0.0.1:8000/api/secret/${id}/raw?t=PLAYER_TOKEN'`,
  ],
  4: (id) => [
    `docker run --rm --network host nginx:alpine sh -c 'wget -qO- http://127.0.0.1:8000/api/secret/${id}/raw?t=PLAYER_TOKEN' -O /usr/share/nginx/html/index.html`,
  ],
  5: (id) => [
    `docker build -t arena-secret:1 - <<'EOF'`,
    `FROM alpine`,
    `CMD wget -qO- https://SERVER_IP/api/secret/${id}/raw`,
    `EOF`,
    `docker run --rm arena-secret:1`,
  ],
  6: (id) => [
    `docker volume create arena-secret >/dev/null`,
    `docker run --rm --network host -v arena-secret:/data alpine sh -c 'wget -qO- -O /data/secret.txt http://127.0.0.1:8000/api/secret/${id}/raw?t=PLAYER_TOKEN'`,
    `docker run --rm -v arena-secret:/data alpine cat /data/secret.txt`,
  ],
  7: (id) => [
    `mkdir -p /tmp/arena && cd /tmp/arena`,
    `printf 'services:\\n  secret:\\n    image: alpine\\n    network_mode: host\\n    volumes:\\n      - ./out:/out\\n    command: wget -qO- -O /out/flag.txt http://127.0.0.1:8000/api/secret/${id}/raw?t=PLAYER_TOKEN\\n' > compose.yml && docker compose up --abort-on-container-exit && cat out/flag.txt`,
  ],
};

/** Bloc qui remplace l'ancienne section « Ton mot de passe ». */
const NOUVELLE_SECTION = (id, module) => {
  const cmd = PAR_MODULE[module](id);
  const exemple = cmd.filter((l) => !l.startsWith('#') && !l.startsWith('EOF'));
  return [
    '**Ton mot de passe**',
    '',
    "Ce mot de passe n'est écrit nulle part dans l'énoncé : il est **le résultat**",
    'de ce que tu viens de faire. Va le chercher avec cette commande, sur ta',
    'machine, dans un terminal :',
    '',
    '```bash',
    ...cmd,
    '```',
    '',
    'Puis colle le mot de passe obtenu dans le formulaire de validation, en bas',
    "de cette page. Il est **différent pour chaque équipe** : le communiquer à",
    'un autre binôme ne lui apportera rien.',
    '',
    `Si la commande ne renvoie rien, vérifie que le portail répond : \`curl https://SERVER_IP/healthz\`.`,
  ].join('\n');
};

/**
 * Transforme un fichier de module.
 *
 * On travaille ligne à ligne plutôt qu'avec une grosse expression régulière :
 * les énoncés contiennent des accents, des backticks échappés et des
 * heredocs, et une regex serait trop facile à casser en silence.
 */
function transformer(src, module) {
  const lignes = src.split('\n');
  const sortie = [];
  let i = 0;
  let quetes = 0;
  let fetchHintAjoute = 0;

  while (i < lignes.length) {
    const ligne = lignes[i];

    // ── début d'une quête
    const mId = ligne.match(/^(\s*)id: '([^']+)',$/);
    if (!mId) { sortie.push(ligne); i += 1; continue; }
    const id = mId[2];
    quetes += 1;
    sortie.push(ligne);
    i += 1;

    // On absorbe les champs jusqu'au `brief:` inclus.
    let flag = null;
    while (i < lignes.length && !/^\s*brief: /.test(lignes[i])) {
      const mf = lignes[i].match(/^\s*flag: '([^']+)',$/);
      if (mf) flag = mf[1];
      sortie.push(lignes[i]);
      i += 1;
    }
    if (i >= lignes.length) break;

    // ── le brief : du ` au ` de fermeture
    const debutBrief = i;
    sortie.push(lignes[i]);
    i += 1;
    const corps = [];
    let termine = false;
    while (i < lignes.length) {
      const l = lignes[i];
      // La fermeture est soit seule (` puis `,`), soit en fin de ligne de
      // texte (`… FLAG{X}.`,) : les deux formes coexistent dans le contenu.
      if (/^`\,\s*$/.test(l)) { termine = true; break; }
      if (/`\,\s*$/.test(l)) {
        const dernier = corps.length - 1;
        corps[dernier] = corps[dernier].replace(/`\,\s*$/, '');
        termine = true;
        break;
      }
      corps.push(l);
      i += 1;
    }
    if (!termine) throw new Error(`${id} : brief non terminé`);

    // ── suppression de la section finale
    // Deux libellés coexistent dans le contenu : « Ton mot de passe » et
    // « Validation ». Les deux marquent la même chose.
    const idx = corps.findIndex((l) => /^\*\*(Ton mot de passe|Validation|Défi du mot de passe)\*\*\s*$/.test(l));
    let gardes;
    if (idx === -1) {
      // Certaines missions n'ont pas de section finale : le flag y était
      // glissé dans le code à écrire (`message += "FLAG: …"`). On retire
      // alors la dernière étape, qui consistait à le déposer manuellement.
      const derniereEtape = dernierIndexDe(corps, /^\d+\.\s/);
      if (derniereEtape === -1) throw new Error(`${id} : section finale introuvable`);
      let fin = derniereEtape;
      while (fin > 0 && corps[fin - 1].trim() === '') fin -= 1;
      gardes = corps.slice(0, fin);
    } else {
      // On remonte d'éventuelles lignes vides avant la section.
      let fin = idx;
      while (fin > 0 && corps[fin - 1].trim() === '') fin -= 1;
      gardes = corps.slice(0, fin);
    }

    // ── le flag glissé dans le corps de l'énoncé ────────────────────────
    // Certaines missions le plaçaient dans la commande à taper
    // (`echo 'FLAG{…}' > /vault/safe.key`) : c'est circulaire, l'étudiant
    // n'avait rien à découvrir. On remplace la ligne par un appel au portail,
    // ce qui rend enfin le résultat dépendant de son environnement.
    if (flag) {
      gardes = gardes
        .map((l) => (l.includes(flag) ? ligneAvecSecret(l, flag, id) : l))
        .filter((l) => !/^\s*\\?`?FLAG\{/.test(l.trim()));
    }

    const cmd = PAR_MODULE[module](id);
    // Le brief vit dans un template literal : chaque backtick du Markdown doit
    // être précédé d'un antislash, exactement une fois.
    const echappe = (l) => l.replace(/(?<!\\)`/g, '\\`');
    // Les lignes de commentaire du hint sont purement décoratives : on les
    // sort de l'énoncé, elles n'apportent rien au joueur.
    const garde = NOUVELLE_SECTION(id, module)
      .split('\n')
      .filter((l) => !/^#/.test(l))
      .map(echappe);

    sortie.push(...gardes, ...garde, '`,');
    void debutBrief;
    i += 1; // on saute la ligne de fermeture du template

    // ── insertion du fetchHint juste avant le `checkpoint:` de CETTE quête
    const champ = `      fetchHint: \`${cmd.join('\n').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\`,`;
    let ahead = [];
    while (i < lignes.length) {
      const l = lignes[i];
      if (/^\s*id: '/.test(l)) break;            // quête suivante
      if (/^\s*checkpoint:/.test(l)) {
        ahead.push(champ);
        fetchHintAjoute += 1;
      }
      ahead.push(l);
      i += 1;
    }
    sortie.push(...ahead);
  }

  return { texte: sortie.join('\n'), quetes, fetchHintAjoute };
}

/**
 * Remplace le flag d'une ligne de commande par un appel au portail.
 *
 * `docker run … alpine sh -c "echo 'FLAG{X}' > /vault/safe.key"` devient une
 * commande qui va chercher le secret puis l'écrit : le résultat dépend
 * désormais du réseau et du volume, pas d'un copier-coller.
 */
function ligneAvecSecret(ligne, flag, id) {
  const url = `http://127.0.0.1:8000/api/secret/${id}/raw?t=PLAYER_TOKEN`;

  // Valeur d'environnement YAML : le secret doit venir du portail, lu au
  // démarrage du service. On substitue une interpolation de commande au moment
  // où Compose lit le fichier.
  if (/^\s*-\s*"?ARENA_MOT_DE_PASSE=/.test(ligne)) {
    return ligne.replace(/=\s*"?FLAG\{[A-Z0-9_]+\}"?/, `= "$(wget -qO- ${url})"`);
  }
  // Commentaire YAML : on retire la ligne, la valeur ci-dessus fait foi.
  if (/^\s*#\s*.*ARENA_MOT_DE_PASSE:/.test(ligne)) return '';

  // Écriture dans un fichier : on récupère puis on redirige.
  if (/echo .*> /.test(ligne)) {
    return ligne.replace(/(['"]?)FLAG\{[A-Z0-9_]+\}\1/, `"$(wget -qO- ${url})"`);
  }
  // echo « FLAG — suite » : on substitue le début de la phrase.
  if (/echo ["']?FLAG\{/.test(ligne)) {
    return ligne.replace(/(echo ["']?)FLAG\{[A-Z0-9_]+\}/, `$1$(wget -qO- ${url})`);
  }
  // Assignation dans un source (Python, shell…) : on lit le secret au runtime.
  if (/=\s*["']/.test(ligne)) {
    return ligne.replace(/(=\s*)["'][^"']*["']/, `$1"$(wget -qO- ${url})"`);
  }
  return ligne.replace(flag, `$(wget -qO- ${url})`);
}

/** Dernière ligne du tableau satisfaisant `test`, ou -1. */
function dernierIndexDe(tableau, test) {
  for (let i = tableau.length - 1; i >= 0; i -= 1) if (test.test(tableau[i])) return i;
  return -1;
}

let total = 0;
let totalHint = 0;

for (let m = 1; m <= 7; m++) {
  const fichier = path.join(DIR, `m${m}.js`);
  const src = fs.readFileSync(fichier, 'utf8');
  let res;
  try {
    res = transformer(src, m);
  } catch (e) {
    console.error(`✗ m${m}.js : ${e.message}`);
    process.exit(1);
  }
  if (!DRY) fs.writeFileSync(fichier, res.texte);
  total += res.quetes;
  totalHint += res.fetchHintAjoute;
  console.log(`${DRY ? 'vérifié' : 'écrit   '} m${m}.js — ${res.quetes} quêtes, ${res.fetchHintAjoute} fetchHint`);
}

console.log(`\n${total} quêtes, ${totalHint} fetchHint ${DRY ? 'vérifiés' : 'ajoutés'}`);
if (total !== totalHint) {
  console.error('⚠️  le nombre de fetchHint ne correspond pas au nombre de quêtes');
  process.exit(1);
}
