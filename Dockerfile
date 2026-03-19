FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PROTOCOL_HEADER=x-forwarded-proto
ENV HOST_HEADER=x-forwarded-host
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/drizzle ./drizzle
RUN npm ci --omit=dev
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s CMD wget -qO- http://localhost:3000/health || exit 1
EXPOSE 3000
CMD ["node", "build"]
