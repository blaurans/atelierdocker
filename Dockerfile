# syntax=docker/dockerfile:1
#
# Image du portail « Docker Ops Race ».
#
# Un seul étage : le portail n'a aucune dépendance native à compiler (la base
# utilise `node:sqlite`, le module natif de Node). L'image est donc entièrement
# reproductible avec `docker build` sur n'importe quelle machine disposant de
# Docker, sans toolchain C++ ni réseau autre que npm.

FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8000 \
    HOST=0.0.0.0 \
    DB_FILE=/data/arena.sqlite

# tini assure la transmission correcte de SIGTERM : le arrêt du conteneur ne
# doit pas laisser la base SQLite dans un état de recovery.
RUN apk add --no-cache tini \
 && addgroup -g 10001 arena \
 && adduser -D -u 10001 -G arena arena

WORKDIR /app

# Les dépendances sont installées avant le code : tant que package.json ne
# change pas, cette couche est réutilisée d'un build à l'autre.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY src ./src
COPY public ./public
COPY content ./content

RUN mkdir -p /data && chown -R arena:arena /data /app

USER arena
EXPOSE 8000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]