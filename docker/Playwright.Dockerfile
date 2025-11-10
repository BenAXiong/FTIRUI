FROM mcr.microsoft.com/playwright:v1.46.0-jammy

WORKDIR /app

COPY package.json package-lock.json playwright.config.js vitest.config.js ./
COPY tests ./tests
COPY apps ./apps

RUN npm ci

CMD ["npm", "run", "test:smoke"]
