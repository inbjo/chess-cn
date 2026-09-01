# syntax=docker/dockerfile:1.7

ARG RUST_IMAGE=rust:1.98.0-bookworm
ARG RUNTIME_IMAGE=debian:bookworm-slim

FROM --platform=$TARGETPLATFORM ${RUST_IMAGE} AS builder

ARG TARGETARCH
ARG PIKAFISH_TAG=Pikafish-2026-01-02
ARG PIKAFISH_RELEASE_FILE=Pikafish.2026-01-02.7z
ARG PIKAFISH_RELEASE_SHA256=84257063905615919fb4ee6a70273a94843bb6ec04c45e3ac706098838bc1a49
ARG PIKAFISH_SOURCE_SHA256=d1482fb903c0b757f8c8cc09c5d057e27f0a8b17934715faf2c58797dd999493
ARG GITHUB_PROXY=https://sina.dev/

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates curl g++ make p7zip-full \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build/chess-cn
COPY . .

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/chess-cn/target \
    cargo build --release --locked \
    && install -Dm755 target/release/chess-cn-server /out/chess-cn-server

RUN set -eux; \
    if [ "$GITHUB_PROXY" = "direct" ]; then GITHUB_PROXY=; fi; \
    curl --fail --location --retry 3 \
        "${GITHUB_PROXY}https://github.com/official-pikafish/Pikafish/archive/refs/tags/${PIKAFISH_TAG}.tar.gz" \
        --output /tmp/pikafish-source.tar.gz; \
    echo "${PIKAFISH_SOURCE_SHA256}  /tmp/pikafish-source.tar.gz" | sha256sum --check; \
    mkdir -p /tmp/pikafish-source; \
    tar -xzf /tmp/pikafish-source.tar.gz -C /tmp/pikafish-source --strip-components=1; \
    curl --fail --location --retry 3 \
        "${GITHUB_PROXY}https://github.com/official-pikafish/Pikafish/releases/download/${PIKAFISH_TAG}/${PIKAFISH_RELEASE_FILE}" \
        --output "/tmp/${PIKAFISH_RELEASE_FILE}"; \
    echo "${PIKAFISH_RELEASE_SHA256}  /tmp/${PIKAFISH_RELEASE_FILE}" | sha256sum --check; \
    mkdir -p /tmp/pikafish-release /out/pikafish /out/licenses/pikafish; \
    7z x -y "/tmp/${PIKAFISH_RELEASE_FILE}" -o/tmp/pikafish-release >/dev/null; \
    cp /tmp/pikafish-release/pikafish.nnue /out/pikafish/pikafish.nnue; \
    if [ "$TARGETARCH" = "amd64" ]; then \
        cp /tmp/pikafish-release/Linux/pikafish-sse41-popcnt /out/pikafish/pikafish; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
        cp /tmp/pikafish-release/pikafish.nnue /tmp/pikafish-source/src/pikafish.nnue; \
        make -C /tmp/pikafish-source/src -j2 build ARCH=armv8 COMP=gcc; \
        cp /tmp/pikafish-source/src/pikafish /out/pikafish/pikafish; \
    else \
        echo "不支持的 Docker 目标架构: $TARGETARCH" >&2; \
        exit 1; \
    fi; \
    chmod 0555 /out/pikafish/pikafish; \
    chmod 0444 /out/pikafish/pikafish.nnue; \
    cp /tmp/pikafish-release/AUTHORS /out/licenses/pikafish/; \
    cp /tmp/pikafish-release/Copying.txt /out/licenses/pikafish/; \
    cp /tmp/pikafish-release/NNUE-License.md /out/licenses/pikafish/; \
    cp third_party/pikafish/SOURCE.md /out/licenses/pikafish/; \
    cp /tmp/pikafish-source.tar.gz \
        "/out/licenses/pikafish/Pikafish-${PIKAFISH_TAG}-source.tar.gz"; \
    mkdir -p /out/licenses/chess-cn; \
    cp LICENSE DISTRIBUTION-NOTICE.md /out/licenses/chess-cn/; \
    cp LICENSES/MIT-tsonglew.txt /out/licenses/chess-cn/; \
    cp assets/godogpaw-LICENSE.txt assets/wasm_exec-LICENSE.txt /out/licenses/chess-cn/; \
    cp vendor/three/LICENSE /out/licenses/chess-cn/Three.js-LICENSE.txt

FROM ${RUNTIME_IMAGE} AS runtime

LABEL org.opencontainers.image.title="楚河漢界 · 3D 中国象棋" \
      org.opencontainers.image.description="Embedded 3D frontend with godogpaw WASM and Pikafish NNUE" \
      org.opencontainers.image.source="https://github.com/inbjo/chess-cn" \
      org.opencontainers.image.licenses="GPL-3.0-or-later AND LicenseRef-Pikafish-NNUE"

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates curl libatomic1 libgomp1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 chess-cn \
    && useradd --uid 10001 --gid chess-cn --no-create-home --home-dir /tmp --shell /usr/sbin/nologin chess-cn

WORKDIR /opt/chess-cn
COPY --from=builder --chown=10001:10001 /out/chess-cn-server ./chess-cn-server
COPY --from=builder --chown=10001:10001 /out/pikafish ./pikafish
COPY --from=builder --chown=10001:10001 /out/licenses /usr/share/licenses/chess-cn

ENV CHESS_BIND=0.0.0.0:8000 \
    PIKAFISH_PATH=/opt/chess-cn/pikafish/pikafish \
    PIKAFISH_NNUE=/opt/chess-cn/pikafish/pikafish.nnue \
    HOME=/tmp

USER 10001:10001
EXPOSE 8000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:8000/api/health >/dev/null || exit 1
ENTRYPOINT ["/opt/chess-cn/chess-cn-server"]
