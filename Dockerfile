# ==============================================================================
# FASOBRIEF - Dockerfile Déploiement Souverain
# Sprint Technique Pré-Hackathon 226 - MTDPCE / DGTD (Édition 2026)
# ==============================================================================

FROM node:24-alpine

WORKDIR /app

# Installation des dépendances de production
COPY package*.json ./
RUN npm ci --omit=dev

# Copie des sources du serveur et du client
COPY . .

# Création du volume de données persistant
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/fasobrief.sqlite

CMD ["node", "server/server.js"]
