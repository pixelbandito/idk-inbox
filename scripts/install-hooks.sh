#!/usr/bin/env bash
#
# install-hooks.sh — install the local git hooks for this repo.
# Run once per clone:  bash scripts/install-hooks.sh
#
# Installs a pre-push hook that runs the security scan (scripts/security-scan.sh)
# and aborts the push if anything is found. The same scan runs in CI, so this is
# a fast local mirror, not the only line of defence.

set -euo pipefail
root="$(git rev-parse --show-toplevel)"
hook="$root/.git/hooks/pre-push"

cat > "$hook" <<'HOOK'
#!/usr/bin/env bash
# Installed by scripts/install-hooks.sh. Blocks a push on any security finding.
exec "$(git rev-parse --show-toplevel)/scripts/security-scan.sh"
HOOK

chmod +x "$hook"
echo "✓ Installed pre-push hook → $hook"
