# Build für Self-Hosting (Coolify). Vercel ignoriert diese Datei.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall führt "prisma generate" aus und braucht Schema + Config
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/app/generated ./app/generated
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Bewusst ohne "prisma db push" (anders als npm run build): Schema-Änderungen
# werden separat mit "npx prisma db push" eingespielt, nicht bei jedem Deploy.
RUN npx next build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
