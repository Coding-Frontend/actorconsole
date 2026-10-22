#!/usr/bin/env bash
set -euo pipefail

# MySQL setup for an ActorConsole VPS. Credentials are deliberately supplied
# through the environment and a temporary client defaults file; never put a
# password in this script or in a command-line argument.
#
# Required:
#   MYSQL_ROOT_PASSWORD  (unless root authentication uses a local socket)
#   MYSQL_APP_PASSWORD
# Optional:
#   MYSQL_ROOT_USER=root
#   MYSQL_APP_USER=actorconsole
#   MYSQL_DATABASE=actorconsole
#   MYSQL_HOST=localhost
#   MYSQL_PORT=3306

: "${MYSQL_APP_PASSWORD:?Set MYSQL_APP_PASSWORD before running this script}"

mysql_host="${MYSQL_HOST:-localhost}"
mysql_port="${MYSQL_PORT:-3306}"
root_user="${MYSQL_ROOT_USER:-root}"
app_user="${MYSQL_APP_USER:-actorconsole}"
database="${MYSQL_DATABASE:-actorconsole}"

root_defaults="$(mktemp "${TMPDIR:-/tmp}/.actorconsole-mysql-root.XXXXXX.cnf")"
app_defaults="$(mktemp "${TMPDIR:-/tmp}/.actorconsole-mysql-app.XXXXXX.cnf")"
cleanup() {
  rm -f "$root_defaults" "$app_defaults"
}
trap cleanup EXIT
chmod 600 "$root_defaults" "$app_defaults"

{
  echo "[client]"
  echo "host=${mysql_host}"
  echo "port=${mysql_port}"
  echo "user=${root_user}"
  if [[ -n "${MYSQL_ROOT_PASSWORD:-}" ]]; then
    echo "password=${MYSQL_ROOT_PASSWORD}"
  fi
} >"$root_defaults"

{
  echo "[client]"
  echo "host=${mysql_host}"
  echo "port=${mysql_port}"
  echo "user=${app_user}"
  echo "password=${MYSQL_APP_PASSWORD}"
} >"$app_defaults"

mysql_root() {
  mysql --defaults-extra-file="$root_defaults" "$@"
}

echo "Creating database ${database} (if it does not exist)..."
mysql_root -e "CREATE DATABASE IF NOT EXISTS \`${database//\`/\`\`}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "Creating or updating application user ${app_user}@localhost..."
# Use a short-lived SQL file so the password is never exposed in process
# arguments. The file is removed by the EXIT trap before the script returns.
grant_sql="$(mktemp "${TMPDIR:-/tmp}/.actorconsole-mysql-grant.XXXXXX.sql")"
trap 'rm -f "$root_defaults" "$app_defaults" "$grant_sql"' EXIT
chmod 600 "$grant_sql"
{
  printf "CREATE USER IF NOT EXISTS %s@'localhost' IDENTIFIED WITH mysql_native_password BY %s;\n" \
    "$(printf "%s" "$app_user" | sed "s/'/''/g; s/^/'/; s/$/'/")" \
    "$(printf "%s" "$MYSQL_APP_PASSWORD" | sed "s/'/''/g; s/^/'/; s/$/'/")"
  printf "ALTER USER %s@'localhost' IDENTIFIED WITH mysql_native_password BY %s;\n" \
    "$(printf "%s" "$app_user" | sed "s/'/''/g; s/^/'/; s/$/'/")" \
    "$(printf "%s" "$MYSQL_APP_PASSWORD" | sed "s/'/''/g; s/^/'/; s/$/'/")"
  printf "GRANT ALL PRIVILEGES ON %s.* TO %s@'localhost';\n" \
    "$(printf "%s" "$database" | sed 's/`/``/g; s/^/`/; s/$/`/')" \
    "$(printf "%s" "$app_user" | sed "s/'/''/g; s/^/'/; s/$/'/")"
  printf "FLUSH PRIVILEGES;\n"
} >"$grant_sql"
mysql_root <"$grant_sql"

echo "Verifying application connection..."
mysql --defaults-extra-file="$app_defaults" "$database" -e "SELECT 1 AS ready;" >/dev/null
echo "MySQL setup complete."
