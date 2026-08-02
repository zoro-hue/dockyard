FROM node:18-alpine

# Install git for cloning repos during build
RUN apk add --no-cache git

WORKDIR /app

# Copy builder package
COPY apps/builder/package.json ./

# Install dependencies
RUN npm install

# Copy source
COPY apps/builder/src/ ./src/
COPY apps/builder/tsconfig.json ./

# Create shared storage directories
RUN mkdir -p /app/downloads /app/builds

ENV LOCAL_S3_DIR=/app/local-s3-bucket
ENV REDIS_URL=redis://redis:6379

CMD ["npx", "ts-node", "src/index.ts"]
