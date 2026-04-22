#!/bin/bash
# Run once after cloning: bash scripts/install-hooks.sh
# Installs a pre-push hook that blocks pushes when npm run build fails.

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK="$REPO_ROOT/.git/hooks/pre-push"

cat > "$HOOK" << 'HOOKEOF'
#!/bin/bash
# Pre-push hook: abort push if build fails.
echo "Running build check before push..."
npm run build
if [ $? -ne 0 ]; then
  echo ""
  echo "✗ Build failed — push aborted. Fix the errors above, then push again."
  exit 1
fi
echo "✓ Build passed — pushing."
HOOKEOF

chmod +x "$HOOK"
echo "✓ Pre-push hook installed at $HOOK"
