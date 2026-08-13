# ════════════════════════════════════════════════════════════════════════════
#  AutoCross-Edu — Production Multi-stage Dockerfile
#  Stage 1: Build Vite frontend + Bundled Node backend API server
#  Stage 2: Run Node 20 + Nginx reverse proxy on port 80
# ════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit --no-fund

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_RESEND_API_KEY
ARG VITE_RESEND_FROM_EMAIL=noreply@anurag.edu.in

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_RESEND_API_KEY=$VITE_RESEND_API_KEY
ENV VITE_RESEND_FROM_EMAIL=$VITE_RESEND_FROM_EMAIL

# Compiles dist/ (Vite) and dist-server/server.js (Node backend)
RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM node:20-alpine AS serve

RUN apk add --no-cache nginx wget

WORKDIR /app

# Copy compiled frontend and backend assets
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/dist-server /app/dist-server
COPY --from=build /app/nginx.conf /etc/nginx/http.d/default.conf

EXPOSE 80

# Create entrypoint script to run Node API server and Nginx
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'node /app/dist-server/server.js &' >> /app/entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]

