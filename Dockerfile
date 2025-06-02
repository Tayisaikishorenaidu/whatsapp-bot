FROM node:18-slim

# Set environment variables early
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV CHROME_NO_SANDBOX=true
ENV NODE_ENV=production

# Update package lists and install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Add Google Chrome repository and install Chrome
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Verify Chrome installation
RUN google-chrome-stable --version

# Set working directory
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p \
    /app/.wwebjs_auth \
    /app/data \
    /app/public/media/images \
    /app/public/media/video \
    /tmp/chrome-user-data \
    /tmp/chrome-data \
    /tmp/chrome-cache \
    /tmp/chrome-sessions \
    && chmod -R 755 /app \
    && chmod -R 777 /tmp/chrome-user-data /tmp/chrome-data /tmp/chrome-cache /tmp/chrome-sessions

# Create non-root user for security
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app \
    && chown -R pptruser:pptruser /tmp/chrome-user-data \
    && chown -R pptruser:pptruser /tmp/chrome-data \
    && chown -R pptruser:pptruser /tmp/chrome-cache \
    && chown -R pptruser:pptruser /tmp/chrome-sessions

# Create entrypoint script to handle Chrome cleanup and startup
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
echo "🐳 Starting WhatsApp Bot in Docker..."\n\
\n\
# Kill any existing Chrome processes\n\
echo "🧹 Cleaning up existing Chrome processes..."\n\
pkill -f chrome 2>/dev/null || true\n\
pkill -f chromium 2>/dev/null || true\n\
\n\
# Clean up Chrome data directories\n\
echo "🧹 Cleaning up Chrome data directories..."\n\
rm -rf /tmp/chrome-user-data/* 2>/dev/null || true\n\
rm -rf /tmp/chrome-data/* 2>/dev/null || true\n\
rm -rf /tmp/chrome-cache/* 2>/dev/null || true\n\
rm -rf /tmp/chrome-sessions/* 2>/dev/null || true\n\
rm -rf /tmp/.com.google.Chrome* 2>/dev/null || true\n\
rm -rf /tmp/.org.chromium* 2>/dev/null || true\n\
\n\
# Create fresh directories\n\
mkdir -p /tmp/chrome-user-data /tmp/chrome-data /tmp/chrome-cache /tmp/chrome-sessions\n\
chmod 777 /tmp/chrome-user-data /tmp/chrome-data /tmp/chrome-cache /tmp/chrome-sessions\n\
\n\
# Set Chrome environment variables\n\
export CHROME_DEVEL_SANDBOX=/usr/lib/chromium-browser/chrome-sandbox\n\
export CHROME_NO_SANDBOX=true\n\
export DISPLAY=:99\n\
\n\
echo "✅ Environment prepared, starting application..."\n\
\n\
# Execute the main command\n\
exec "$@"' > /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh

# Create cleanup script for graceful shutdown
RUN echo '#!/bin/bash\n\
echo "🛑 Shutting down gracefully..."\n\
pkill -f chrome 2>/dev/null || true\n\
pkill -f node 2>/dev/null || true\n\
rm -rf /tmp/chrome-user-data/* 2>/dev/null || true\n\
rm -rf /tmp/chrome-data/* 2>/dev/null || true\n\
rm -rf /tmp/chrome-cache/* 2>/dev/null || true\n\
echo "✅ Cleanup completed"' > /usr/local/bin/cleanup.sh \
    && chmod +x /usr/local/bin/cleanup.sh

# Switch to non-root user
USER pptruser

# Set additional environment variables for the application
ENV MALLOC_ARENA_MAX=2
ENV NODE_MAX_OLD_SPACE_SIZE=1024
ENV PUPPETEER_DISABLE_SETUID_SANDBOX=true
ENV DISPLAY=:99

# Expose port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Add labels for better organization
LABEL maintainer="WhatsApp Bot Team"
LABEL description="WhatsApp Bot with Smart Replies for Railway"
LABEL version="1.0"

# Use entrypoint script and start the application
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["npm", "start"]

# Add signal handlers for graceful shutdown
STOPSIGNAL SIGTERM