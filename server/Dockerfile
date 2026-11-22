FROM node:26.13.1-alpine3.24

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# Release version reported by /health (falls back to package.json)
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION NODE_ENV=production

EXPOSE 8000
USER node
CMD ["node", "index.js"]
