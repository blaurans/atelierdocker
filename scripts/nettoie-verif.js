#!/usr/bin/env node
/**
 * Supprime les joueurs de vérification du portail.
 *
 * `check-fetchhints.js` supprime le sien, et il connaît le nom qu'il a tiré au
 * sort. Ce script est le filet : il attrape ce qu'une exécution interrompue a
 * laissé derrière elle. Les deux ont leur place : le script est précis et
 * gratuit ; celui-ci est exhaustif et rare, il ne tourne donc qu'après le job
 * de vérification.
 *
 *   ATELIER_ADMIN_KEY=… node scripts/nettoie-verif.js [https://…]
 *
 * Sans clé d'administration, il ne fait rien et le dit : c'est le cas en local,
 * où il n'y a rien à nettoyer.
 */
const B = process.argv[2] ?? 'https://atelierdocker.laurans.org';
const CLE = process.env.ATELIER_ADMIN_KEY ?? '';

const PREV = 'Verif_';

if (!CLE) {
  console.log(`Pas de ATELIER_ADMIN_KEY : rien à nettoyer sur ${B}.`);
  process.exit(0);
}

const lire = async (url, init) => {
  const r = await fetch(url, init);
  return r.ok ? r.json() : { __statut: r.status };
};

const entetes = { 'X-Arena-Admin': CLE };

// `/api/overview` est derrière le mot de passe depuis que l'administration est
// fermée. Sans l'en-tête, la vue de classe répond 401 — et le script
// interpretait ça comme « portail injoignable », ce qui envoie chercher du côté
// réseau pendant qu'il n'y a rien à voir. La distinction est faite ici.
const overview = await lire(`${B}/api/overview`, { headers: entetes });
if (overview.__statut === 401 || overview.__statut === 403) {
  console.error(`${B} refuse la clé d'administration (HTTP ${overview.__statut}).`
    + ' Vérifiez que ATELIER_ADMIN_KEY est bien celle du portail.');
  process.exit(1);
}
if (overview.__statut) {
  console.error(`Réponse inattendue du portail : HTTP ${overview.__statut} (${B})`);
  process.exit(1);
}

// On ne supprime que les joueurs dont le nom commence exactement par `Verif_`.
// Un filtre par préfixe large — « Verif » — attraperait un élève qui se serait
// appelé « Verif-exemple », et ce serait sa progression qui disparaîtrait.
const cibles = (overview.players ?? [])
  .map((p) => p.team)
  .filter((t) => t.startsWith(PREV) && t.length > PREV.length);

if (!cibles.length) {
  console.log(`Aucun joueur de vérification sur ${B}.`);
  process.exit(0);
}

for (const equipe of cibles) {
  const r = await fetch(`${B}/api/admin/delete/${encodeURIComponent(equipe)}`, {
    method: 'POST', headers: entetes,
  });
  console.log(r.ok ? `  supprimé ${equipe}` : `  ÉCHEC   ${equipe} (HTTP ${r.status})`);
}

const reste = (await lire(`${B}/api/overview`, { headers: entetes }))?.players ?? [];
const oublies = reste.filter((p) => p.team.startsWith(PREV));
console.log(`${cibles.length - oublies.length}/${cibles.length} supprimés.`);

// Un joueur de vérification qui survit à une clé valide est un problème de
// configuration, pas de script : il faut le savoir au lieu de le découvrir
// dans le menu de suivi au milieu d'un cours.
process.exit(oublies.length ? 1 : 0);
