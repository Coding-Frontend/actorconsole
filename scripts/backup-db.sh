#!/usr/bin/env bash
set -euo pipefail

backup_dir="${BACKUP_DIR:-./backups}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
plain_output="${backup_dir}/actorconsole-${timestamp}.sql.gz"
output="$plain_output"
mkdir -p "$backup_dir"

if [[ -n "${DATABASE_URL:-}" ]]; then
  IFS=$'\t' read -r url_host url_port url_user url_password url_database < <(
    BACKUP_DATABASE_URL="$DATABASE_URL" node - <<'NODE'
const value = process.env.BACKUP_DATABASE_URL;
const url = new URL(value);
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

defaults_file="$(mktemp "${backup_dir}/.mysql-backup.XXXXXX.cnf")"
cleanup() { rm -f "$defaults_file"; }
trap cleanup EXIT
chmod 600 "$defaults_file"
{
  echo "[client]"
  echo "host=${db_host}"
  echo "port=${db_port}"
  echo "user=${db_user}"
  echo "password=${db_password}"
} > "$defaults_file"

echo "Creating database backup: ${output}"
dump_options=(
  --single-transaction
  --quick
  --routines
  --events
  --triggers
  --hex-blob
)
mysqldump_help="$(mysqldump --help 2>/dev/null || true)"
if grep -Fq -- "--set-gtid-purged" <<<"$mysqldump_help"; then
  dump_options+=(--set-gtid-purged=OFF)
fi
mysqldump --defaults-extra-file="$defaults_file" "${dump_options[@]}" "$db_name" \
  | gzip -c > "$plain_output"

if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  command -v gpg >/dev/null 2>&1 || {
    echo "BACKUP_GPG_RECIPIENT is set but gpg is unavailable" >&2
    exit 1
  }
  output="${plain_output}.gpg"
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" \
    --output "$output" "$plain_output"
  rm -f "$plain_output"
fi

echo "Backup archive ready: ${output}"

if [[ -n "${BACKUP_S3_URI:-}" ]]; then
  command -v aws >/dev/null 2>&1 || { echo "BACKUP_S3_URI is set but aws CLI is unavailable" >&2; exit 1; }
  aws s3 cp "$output" "${BACKUP_S3_URI%/}/$(basename "$output")" \
    --only-show-errors --sse "${BACKUP_S3_SSE:-AES256}"
fi

find "$backup_dir" -type f \( -name 'actorconsole-*.sql.gz' -o -name 'actorconsole-*.sql.gz.gpg' \) \
  -mtime "+${retention_days}" -delete
echo "Backup complete"
