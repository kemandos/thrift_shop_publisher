# Build from the REPO ROOT (the server bundles packages/shared):
#   docker build -f server/Dockerfile -t thrift-server .
# docker-compose.yml in this folder does that for you (context: ..).
# Multi-arch base images: works on x86_64 and ARM64 (Oracle Ampere A1).

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @thrift/server... \
 && pnpm --filter @thrift/server test \
 && pnpm --filter @thrift/server build

FROM node:22-slim
ENV NODE_ENV=production PORT=8787 DATA_DIR=/app/data
WORKDIR /app
# The esbuild bundle is self-contained: no node_modules needed at runtime.
COPY --from=build /repo/server/dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8787
VOLUME ["/app/data"]
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
