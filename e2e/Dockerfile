# Playwright runner. Node pinned to the repo's .nvmrc (24.19.0); Chromium's Linux
# build + system deps are installed to match the resolved Playwright version, so
# screenshot baselines are stable and reproducible (generate baselines HERE, not
# on macOS). Multi-arch base — builds natively on Apple Silicon (arm64).
FROM node:24.19.0-bookworm

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

WORKDIR /e2e

# Install e2e deps first for layer caching. pnpm-workspace.yaml makes /e2e its
# own pnpm root (see that file); the lockfile pins versions.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Chromium + its Debian system libraries, pinned to the installed Playwright.
RUN pnpm exec playwright install --with-deps chromium

# Test sources (see .dockerignore for what's excluded).
COPY . .

# Default target is the deployed dev app (see playwright.config.ts). Override the
# command or PLAYWRIGHT_BASE_URL as needed.
CMD ["pnpm", "test"]
