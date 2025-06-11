# 多架构支持
ARG BUILD_FROM
FROM $BUILD_FROM

# 设置环境变量
ENV \
  S6_BEHAVIOUR_IF_STAGE2_FAILS=2 \
  S6_CMD_WAIT_FOR_SERVICES=1

# 安装Node.js和npm，使用国内镜像加速
RUN \
  apk add --no-cache \
  nodejs \
  npm \
  curl \
  ca-certificates \
  && npm config set registry https://registry.npmmirror.com \
  && npm config set disturl https://npmmirror.com/dist \
  && npm config set electron_mirror https://npmmirror.com/mirrors/electron/ \
  && npm config set sass_binary_site https://npmmirror.com/mirrors/node-sass/ \
  && npm config set phantomjs_cdnurl https://npmmirror.com/mirrors/phantomjs/

# 创建应用目录
WORKDIR /opt/tunnel-proxy

# 复制应用文件
COPY rootfs /

# 安装依赖
WORKDIR /opt/tunnel-proxy
RUN npm install --only=production --no-audit --no-fund

# 设置执行权限
RUN chmod a+x /etc/services.d/tunnel-proxy/run \
  && chmod a+x /etc/services.d/tunnel-proxy/finish

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
