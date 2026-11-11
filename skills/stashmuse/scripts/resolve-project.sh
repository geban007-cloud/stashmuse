#!/bin/sh
set -eu

data_root=${XDG_DATA_HOME:-${HOME}/.local/share}
default_project=${data_root}/stashmuse
candidate=${1:-${STASHMUSE_HOME:-${FAVORITES_ORGANIZER_HOME:-}}}
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

is_project() {
  [ -f "$1/package.json" ] && [ -f "$1/scripts/start-desktop.mjs" ] && [ -d "$1/extension" ]
}

if [ -n "$candidate" ]; then
  candidate=$(CDPATH= cd -- "$candidate" 2>/dev/null && pwd) || {
    echo "Project directory does not exist: $candidate" >&2
    exit 2
  }
elif is_project "$(CDPATH= cd -- "$script_dir/../../.." && pwd)"; then
  candidate=$(CDPATH= cd -- "$script_dir/../../.." && pwd)
elif is_project "$default_project"; then
  candidate=$(CDPATH= cd -- "$default_project" && pwd)
else
  probe=$PWD
  while [ "$probe" != "/" ]; do
    if is_project "$probe"; then candidate=$probe; break; fi
    probe=$(dirname -- "$probe")
  done
fi

if [ -z "${candidate:-}" ] || ! is_project "$candidate"; then
  echo "Cannot locate the favorites organizer checkout." >&2
  echo "Pass its path as the first argument or set STASHMUSE_HOME." >&2
  exit 2
fi

printf '%s\n' "$candidate"
