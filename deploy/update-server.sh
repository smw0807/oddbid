#!/usr/bin/env bash
# Run by SSM as root from /opt/oddbid/releases/<sha>-<run>-<attempt>/.
# Usage: update-server.sh IMAGE_URI GIT_SHA AWS_REGION
# Recreating this single server discards in-memory rooms, including on rollback.
set -Eeuo pipefail
# SSM runs a non-login shell; the AWS CLI Snap may be absent from its PATH.
export PATH="${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}:/snap/bin"
umask 077

die() { printf 'Deployment failed: %s\n' "$*" >&2; exit 1; }
[[ $# -eq 3 ]] || die 'Usage: update-server.sh IMAGE_URI GIT_SHA AWS_REGION'
[[ $(id -u) == 0 ]] || die 'Run this script as root.'
image_uri=$1
revision=$2
aws_region=$3
# Overrides only make isolated local mock tests possible; production uses /opt/oddbid.
deploy_dir=${ODDBID_DEPLOY_DIR:-/opt/oddbid}
local_attempts=${ODDBID_HEALTH_ATTEMPTS:-45}
tls_attempts=${ODDBID_TLS_ATTEMPTS:-60}
[[ $deploy_dir == /* && $deploy_dir != *[[:space:]]* && $deploy_dir != / ]] || die 'Invalid deployment directory.'
[[ $local_attempts =~ ^[1-9][0-9]*$ && $tls_attempts =~ ^[1-9][0-9]*$ ]] || die 'Health attempt counts must be positive integers.'
[[ $revision =~ ^[a-f0-9]{40}$ ]] || die 'GIT_SHA must be a full lowercase commit SHA.'
[[ $aws_region =~ ^[a-z]{2}(-[a-z]+)+-[0-9]+$ ]] || die 'Invalid AWS region.'
image_pattern="^[0-9]{12}\\.dkr\\.ecr\\.${aws_region}\\.amazonaws\\.com(\\.cn)?/[a-z0-9]+([._/-][a-z0-9]+)*:${revision}(-[0-9]+-[0-9]+)?$"
[[ $image_uri =~ $image_pattern ]] || die 'IMAGE_URI must be an ECR image in AWS_REGION tagged with GIT_SHA (optionally followed by run ID and attempt).'
registry=${image_uri%%/*}

for command_name in aws docker flock curl jq awk mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || die "Required command is unavailable: $command_name"
done
[[ -d $deploy_dir && -f $deploy_dir/.env && -f $deploy_dir/server.env ]] || die 'Run bootstrap first: the deployment directory and both environment files are required.'
deploy_dir=$(cd "$deploy_dir" && pwd -P)
release_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
release_name_pattern="^${revision}-[0-9]+-[0-9]+$"
[[ $(dirname -- "$release_dir") == "$deploy_dir/releases" && ${release_dir##*/} =~ $release_name_pattern ]] || die 'Run the script from a release directory named <GIT_SHA>-<run>-<attempt> under releases/.'
[[ -f $release_dir/compose.yaml && -f $release_dir/Caddyfile ]] || die 'The release is missing compose.yaml or Caddyfile.'
exec 9> "$deploy_dir/deploy.lock"
flock -n 9 || die 'Another deployment is already running.'

# Environment files are data, never sourced as shell code. Reject duplicate keys.
env_value() {
  awk -v key="$2" 'index($0, key "=") == 1 { count++; value=substr($0, length(key)+2) } END { if(count > 1) exit 1; print value }' "$1"
}
api_domain=$(env_value "$deploy_dir/.env" API_DOMAIN)
caddy_email=$(env_value "$deploy_dir/.env" CADDY_EMAIL)
domain_pattern='^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$'
email_pattern='^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$'
[[ ${#api_domain} -le 253 && $api_domain =~ $domain_pattern ]] || die 'Invalid API_DOMAIN in .env.'
[[ ${#caddy_email} -le 254 && $caddy_email =~ $email_pattern ]] || die 'Invalid CADDY_EMAIL in .env.'
old_image=$(env_value "$deploy_dir/.env" ODDBID_IMAGE)
old_revision=$(env_value "$deploy_dir/.env" APP_REVISION)
old_release=$(env_value "$deploy_dir/.env" ODDBID_RELEASE_DIR)
has_previous=false
if [[ -n $old_image || -n $old_revision || -n $old_release ]]; then
  [[ -n $old_image && $old_revision =~ ^[a-f0-9]{40}$ && $(dirname -- "$old_release") == "$deploy_dir/releases" && -f $old_release/compose.yaml && -f $old_release/Caddyfile ]] || die 'Existing deployment state is incomplete; repair it before deploying.'
  has_previous=true
fi
# Compose gives shell variables precedence over --env-file, so remove inherited
# values rather than accidentally deploying stale CI/shell configuration.
unset ODDBID_IMAGE APP_REVISION ODDBID_RELEASE_DIR API_DOMAIN CADDY_EMAIL
temporary_dir=$(mktemp -d "$deploy_dir/.deploy.XXXXXXXX")
trap 'rm -rf -- "$temporary_dir"' EXIT
# Keep the short-lived ECR login out of root's persistent Docker configuration.
export DOCKER_CONFIG="$temporary_dir/docker-auth"
mkdir "$DOCKER_CONFIG"
cp "$deploy_dir/.env" "$temporary_dir/previous.env"
candidate_env=$temporary_dir/candidate.env
printf 'API_DOMAIN=%s\nCADDY_EMAIL=%s\nODDBID_IMAGE=%s\nAPP_REVISION=%s\nODDBID_RELEASE_DIR=%s\n' \
  "$api_domain" "$caddy_email" "$image_uri" "$revision" "$release_dir" > "$candidate_env"

compose() {
  local env_file=$1 config_dir=$2
  shift 2
  docker compose --project-name oddbid --project-directory "$deploy_dir" --env-file "$env_file" -f "$config_dir/compose.yaml" "$@"
}

health_matches() {
  local expected_revision=$1 endpoint=$2 payload
  shift 2
  payload=$(curl --fail --silent --show-error --connect-timeout 3 --max-time 5 "$@" "$endpoint" 2>/dev/null) || return 1
  jq -e --arg revision "$expected_revision" '.ok == true and .service == "oddbid" and .revision == $revision' >/dev/null 2>&1 <<< "$payload"
}

wait_for_backend() {
  local env_file=$1 config_dir=$2 expected_image=$3 expected_revision=$4 attempt container_id state
  local deadline=$((SECONDS + local_attempts * 2))
  for ((attempt=1; attempt<=local_attempts && SECONDS<deadline; attempt++)); do
    container_id=$(compose "$env_file" "$config_dir" ps -q backend) || container_id=''
    state=''
    if [[ -n $container_id ]]; then
      state=$(docker inspect --format '{{.Config.Image}}|{{.State.Health.Status}}' "$container_id" 2>/dev/null) || state=''
    fi
    if [[ $state == "$expected_image|healthy" ]] && health_matches "$expected_revision" http://127.0.0.1:2567/health; then
      return 0
    fi
    sleep 2
  done
  printf '%s\n' 'Backend health/image/revision did not become ready.' >&2
  return 1
}

wait_for_https() {
  local expected_revision=$1 attempt
  local deadline=$((SECONDS + tls_attempts * 2))
  for ((attempt=1; attempt<=tls_attempts && SECONDS<deadline; attempt++)); do
    if health_matches "$expected_revision" "https://$api_domain/health" --resolve "$api_domain:443:127.0.0.1"; then
      return 0
    fi
    sleep 2
  done
  printf '%s\n' 'Caddy HTTPS health/revision did not become ready. Check DNS, certificate issuance, and TCP 80/443 ingress.' >&2
  return 1
}

mutated=false
on_failure() {
  local original_status=$1
  trap - ERR INT TERM
  set +e
  if [[ $mutated != true ]]; then
    printf '%s\n' 'Deployment failed before service replacement; the current deployment was preserved.' >&2
    exit "$original_status"
  fi
  if [[ $has_previous == true ]]; then
    printf '%s\n' 'Deployment failed; restoring the previous image and release configuration.' >&2
    if compose "$temporary_dir/previous.env" "$old_release" up -d --no-deps --force-recreate backend \
      && wait_for_backend "$temporary_dir/previous.env" "$old_release" "$old_image" "$old_revision" \
      && compose "$temporary_dir/previous.env" "$old_release" up -d --no-deps caddy \
      && wait_for_https "$old_revision"; then
      printf '%s\n' 'Previous deployment restored. This deployment remains failed.' >&2
      exit "$original_status"
    fi
    printf '%s\n' 'ROLLBACK FAILED. The saved .env still identifies the previous release; inspect the instance through SSM.' >&2
    exit 2
  fi
  if compose "$candidate_env" "$release_dir" rm --stop --force backend caddy; then
    printf '%s\n' 'First deployment failed; no previous release exists. Failed containers were removed; environment files and Caddy volumes were preserved.' >&2
  else
    printf '%s\n' 'First deployment failed, and failed containers could not be removed. Inspect the instance through SSM; environment files and Caddy volumes were preserved.' >&2
    exit 2
  fi
  exit "$original_status"
}
trap 'on_failure $?' ERR
trap 'on_failure 130' INT
trap 'on_failure 143' TERM

compose "$candidate_env" "$release_dir" config --quiet
aws ecr get-login-password --region "$aws_region" | docker login --username AWS --password-stdin "$registry" >/dev/null
docker pull "$image_uri"
compose "$candidate_env" "$release_dir" pull caddy
# Check Caddy syntax before stopping any running service. Issuing its certificate
# is verified separately after startup; validation never disables TLS checks.
compose "$candidate_env" "$release_dir" run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
mutated=true
compose "$candidate_env" "$release_dir" up -d --no-deps --force-recreate backend
wait_for_backend "$candidate_env" "$release_dir" "$image_uri" "$revision"
compose "$candidate_env" "$release_dir" up -d --no-deps caddy
wait_for_https "$revision"

# Do not overwrite either saved state until both direct and TLS-proxied checks
# pass. Releases and old images remain available for a deliberate later rollback.
if [[ $has_previous == true ]]; then
  cp "$temporary_dir/previous.env" "$temporary_dir/previous.saved"
  mv -f "$temporary_dir/previous.saved" "$deploy_dir/previous.env"
fi
mv -f "$candidate_env" "$deploy_dir/.env"
mutated=false
printf 'Deployment healthy at revision %s.\n' "$revision"
