#!/bin/bash

# Render build script to install Chrome and dependencies
echo "📦 Installing Chrome and dependencies..."

# Update package lists
apt-get update

# Install wget and gnupg
apt-get install -y wget gnupg

# Add Google Chrome repository
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'

# Update package lists again
apt-get update

# Install Google Chrome and dependencies
apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 --no-install-recommends

# Install Node.js dependencies
npm install

echo "✅ Chrome installation completed!"
echo "Chrome location: $(which google-chrome-stable)"