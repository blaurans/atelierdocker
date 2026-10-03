import { EventEmitter } from 'node:events';

/**
 * Bus d'événements interne : toute écriture qui modifie le classement
 * publishes ici, et les clients SSE branchés sur `/api/live` reçoivent le
 * nouvel état sans polling. Le PDF rafraîchissait la page toutes les 4 s ;
 * ici le rafraîchissement est instantané et la page n'est jamais rechargée.
 */
export const bus = new EventEmitter();
bus.setMaxListeners(0);

export const ARENA_CHANGED = 'arena:changed';

export const announce = (reason) => bus.emit(ARENA_CHANGED, { reason, at: Date.now() });