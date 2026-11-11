#!/bin/sh
set -eu

release_version=0.1.2
archive_name="stashmuse-source-${release_version}.zip"
archive_url="https://github.com/geban007-cloud/stashmuse/releases/download/v${release_version}/${archive_name}"
expected_app_tree_sha256="887bee43e528dd140c116a3805f3010c9d767d9c6705ed3305613513f54246fd"

data_root=${XDG_DATA_HOME:-${HOME}/.local/share}
target=${1:-${STASHMUSE_HOME:-${data_root}/stashmuse}}

command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "unzip is required." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js 22.13 or newer is required." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required." >&2; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a<22 || (a===22 && b<13)) process.exit(1)' || {
  echo "Node.js 22.13 or newer is required." >&2
  exit 1
}

if [ -e "$target" ]; then
  echo "Target already exists; refusing to overwrite: $target" >&2
  exit 2
fi

parent=$(dirname -- "$target")
mkdir -p "$parent"
temp_root=$(mktemp -d "${TMPDIR:-/tmp}/stashmuse-install.XXXXXX")

cleanup() {
  case "$temp_root" in
    */stashmuse-install.*) find "$temp_root" -depth -delete 2>/dev/null || true ;;
  esac
}
trap cleanup EXIT HUP INT TERM

archive_path="$temp_root/$archive_name"
echo "Downloading StashMuse v$release_version from GitHub..."
curl --fail --location --silent --show-error "$archive_url" --output "$archive_path"

if command -v shasum >/dev/null 2>&1; then
  hash_file() { shasum -a 256 "$1" | awk '{print $1}'; }
elif command -v sha256sum >/dev/null 2>&1; then
  hash_file() { sha256sum "$1" | awk '{print $1}'; }
else
  echo "A SHA-256 tool (shasum or sha256sum) is required." >&2
  exit 1
fi

unzip -q "$archive_path" -d "$temp_root/unpacked"
source_dir="$temp_root/unpacked/stashmuse-${release_version}"
[ -f "$source_dir/package.json" ] || { echo "Unexpected archive layout." >&2; exit 1; }

manifest="$temp_root/app-manifest.txt"
find "$source_dir" -type f ! -path "$source_dir/skills/*" -print | LC_ALL=C sort | while IFS= read -r file; do
  digest=$(hash_file "$file")
  relative=${file#"$source_dir/"}
  printf '%s  %s\n' "$digest" "$relative"
done > "$manifest"
actual_app_tree_sha256=$(hash_file "$manifest")

if [ "$actual_app_tree_sha256" != "$expected_app_tree_sha256" ]; then
  echo "Application file verification failed; installation stopped." >&2
  exit 1
fi

mv "$source_dir" "$target"

echo "Installing locked npm dependencies..."
if ! (cd "$target" && npm ci && npm run build); then
  echo "Installation did not finish. Source files were kept at: $target" >&2
  echo "After fixing Node.js or npm, run scripts/install.sh for that directory." >&2
  exit 1
fi
"$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/init-db.sh" "$target"

printf '\nStashMuse installed at: %s\n' "$target"
printf 'Start: %s/start.sh %s\n' "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)" "$target"
printf 'Chrome extension: %s/extension\n' "$target"
