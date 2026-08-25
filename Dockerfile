FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends tar gzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
# Install devDependencies too — Tailwind's PostCSS plugin is required at build time.
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start:prod"]
