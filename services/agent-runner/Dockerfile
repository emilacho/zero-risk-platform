# Zero Risk · agent-runner · Railway deployment
#
# Multi-stage build · Node 22 runtime + Python 3.11 + Pipeboard meta-ads-mcp
# (BSL 1.1 · `pipeboard-co/meta-ads-mcp` · spike validated 2026-05-18 ·
# vault `zr-vault/raw/qa/2026-05-18-pipeboard-mcp-spike-verdict.md`).
#
# Brazo 3 wire-in · agent-sdk-runner spawns `meta-ads-mcp` stdio MCP server
# when invoked for Meta-related agent slugs (media-buyer · paid_social ·
# instagram-curator · social-media-strategist · community-manager) ·
# auth via META_ACCESS_TOKEN env var (System User Token canonical).
#
# Migrated from RAILPACK auto-build to explicit Dockerfile so we can pin
# both Node + Python toolchains. Previous build command lived in
# railway.json (`pnpm install --frozen-lockfile=false`).

FROM node:22-bookworm-slim

# ─── System deps · Python 3.11 + pip + uv ─────────────────────────────
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Astral `uv` for fast Python tool installs (used by meta-ads-mcp).
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && mv /root/.local/bin/uv /usr/local/bin/uv

# ─── Pipeboard Meta Ads MCP · stdio server ────────────────────────────
# Pin to a known-good version · upgrade in a separate canon-update PR.
# `uv tool install` puts the `meta-ads-mcp` executable on PATH at
# /root/.local/bin/meta-ads-mcp which we promote to /usr/local/bin/.
RUN uv tool install meta-ads-mcp==1.0.104 \
    && ln -sf /root/.local/bin/meta-ads-mcp /usr/local/bin/meta-ads-mcp \
    && meta-ads-mcp --help > /dev/null 2>&1 || true

# ─── pnpm + Node deps ──────────────────────────────────────────────────
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile=false

# ─── Application source ────────────────────────────────────────────────
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

# Health check matches railway.json `/health` path.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3000/health || exit 1

CMD ["pnpm", "start"]
