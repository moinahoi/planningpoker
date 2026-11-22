# Build once on the native platform: the output is static files for every architecture
FROM --platform=$BUILDPLATFORM node:26.13.1-alpine3.24 AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Release version shown in the app (falls back to package.json)
ARG APP_VERSION
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# The nginx config is picked at container start via DEPLOYMENT_ENV (localhost | production),
# so one image works for docker compose and Coolify.
COPY nginx.*.conf /etc/nginx/conf-available/
COPY --chmod=755 select-nginx-conf.sh /docker-entrypoint.d/40-select-nginx-conf.sh
ENV DEPLOYMENT_ENV=localhost

EXPOSE 80
