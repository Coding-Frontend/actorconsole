#!/usr/bin/env bash
set -euo pipefail

backup_file="${1:-}"
if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
  echo "Usage: RESTORE_CONFIRM=YES $0 /path/to/actorconsole-<timestamp>.sql.gz[.gpg]" >&2
  exit 2
fi
if [[ "${RESTORE_CONFIRM:-}" != "YES" ]]; then
  echo "Restore is destructive. Re-run with RESTORE_CONFIRM=YES." >&2
  exit 2
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  IFS=$'\t' read -r url_host url_port url_user url_password url_database < <(
    RESTORE_DATABASE_URL="$DATABASE_URL" node - <<'NODE'
const url = new URL(process.env.RESTORE_DATABASE_URL);
process.stdout.write([
  url.hostname,
  url.port || "3306",
  decodeURIComponent(url.username),
  decodeURIComponent(url.password),
  url.pathname.replace(/^\//, ""),
  ].join("\t") + "\n");
NODE
  )
fi

db_host="${MYSQL_HOST:-${url_host:-127.0.0.1}}"
db_port="${MYSQL_PORT:-${url_port:-3306}}"
db_user="${MYSQL_USER:-${url_user:-root}}"
db_password="${MYSQL_PASSWORD:-${url_password:-}}"
db_name="${MYSQL_DATABASE:-${url_database:-actorconsole}}"

defaults_file="$(mktemp "${TMPDIR:-/tmp}/.mysql-restore.XXXXXX.cnf")"
decrypted_file=""
cleanup() { rm -f "$defaults_file" "$decrypted_file"; }
trap cleanup EXIT
chmod 600 "$defaults_file"
{
  echo "[client]"
  echo "host=${db_host}"
  echo "port=${db_port}"
  echo "user=${db_user}"
  echo "password=${db_password}"
} > "$defaults_file"

echo "Restoring ${backup_file} into database ${db_name}"
restore_input="$backup_file"
if [[ "$backup_file" == *.gpg ]]; then
  command -v gpg >/dev/null 2>&1 || { echo "Encrypted backup requires gpg" >&2; exit 1; }
  decrypted_file="$(mktemp "${TMPDIR:-/tmp}/actorconsole-restore.XXXXXX.sql.gz")"
  gpg --batch --decrypt --output "$decrypted_file" "$backup_file"
  restore_input="$decrypted_file"
fi
gunzip -c "$restore_input" | mysql --defaults-extra-file="$defaults_file" "$db_name"
echo "Restore complete"
