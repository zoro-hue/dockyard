FROM node:18-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package.json package-lock.json* turbo.json ./
COPY packages/ ./packages/
COPY apps/builder/ ./apps/builder/

RUN npm install --legacy-peer-deps

RUN mkdir -p /app/downloads /app/builds /app/local-s3-bucket

ENV LOCAL_S3_DIR=/app/local-s3-bucket

CMD ["npx", "ts-node", "apps/builder/src/index.ts"]
