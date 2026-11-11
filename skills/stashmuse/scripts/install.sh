#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project=$("$script_dir/resolve-project.sh" "${1:-}")

command -v node >/dev/null 2>&1 || { echo "Node.js 22.13 or newer is required." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required." >&2; exit 1; }
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) { console.error(`Node.js ${process.versions.node} is too old; install 22.13 or newer.`); process.exit(1); }'

cd "$project"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npm run build
"$script_dir/init-db.sh" "$project"
echo "Dependencies installed and application built in $project"
