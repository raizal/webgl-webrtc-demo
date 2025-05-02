FROM node:20-slim as build

WORKDIR /app

# Install pnpm and dependencies required for native module builds
RUN apt-get update && apt-get install -y \
    python3 make g++ git \
    && npm install -g pnpm@9.0.1 node-gyp node-pre-gyp

# Set build environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Copy source code (more efficient to do this once since we need to check for workspace config)
COPY . .

# Debug the file structure
RUN ls -la

# Install dependencies and build the React app
RUN cd react-video-player && \
    ls -la && \
    pnpm install --frozen-lockfile && \
    pnpm build

# Create public directory in backend if it doesn't exist
RUN mkdir -p backend/public

# Copy React build files to backend's public folder
RUN cp -r react-video-player/dist/* backend/public/ || (echo "Failed to copy frontend files" && exit 1)

# Verify backend package.json and determine start command
RUN cd backend && \
    echo "Backend package.json:" && \
    cat package.json | grep -E '"start"|"main"|"bin"' || echo "No specific start command found"

# Build the backend
RUN cd backend && \
    ls -la && \
    pnpm install --frozen-lockfile && \
    pnpm build && \
    ls -la dist

# Production stage
FROM node:20-slim as production

WORKDIR /app

# Install pnpm and other useful tools including runtime dependencies for wrtc
RUN apt-get update && apt-get install -y \
    bash curl ca-certificates python3 make g++ \
    && npm install -g pnpm@9.0.1 node-gyp node-pre-gyp

# Set runtime environment
ENV NODE_ENV=production
ENV PORT=3000
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Copy package files for production installation
COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built backend and frontend from build stage
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/public ./public

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 3000

# Use the entrypoint script to find and start the main file
ENTRYPOINT ["/entrypoint.sh"] 