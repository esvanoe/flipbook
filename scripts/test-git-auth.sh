#!/bin/bash
# test-git-auth.sh
# Test git authentication without pushing

set -e

echo "=== Testing Git Authentication ==="
echo ""

# Check if credentials file exists
if [ -f ~/.git-credentials ]; then
    echo "✓ Credentials file exists"
    echo "  Location: ~/.git-credentials"
    echo "  Format check:"
    
    # Check format (without showing actual credentials)
    if grep -q "^https://.*:.*@github.com" ~/.git-credentials; then
        echo "  ✓ Format looks correct (username:token@github.com)"
    else
        echo "  ⚠ Format might be incorrect"
        echo "  Expected: https://USERNAME:TOKEN@github.com"
    fi
    
    # Check permissions
    PERMS=$(stat -c "%a" ~/.git-credentials 2>/dev/null || stat -f "%OLp" ~/.git-credentials 2>/dev/null)
    if [ "$PERMS" = "600" ]; then
        echo "  ✓ Permissions correct (600)"
    else
        echo "  ⚠ Permissions: $PERMS (should be 600)"
        echo "  Fix with: chmod 600 ~/.git-credentials"
    fi
else
    echo "✗ Credentials file not found"
    echo "  Create it with:"
    echo "    echo 'https://YOUR_USERNAME:YOUR_PAT@github.com' >> ~/.git-credentials"
    echo "    chmod 600 ~/.git-credentials"
fi

echo ""
echo "Testing read access (should work if credentials are correct):"
cd /opt/bitm_ng
if git ls-remote --heads origin 2>&1 | head -1 | grep -q "refs/heads"; then
    echo "✓ Read access works"
else
    echo "✗ Read access failed"
    echo "  Check your credentials format"
fi

echo ""
echo "To test write access, try:"
echo "  git push --dry-run"
echo "  or"
echo "  git push"


