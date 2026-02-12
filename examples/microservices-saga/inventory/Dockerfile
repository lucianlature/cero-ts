# -------------------------------------------------------------------
# Inventory Service Dockerfile — multi-stage build
# Build context: cero-ts repo root
# -------------------------------------------------------------------

FROM node:24-alpine AS cero-build
WORKDIR /lib/cero-ts
COPY package.json package-lock.json tsup.config.ts tsconfig.json ./
COPY src/ src/
RUN npm ci --ignore-scripts && npx tsup

FROM node:24-alpine AS deps
WORKDIR /app
COPY --from=cero-build /lib/cero-ts/package.json /lib/cero-ts/package.json
COPY --from=cero-build /lib/cero-ts/dist /lib/cero-ts/dist

COPY examples/microservices-saga/package.json ./
COPY examples/microservices-saga/shared/package.json shared/
COPY examples/microservices-saga/gateway/package.json gateway/
COPY examples/microservices-saga/payment/package.json payment/
COPY examples/microservices-saga/inventory/package.json inventory/
COPY examples/microservices-saga/shipping/package.json shipping/

RUN sed -i 's|"file:../.."|"file:/lib/cero-ts"|g' package.json
RUN npm install --ignore-scripts

FROM node:24-alpine
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=deps /lib/cero-ts /lib/cero-ts

COPY examples/microservices-saga/shared/ shared/
COPY examples/microservices-saga/inventory/ inventory/

ENV NODE_ENV=production
ENV DATA_DIR=/data

CMD ["npx", "tsx", "inventory/src/main.ts"]
