#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project=$("$script_dir/resolve-project.sh" "${1:-}")
wrangler="$project/node_modules/wrangler/bin/wrangler.js"
config="$project/dist/server/wrangler.json"

[ -f "$wrangler" ] || { echo "Dependencies are missing; run install.sh first." >&2; exit 1; }
[ -f "$config" ] || { echo "Application build is missing; run install.sh first." >&2; exit 1; }

has_rows() {
  sql=$1
  result=$(cd "$project" && node "$wrangler" d1 execute site-creator-d1 \
    --local --persist-to .wrangler/state --config "$config" \
    --command "$sql" --json)
  printf '%s' "$result" | node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      const rows = value?.[0]?.results;
      process.exit(Array.isArray(rows) && rows.length > 0 ? 0 : 1);
    });
  '
}

apply_migration() {
  file=$1
  echo "Applying local migration: $(basename -- "$file")"
  (cd "$project" && node "$wrangler" d1 execute site-creator-d1 \
    --local --persist-to .wrangler/state --config "$config" --file "$file")
}

if ! has_rows "SELECT name FROM sqlite_master WHERE type='table' AND name='categories';"; then
  apply_migration "$project/drizzle/0000_nostalgic_micromacro.sql"
fi

if ! has_rows "SELECT name FROM pragma_table_info('saved_items') WHERE name='category_source';"; then
  apply_migration "$project/drizzle/0001_abnormal_absorbing_man.sql"
fi

if ! has_rows "SELECT name FROM sqlite_master WHERE type='table' AND name='action_plans';"; then
  apply_migration "$project/drizzle/0002_brief_excalibur.sql"
fi

echo "Local database schema is ready."
