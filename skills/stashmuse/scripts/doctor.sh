#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project=$("$script_dir/resolve-project.sh" "${1:-}")
port=${2:-${STASHMUSE_PORT:-${FAVORITES_ORGANIZER_PORT:-8787}}}
failed=0

pass() { printf 'PASS  %s\n' "$1"; }
warn() { printf 'WARN  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failed=1; }

printf 'Project: %s\n' "$project"
if command -v node >/dev/null 2>&1; then
  version=$(node -p 'process.versions.node')
  if node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22 || (a===22 && b>=13) ? 0 : 1)'; then pass "Node.js $version"; else fail "Node.js $version; need 22.13 or newer"; fi
else fail "Node.js is missing"; fi
command -v npm >/dev/null 2>&1 && pass "npm available" || fail "npm is missing"
[ -f "$project/package-lock.json" ] && pass "package lock present" || warn "package lock missing"
[ -d "$project/node_modules/vinext" ] && pass "dependencies installed" || warn "dependencies not installed; run install.sh"
[ -f "$project/dist/server/wrangler.json" ] && pass "application build present" || warn "application is not built; run install.sh"
[ -f "$project/extension/manifest.json" ] && pass "Chrome extension present" || fail "Chrome extension missing"

if [ -f "$project/.dev.vars" ]; then warn "checkout-local .dev.vars exists; keep it uncommitted"; else pass "no checkout-local secret file"; fi
runtime_secrets=${COLLECTOR_SECRETS_FILE:-${HOME}/Library/Application Support/collector-universe-runtime/secrets/.dev.vars}
if [ -f "$runtime_secrets" ]; then pass "external optional-secret file present (values hidden)"; else warn "optional AI and delivery credentials are not configured"; fi

if command -v curl >/dev/null 2>&1 && curl --silent --show-error --fail --max-time 2 "http://127.0.0.1:$port/api/categories" >/dev/null 2>&1; then
  pass "local service responds on 127.0.0.1:$port"
else
  warn "local service is not responding on 127.0.0.1:$port"
fi

exit "$failed"
