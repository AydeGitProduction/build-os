FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Install TypeScript for compilation
RUN npm install typescript ts-node @types/node --save-dev

# Build TypeScript
RUN npx tsc

# Remove dev dependencies
RUN npm prune --omit=dev

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
