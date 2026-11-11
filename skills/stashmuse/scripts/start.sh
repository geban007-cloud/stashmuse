#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project=$("$script_dir/resolve-project.sh" "${1:-}")
port=${2:-${STASHMUSE_PORT:-${FAVORITES_ORGANIZER_PORT:-8787}}}

case "$port" in *[!0-9]*|'') echo "Port must be a number." >&2; exit 2;; esac
[ "$port" -ge 1 ] && [ "$port" -le 65535 ] || { echo "Port must be between 1 and 65535." >&2; exit 2; }

cd "$project"
exec npm start -- --port "$port"
