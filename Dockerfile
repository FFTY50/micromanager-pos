FROM node:20-bullseye

RUN apt-get update && apt-get install -y --no-install-recommends \
    tzdata \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production \
    SERIAL_BAUD=9600 \
    POS_TYPE=verifone_commander \
    POST_LINES_AS_BATCH=true

CMD ["node", "src/index.js"]
