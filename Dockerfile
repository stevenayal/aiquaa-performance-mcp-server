FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
ARG JMETER_VERSION=5.6.3
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates openjdk-17-jre-headless && \
    curl --fail --location --silent --show-error "https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz" -o /tmp/jmeter.tgz && \
    tar -xzf /tmp/jmeter.tgz -C /opt && rm /tmp/jmeter.tgz && rm -rf /var/lib/apt/lists/*
ENV JMETER_HOME=/opt/apache-jmeter-${JMETER_VERSION} PATH=/opt/apache-jmeter-${JMETER_VERSION}/bin:$PATH NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER 10001
EXPOSE 3000
CMD ["node", "dist/server.js"]
