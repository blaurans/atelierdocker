/**
 * Attribution des secrets d'arène.
 *
 * Le cahier des charges d'origine affichait le mot de passe dans l'énoncé
 * (et le faisait même taper dans la commande : `docker run busybox echo
 * "FLAG{...}"`). C'était circulaire : rien de ce que l'étudiant pouvait faire
 * ne distinguishait le travail réellement effectué d'un copier-coller.
 *
 * Ici, le mot de passe **n'apparaît nulle part dans le contenu pédagogique**.
 * Il est servi par `/api/secret/:questId` et chaque mission indique la
 * commande qui va le chercher — la technique même que le module enseigne :
 *
 *   module 1 → cat d'un fichier système dans un conteneur
 *   module 2 → la sortie d'un `docker run`
 *   module 3 → `docker exec` / `docker cp` dans un conteneur en marche
 *   module 4 → la réponse HTTP d'un port publié
 *   module 5 → la sortie d'un conteneur construit par vos soins
 *   module 6 → un volume relu par un second conteneur
 *   module 7 → les journaux de la pile Compose
 *
 * Le secret est dérivé du jeton du joueur : deux équipes n'ont donc jamais le
 * même mot de passe, et le partager entre élèves ne prouve rien.
 */

import crypto from 'node:crypto';

/**
 * Dérive le secret d'une mission pour un joueur donné.
 *
 * Déterministe (rejouable), unique par couple joueur × mission, et non
 * devinable : il faut connaître le jeton, que le serveur n'expose qu'à son
 * titulaire. On ne peut pas non plus le deviner à partir du contenu des
 * quêtes, puisqu'il n'y figure pas.
 */
export function secretFor(player, quest) {
  const graine = `${player.token}:${quest.id}:${salt()}`;
  const hmac = crypto.createHmac('sha256', graine).update('arena').digest('hex');
  return `FLAG{${hmac.slice(0, 20).toUpperCase()}}`;
}

/**
 * Sel du déploiement. Sans lui, deux joueurs distintas déduiraient le même
 * secret à partir de quêtes identiques. Regenerable sans casse : cela invalide
 * les secrets déjà distribués, ce qui est le comportement voulu après un
 * reset.
 */
const SEL = process.env.ARENA_SALT ?? 'atelier-docker-v2';
const salt = () => SEL;

/** Sépare les secrets par module pour un diagnostic lisible. */
export const secretShape = (player, quest) => secretFor(player, quest);
