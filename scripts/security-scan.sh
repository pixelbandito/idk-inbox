#!/usr/bin/env bash
#
# security-scan.sh — scan tracked files for secrets and stray identifiers.
#
# Dual-use, identical behaviour in both:
#   • local pre-push hook  — see scripts/install-hooks.sh
#   • GitHub Actions        — see .github/workflows/security-scan.yml
#
# Scans git-tracked files only (never node_modules / dist / untracked scratch).
# Exits non-zero on any finding so it blocks a push and fails CI.
#
# Escape hatch: append the literal comment  security-scan:allow  to a line to
# whitelist a deliberate match (e.g. a documented example token).

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail=0

# git grep an extended-regex pattern over tracked files; report + flag on hit.
# Patterns are written so the scanner never matches its own source (real
# secrets have a char class right after the prefix; the home-path pattern uses
# an alternation group, so the literal "/Users/" never appears here verbatim).
check() {
  label="$1"; pattern="$2"
  hits="$(git grep -nIE -- "$pattern" \
    | grep -v 'security-scan:allow' || true)"
  if [ -n "$hits" ]; then
    printf '✗ %s\n' "$label"
    printf '%s\n' "$hits" | sed 's/^/    /'
    fail=1
  fi
}

# --- Secrets: high-signal provider key shapes -------------------------------
check "AWS access key id"        'AKIA[0-9A-Z]{16}'
check "GitHub token"             'gh[posr]_[0-9A-Za-z]{30,}'
check "Google API key"           'AIza[0-9A-Za-z_-]{20,}'
check "Google OAuth access token" 'ya29\.[0-9A-Za-z_-]{20,}'
check "Slack token"              'xox[baprs]-[0-9A-Za-z-]{10,}'
check "OpenAI/Anthropic key"     'sk-(ant-)?[A-Za-z0-9_-]{20,}'
check "Private key block"        'BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY'
check "Long Bearer literal"      'Bearer [A-Za-z0-9._-]{24,}'
# Quoted secret assignments with a long value (short test stubs won't trip it).
check "Hardcoded secret value"   "(client_secret|api[_-]?key|secret_key|access_token|password)[[:space:]]*[:=][[:space:]]*[\"'][A-Za-z0-9._/+-]{16,}"

# --- Stray local identifiers ------------------------------------------------
# Absolute home paths leak a machine's username and layout.
check "Absolute home path"       '/(Users|home)/[A-Za-z0-9._-]+/'

# --- Files that should never be committed -----------------------------------
forbidden="$(git ls-files | grep -iE '(^|/)\.env$|\.pem$|\.key$|\.p12$|\.pfx$|(^|/)id_rsa($|\.)|\.keystore$' || true)"
if [ -n "$forbidden" ]; then
  printf '✗ Sensitive file tracked in git\n'
  printf '%s\n' "$forbidden" | sed 's/^/    /'
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  printf '\nSecurity scan FAILED — resolve the findings above (or append the comment security-scan:allow to a deliberate line).\n'
  exit 1
fi

printf '✓ Security scan passed — no secrets or stray identifiers in tracked files.\n'
