# Una sola imagen para los servicios del backend (agente y MCP de TMDB; el de
# libros se agrega igual). Cada contenedor elige su proceso con SERVICE; asi se compila
# y se versiona una vez, y los tres despliegues usan exactamente el mismo codigo.
#
#   docker build -t agichat .
#   docker run -e SERVICE=mcp-tmdb -e TMDB_ACCESS_TOKEN=... agichat

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages ./packages
COPY apps ./apps
COPY tsconfig.base.json tsconfig.json ./
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@agichat/agent-server..." --filter "@agichat/mcp-tmdb..." run build
# Se queda solo con lo necesario para ejecutar: sin devDependencies ni fuentes.
RUN pnpm deploy --filter @agichat/agent-server --prod --legacy /out/agent-server \
 && pnpm deploy --filter @agichat/mcp-tmdb --prod --legacy /out/mcp-tmdb

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /srv
COPY --from=build /out ./
# El proceso no corre como root dentro del contenedor.
USER node
ENV SERVICE=agent-server
CMD ["sh", "-c", "exec node \"/srv/$SERVICE/dist/cli.js\""]
