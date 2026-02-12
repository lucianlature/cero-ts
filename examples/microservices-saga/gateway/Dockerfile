# -------------------------------------------------------------------
# Gateway Dockerfile — multi-stage build
# Build context: cero-ts repo root (set in docker-compose.yml)
# -------------------------------------------------------------------

# Stage 1: Build cero-ts library
FROM node:24-alpine AS cero-build
WORKDIR /lib/cero-ts
COPY package.json package-lock.json tsup.config.ts tsconfig.json ./
COPY src/ src/
RUN npm ci --ignore-scripts && npx tsup

# Stage 2: Build React dashboard
FROM node:24-alpine AS dashboard-build
WORKDIR /dashboard
COPY examples/microservices-saga/dashboard/package.json ./
RUN npm install
COPY examples/microservices-saga/dashboard/ ./
RUN npx vite build

# Stage 3: Install workspace dependencies
FROM node:24-alpine AS deps
WORKDIR /app
COPY --from=cero-build /lib/cero-ts/package.json /lib/cero-ts/package.json
COPY --from=cero-build /lib/cero-ts/dist /lib/cero-ts/dist

# Copy workspace package files for npm install
COPY examples/microservices-saga/package.json ./
COPY examples/microservices-saga/shared/package.json shared/
COPY examples/microservices-saga/gateway/package.json gateway/
COPY examples/microservices-saga/payment/package.json payment/
COPY examples/microservices-saga/inventory/package.json inventory/
COPY examples/microservices-saga/shipping/package.json shipping/
COPY examples/microservices-saga/dashboard/package.json dashboard/

# Rewrite cero-ts path for container context
RUN sed -i 's|"file:../.."|"file:/lib/cero-ts"|g' package.json
RUN npm install --ignore-scripts

# Stage 4: Runtime
FROM node:24-alpine
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=deps /lib/cero-ts /lib/cero-ts

# Copy source (tsx runs from TypeScript directly)
COPY examples/microservices-saga/shared/ shared/
COPY examples/microservices-saga/gateway/ gateway/

# Copy pre-built dashboard static files
COPY --from=dashboard-build /dashboard/dist dashboard/dist/

ENV NODE_ENV=production
ENV DATA_DIR=/data
EXPOSE 3000

CMD ["npx", "tsx", "gateway/src/main.ts"]
