FROM node:20-slim as base

# Set up common environment variables
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Install pnpm globally
RUN npm install -g pnpm@9.0.1 node-pre-gyp

# Build stage
FROM base as build

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 make g++ git \
    bash curl ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set build environment to development to include devDependencies
ENV NODE_ENV=development

# Copy package files first for better caching
COPY backend/package.json backend/pnpm-lock.yaml ./backend/
COPY react-video-player/package.json react-video-player/pnpm-lock.yaml ./react-video-player/

# Install backend dependencies
RUN cd backend && \
    npm install -g node-gyp node-pre-gyp && \
    pnpm install --frozen-lockfile

# Install frontend dependencies
RUN cd react-video-player && pnpm install --frozen-lockfile

# Copy source code
COPY backend ./backend
COPY react-video-player ./react-video-player

# Build backend
RUN cd backend && pnpm build

# Build frontend
RUN cd react-video-player && pnpm build

# Create public directory and copy frontend files
RUN mkdir -p backend/public && \
    cp -r react-video-player/dist/* backend/public/ || \
    (echo "Failed to copy frontend files" && exit 1)

# Production stage
FROM base as production

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    bash curl ca-certificates python3 make g++ \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g node-gyp node-pre-gyp

# Set runtime environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy production files from build stage
COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/public ./public

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 3000

# Use the entrypoint script to find and start the main file
ENTRYPOINT ["/entrypoint.sh"] 