# Zero Risk · render-html · Railway (S2-5 · CC2 · GO Lenovo 17-nov 02:47)
#
# La plantilla de marca (#1068) a PNG y a MP4 con un navegador sin pantalla.
#  · Node 22 + Chromium + ffmpeg del sistema (Debian bookworm);
#  · hyperframes en VERSIÓN FIJA (package.json + pnpm-lock.yaml);
#  · telemetría de hyperframes APAGADA aquí y otra vez al lanzar cada render (logica.ts · entornoDeHyperframes);
#  · modo que duerme (railway.json · sleepApplication): sin pedidos, el servidor no corre.

FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        ffmpeg \
        fonts-dejavu-core \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    HYPERFRAMES_NO_TELEMETRY=1 \
    DO_NOT_TRACK=1 \
    HYPERFRAMES_NO_UPDATE_CHECK=1 \
    HYPERFRAMES_SKIP_SKILLS=1 \
    HYPERFRAMES_CHROME_SANDBOX=0 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3000

# sin HEALTHCHECK de Docker: el chequeo es el de Railway al desplegar (railway.json · /salud); nada debe despertar al servidor por su cuenta

CMD ["pnpm", "start"]
