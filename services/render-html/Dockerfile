# Zero Risk · render-html · Railway (S2-5 · CC2 · GO Lenovo 17-nov 02:47)
#
# La plantilla de marca (#1068) a PNG y a MP4 con un navegador sin pantalla.
#  · Node 22 + Chromium + ffmpeg del sistema (Debian bookworm);
#  · hyperframes en VERSIÓN FIJA (package.json + pnpm-lock.yaml);
#  · telemetría de hyperframes APAGADA aquí y otra vez al lanzar cada render (logica.ts · entornoDeHyperframes);
#  · modo que duerme (railway.json · sleepApplication): sin pedidos, el servidor no corre.
#  · Sprint 3 · T5 (CC4): el transcriptor LOCAL (whisper.cpp, versión fija) y su modelo multilingüe (revisión y sha256 fijos, los mismos que fija
#    hyperframes 0.9.59) vienen HORNEADOS: al correr no se compila, no se instala y no se baja nada. Sin proveedores que cobren.

# ── etapa 1 · whisper.cpp + el modelo «small» (multilingüe: los «.en» traducen al inglés) ──
FROM node:22-bookworm-slim AS whisper
ARG WHISPER_TAG=v1.9.5
ARG WHISPER_MODEL_REV=5359861c739e955e79d9a303bcbc70fb988958b1
ARG WHISPER_MODEL_SHA256=1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b
RUN apt-get update \
    && apt-get install -y --no-install-recommends git cmake make g++ ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
# GGML_NATIVE=OFF: el binario no depende de las instrucciones del procesador donde se compila (Railway corre en otro)
RUN git clone --depth 1 --branch "${WHISPER_TAG}" https://github.com/ggml-org/whisper.cpp.git /src \
    && cmake -S /src -B /src/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF \
    && cmake --build /src/build --target whisper-cli -j"$(nproc)" \
    && install -D -m 0755 /src/build/bin/whisper-cli /out/whisper-cli
RUN mkdir -p /out/models \
    && curl -fsSL -o /out/models/ggml-small.bin "https://huggingface.co/ggerganov/whisper.cpp/resolve/${WHISPER_MODEL_REV}/ggml-small.bin" \
    && echo "${WHISPER_MODEL_SHA256}  /out/models/ggml-small.bin" | sha256sum -c -

# ── etapa 2 · el servicio ──
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
    HYPERFRAMES_WHISPER_PATH=/opt/whisper/whisper-cli \
    HYPERFRAMES_CACHE_DIR=/opt/hyperframes-cache \
    NODE_ENV=production

# T5 · el transcriptor y su modelo donde hyperframes los busca (HYPERFRAMES_WHISPER_PATH y <HYPERFRAMES_CACHE_DIR>/whisper/models)
COPY --from=whisper /out/whisper-cli /opt/whisper/whisper-cli
COPY --from=whisper /out/models/ggml-small.bin /opt/hyperframes-cache/whisper/models/ggml-small.bin

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3000

# sin HEALTHCHECK de Docker: el chequeo es el de Railway al desplegar (railway.json · /salud); nada debe despertar al servidor por su cuenta

CMD ["pnpm", "start"]
