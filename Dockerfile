# Use Node.js LTS as base image
FROM node:20-slim

# Install system dependencies needed for Electron and native modules
# Also include Git and useful development tools
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    curl \
    ca-certificates \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libxss1 \
    libgtk-3-0 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI (Claude Code)
RUN npm install -g @anthropic-ai/claude-code

# Set working directory
WORKDIR /workspace

# Copy package files first for better caching
COPY package*.json ./

# Copy the entire project
COPY . .

# Install dependencies (if package.json exists)
RUN if [ -f package.json ]; then npm install; fi

# Set environment variable for headless Electron
ENV DISPLAY=:99
ENV ELECTRON_DISABLE_SANDBOX=1

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/run-claude-loop.sh
RUN chmod +x /usr/local/bin/run-claude-loop.sh

# Default command - runs the Claude loop
CMD ["/usr/local/bin/run-claude-loop.sh"]
