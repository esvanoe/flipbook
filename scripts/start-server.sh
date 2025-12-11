#!/bin/bash
# Start BitM-NG server

set -e

cd "$(dirname "$0")/.."

# Check if .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    echo "Please create .env file with required configuration"
    exit 1
fi

# Check if built
if [ ! -d dist ]; then
    echo "Building project..."
    npm run build
fi

# Start server
echo "Starting BitM-NG server on port 58082..."
npm start

