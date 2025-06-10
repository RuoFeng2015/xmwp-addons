ARG BUILD_FROM=ghcr.io/hassio-addons/base:15.0.1
FROM $BUILD_FROM

# 安装Node.js和npm
RUN \
  apk add --no-cache \
  nodejs=~18 \
  npm=~18 \
  && npm config set registry https://registry.npmmirror.com

# 设置工作目录
WORKDIR /opt/tunnel-proxy

# 复制应用文件
COPY rootfs /

# 安装npm依赖
COPY rootfs/opt/tunnel-proxy/package*.json ./
RUN npm ci --only=production

# 设置执行权限
RUN chmod a+x /etc/services.d/tunnel-proxy/run

# 构建参数
ARG BUILD_ARCH
ARG BUILD_DATE
ARG BUILD_DESCRIPTION
ARG BUILD_NAME
ARG BUILD_REF
ARG BUILD_REPOSITORY
ARG BUILD_VERSION

# 标签
LABEL \
  io.hass.name="${BUILD_NAME}" \
  io.hass.description="${BUILD_DESCRIPTION}" \
  io.hass.arch="${BUILD_ARCH}" \
  io.hass.type="addon" \
  io.hass.version=${BUILD_VERSION} \
  maintainer="ruofeng <ruofeng@126.com>" \
  org.opencontainers.image.title="${BUILD_NAME}" \
  org.opencontainers.image.description="${BUILD_DESCRIPTION}" \
  org.opencontainers.image.vendor="XMWP Addons" \
  org.opencontainers.image.authors="ruofeng <ruofeng@126.com>" \
  org.opencontainers.image.licenses="MIT" \
  org.opencontainers.image.url="https://github.com/RuoFeng2015/xmwp-addons" \
  org.opencontainers.image.source="https://github.com/RuoFeng2015/xmwp-addons" \
  org.opencontainers.image.documentation="https://github.com/RuoFeng2015/xmwp-addons/blob/main/tunnel-proxy/README.md" \
  org.opencontainers.image.created=${BUILD_DATE} \
  org.opencontainers.image.revision=${BUILD_REF} \
  org.opencontainers.image.version=${BUILD_VERSION}
