# dev build
FROM ghcr.io/immich-app/base-server-dev:202503251114@sha256:10e8973e8603c5729436d0f8ca32e7794375d9d1e428d65725eb03979b60c891 AS dev

RUN apt-get install --no-install-recommends -yqq tini
WORKDIR /usr/src/app
COPY server/package.json server/package-lock.json ./
COPY server/patches ./patches
RUN npm ci && \
  # exiftool-vendored.pl, sharp-linux-x64 and sharp-linux-arm64 are the only ones we need
  # they're marked as optional dependencies, so we need to copy them manually after pruning
  rm -rf node_modules/@img/sharp-libvips* && \
  rm -rf node_modules/@img/sharp-linuxmusl-x64
ENV PATH="${PATH}:/usr/src/app/bin" \
  IMMICH_ENV=development \
  NVIDIA_DRIVER_CAPABILITIES=all \
  NVIDIA_VISIBLE_DEVICES=all
ENTRYPOINT ["tini", "--", "/bin/sh"]


FROM dev AS prod

COPY server .
RUN npm run build
RUN npm prune --omit=dev --omit=optional
COPY --from=dev /usr/src/app/node_modules/@img ./node_modules/@img
COPY --from=dev /usr/src/app/node_modules/exiftool-vendored.pl ./node_modules/exiftool-vendored.pl

# web build
FROM node:22.14.0-alpine3.20@sha256:40be979442621049f40b1d51a26b55e281246b5de4e5f51a18da7beb6e17e3f9 AS web

WORKDIR /usr/src/open-api/typescript-sdk
COPY open-api/typescript-sdk/package*.json open-api/typescript-sdk/tsconfig*.json ./
RUN npm ci
COPY open-api/typescript-sdk/ ./
RUN npm run build

WORKDIR /usr/src/app
COPY web/package*.json web/svelte.config.js ./
RUN npm ci
COPY web ./
COPY i18n ../i18n
RUN npm run build


# prod build
FROM ghcr.io/immich-app/base-server-prod:202503251114@sha256:783ee44f64e16301cd27eb2fad0b3b5b5ea4e56dd9b30adb96c97286f031ad26

WORKDIR /usr/src/app
ENV NODE_ENV=production \
  NVIDIA_DRIVER_CAPABILITIES=all \
  NVIDIA_VISIBLE_DEVICES=all
COPY --from=prod /usr/src/app/node_modules ./node_modules
COPY --from=prod /usr/src/app/dist ./dist
COPY --from=prod /usr/src/app/bin ./bin
COPY --from=web /usr/src/app/build /build/www
COPY server/resources resources
COPY server/package.json server/package-lock.json ./
COPY server/start*.sh ./
COPY "docker/scripts/get-cpus.sh" ./
RUN npm install -g @immich/cli && npm cache clean --force
COPY LICENSE /licenses/LICENSE.txt
COPY LICENSE /LICENSE
ENV PATH="${PATH}:/usr/src/app/bin"

ARG BUILD_ID
ARG BUILD_IMAGE
ARG BUILD_SOURCE_REF
ARG BUILD_SOURCE_COMMIT

ENV IMMICH_BUILD=${BUILD_ID}
ENV IMMICH_BUILD_URL=https://github.com/immich-app/immich/actions/runs/${BUILD_ID}
ENV IMMICH_BUILD_IMAGE=${BUILD_IMAGE}
ENV IMMICH_BUILD_IMAGE_URL=https://github.com/immich-app/immich/pkgs/container/immich-server
ENV IMMICH_REPOSITORY=immich-app/immich
ENV IMMICH_REPOSITORY_URL=https://github.com/immich-app/immich
ENV IMMICH_SOURCE_REF=${BUILD_SOURCE_REF}
ENV IMMICH_SOURCE_COMMIT=${BUILD_SOURCE_COMMIT}
ENV IMMICH_SOURCE_URL=https://github.com/immich-app/immich/commit/${BUILD_SOURCE_COMMIT}

VOLUME /usr/src/app/upload
EXPOSE 2283
ENTRYPOINT ["tini", "--", "/bin/bash"]
CMD ["start.sh"]

HEALTHCHECK CMD immich-healthcheck
