import path from 'node:path';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { config, ROOT } from './config.js';
import { HttpError } from './auth.js';
import { db, log, clock } from './db.js';
import { api } from './routes/api.js';
import { atelier } from './routes/atelier.js';
import { admin } from './routes/admin.js';
import { quests } from './questpack.js';
import { counts } from './repo/arena.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // `trust proxy` n'est activé que si un reverse proxy renseigne réellement
  // les en-têtes. Sinon, se fier à `X-Forwarded-For` permettrait de contourner les
  // plafonds de débit en forgeant une IP.
  if (['1', 'true', 'yes', 'on'].includes(String(process.env.TRUST_PROXY ?? '').toLowerCase())) {
    app.set('trust proxy', true);
  }

  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  // Journalisation courte, une ligne par requête, comme le portail du PDF
  // mais sans le bruit des assets statiques.
  app.use((req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api') || req.path === '/healthz') {
        log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - t0} ms)`);
      }
    });
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, uptime: Math.round(process.uptime()), ...counts() });
  });

  // L'administration, **avant** `api`. `/api/overview` et `/api/stats` y vivent
  // aussi, et doivent rester derrière le mot de passe : si `api` était montée
  // d'abord, elle ne les aurait pas — mais l'inverse laisse `api` définir des
  // routes qui ne sont plus là, et personne ne le verrait.
  app.use('/api', admin);
  app.use('/api', atelier);
  app.use('/api', api);

  // La page d'administration, à la racine : `/admin`, pas `/api/admin`.
  //
  // Elle est servie **sans** mot de passe, et c'est délibéré : la page *est* le
  // formulaire. La mettre derrière le garde-fouingerait un enseignant qui met
  // l'adresse en favori d'y voir du JSON `{"error":"…"}` au lieu du champ à
  // remplir. Ce qui est protégé, c'est ce qu'elle affiche — la classe, les IP,
  // les actions — et tout cela part par l'API, qui est fermée.
  app.get('/admin', (_req, res, next) => {
    // Jamais en cache : la page porte l'état d'administration, et un cache
    // d'intermédiaire la montrerait après expiration de la session.
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(config.publicDir, 'admin.html'), (err) => {
      if (err) next(err);
    });
  });

  // Portail et client. Les assets sont servis en dernier pour ne jamais
  // shadower /api.
  app.use(express.static(config.publicDir, {
    index: 'index.html',
    maxAge: process.env.NODE_ENV === 'production' ? '5m' : 0,
    etag: true,
  }));

  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    // Toute page inconnue retombe sur le portail : le client sait se router.
    res.sendFile(path.join(config.publicDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });

  app.use((req, res) => {
    res.status(404).json({ status: 'error', error: 'Route inconnue.' });
  });

  // eslint-disable-next-line no-unused-vars -- signature à 4 args requise par Express
  app.use((err, _req, res, _next) => {
    const status = err.status ?? 500;
    // Ce qui décide du message n'est pas le code, c'est l'**origine** de
    // l'erreur. Un `HttpError` est levé volontairement, avec un message écrit
    // pour être lu par quelqu'un : « aucun mot de passe n'est configuré
    // (ADMIN_KEY) » est exactement l'information qui débloque la situation, et
    // le cacher ne protégeait rien — l'erreur était déjà dans le journal.
    //
    // Tout le reste est un bug, et un bug ne doit rien divulguer : message
    // générique, trace complète côté serveur.
    const message = err instanceof HttpError || status < 500
      ? err.message
      : 'Erreur interne du serveur.';
    if (status >= 500) console.error('[erreur]', err);
    res.status(status).json({ status: 'error', error: message, ...(err.extra ?? {}) });
  });

  return app;
}

/**
 * Vérifie qu'un mot de passe d'administration est configuré.
 *
 * Avant, une clé vide signifiait « lab ouvert » : toutes les routes
 * d'administration répondaient, y compris `POST /api/admin/delete/:pseudo`.
 * C'était acceptable sur un poste, pas sur `https://…` — là, une clé vide
 * publiait toutes les suppressions de données à quiconque tombe sur l'adresse.
 *
 * Refuser de démarrer est plus sain que démarrer ouvert : le conteneur boucle,
 * le healthcheck échoue, et le déploiement ne se termine jamais « vert » avec une
 * administration ouverte. On le voit tout de suite, et on ne l'oublie pas.
 */
export function verifierAdmin() {
  if (config.adminKey) return true;
  const aide = [
    '',
    '  ✗ ADMIN_KEY est vide — le serveur ne démarre pas.',
    '',
    "    La V2 a supprimé le « lab ouvert » : une clé d'administration vide",
    "    laissait quiconque trouver l'adresse supprimer des inscriptions et lire",
    '    la liste de la classe avec les IP des postes.',
    '',
    '    Poser le mot de passe dans le .env, à côté du reste :',
    '',
    '      ATELIER_ADMIN_KEY=' + genererMotDePasse(),
    '',
    "    (openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)",
    '',
  ].join('\n');
  console.error(aide);
  return false;
}

/** Un mot de passe proposé, pour ne pas avoir à en inventer un. */
export function genererMotDePasse() {
  return randomBytes(18).toString('base64url').slice(0, 24);
}

export function start() {
  if (!verifierAdmin()) {
    console.error('  Démarrage annulé.\n');
    process.exit(1);
  }

  const pack = quests();
  log('──────────────────────────────────────────────');
  log('🐳  Atelier Docker');
  log(`📚  ${pack.modules.length} ateliers · ${pack.totalQuests} quêtes`);
  log(`🗄️   ${config.dbFile}`);
  log('🔑  administration : derrière un mot de passe, sur /admin');
  log('──────────────────────────────────────────────');

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    log(`▶️  http://${config.host}:${config.port}`);
  });

  const shutdown = (signal) => {
    log(`${signal} reçu, arrêt…`);
    server.close(() => {
      try { db.close(); } catch { /* déjà fermée */ }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) start();

export { config, clock, ROOT };