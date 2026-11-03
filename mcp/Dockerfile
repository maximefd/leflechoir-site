# Le connecteur MCP de l'API ouverte (ADR 0032) : un petit service Node, sans lexique, qui appelle l'API
FROM node:22-slim AS construction
WORKDIR /mcp
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /mcp
COPY --from=construction /mcp/package.json ./
COPY --from=construction /mcp/node_modules ./node_modules
COPY --from=construction /mcp/dist ./dist
# Un utilisateur sans droits : une faille exploitée ne donne pas root dans le conteneur
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
