#!/bin/bash
# setup-git-credentials.sh
# Helper script to configure git credentials for GitHub HTTPS

set -e

echo "=== Git Credential Setup for GitHub ==="
echo ""
echo "This script will help you configure git credentials for HTTPS pushes."
echo ""

# Check if credential helper is set
if ! git config --global credential.helper | grep -q store; then
    echo "Configuring credential helper..."
    git config --global credential.helper store
    echo "✓ Credential helper configured"
fi

echo ""
echo "To add your GitHub PAT (Personal Access Token), you have two options:"
echo ""
echo "Option 1: Manual entry (recommended)"
echo "  Run: echo 'https://YOUR_USERNAME:YOUR_PAT@github.com' >> ~/.git-credentials"
echo "  Then: chmod 600 ~/.git-credentials"
echo ""
echo "Option 2: Interactive (will prompt for username and token)"
echo "  Run: git push"
echo "  Enter your GitHub username when prompted"
echo "  Enter your PAT as the password when prompted"
echo ""
echo "Current remote URL:"
git remote get-url origin
echo ""
echo "To test after adding credentials:"
echo "  git push"
echo ""

