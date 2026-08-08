FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY nest-cli.json tsconfig*.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

# Persistance fichier des notifications (NOTIFICATION_STORE_FILE,
# defaut: data/notifications.json) : le dossier doit etre accessible en
# ecriture par l'utilisateur node.
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node
EXPOSE 3005

CMD ["npm", "run", "start:prod"]
