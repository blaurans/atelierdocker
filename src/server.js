import path from 'node:path';
import express from 'express';
import { config, ROOT } from './config.js';
import { db, log, clock } from './db.js';
import { api } from './routes/api.js';
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

  app.use('/api', api);

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
    if (status >= 500) console.error('[erreur]', err);
    res.status(status).json({
      status: 'error',
      error: status >= 500 ? 'Erreur interne du serveur.' : err.message,
      ...(err.extra ?? {}),
    });
  });

  return app;
}

export function start() {
  const pack = quests();
  log('──────────────────────────────────────────────');
  log('🐳  Atelier Docker');
  log(`📚  ${pack.modules.length} ateliers · ${pack.totalQuests} quêtes`);
  log(`🗄️   ${config.dbFile}`);
  log(`🔑  administration : ${config.adminKey ? 'protégée par clé' : 'ouverte (défaut lab)'}`);
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