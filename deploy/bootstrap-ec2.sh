#!/usr/bin/env bash
# Run once as root on a reviewed Ubuntu 24.04 amd64 EC2 instance.
# Usage: bootstrap-ec2.sh API_DOMAIN CADDY_EMAIL FRONTEND_ORIGIN
# This script does not deploy an application image or change AWS networking/IAM.
set -Eeuo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin"
umask 077

die() { printf 'Bootstrap failed: %s\n' "$*" >&2; exit 1; }
[[ $# -eq 3 ]] || die 'Usage: bootstrap-ec2.sh API_DOMAIN CADDY_EMAIL FRONTEND_ORIGIN'
[[ $(id -u) == 0 ]] || die 'Run this script as root.'

api_domain=$1
caddy_email=$2
frontend_origin=$3
# Only literal hostnames/origins are accepted: no dotenv interpolation or Caddy syntax.
domain_pattern='^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$'
email_pattern='^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$'
[[ ${#api_domain} -le 253 && $api_domain =~ $domain_pattern ]] || die 'API_DOMAIN must be a DNS hostname, without a scheme, path, or whitespace.'
[[ ${#caddy_email} -le 254 && $caddy_email =~ $email_pattern ]] || die 'CADDY_EMAIL must be a plain email address.'
[[ $frontend_origin == https://* && $frontend_origin != *[[:space:]]* ]] || die 'FRONTEND_ORIGIN must be an exact HTTPS origin.'
origin_authority=${frontend_origin#https://}
origin_host=${origin_authority%%:*}
[[ ${#origin_host} -le 253 && $origin_host =~ $domain_pattern ]] || die 'FRONTEND_ORIGIN must contain a DNS hostname, with no path, query, wildcard, or credentials.'
normalized_host=$(printf '%s' "$origin_host" | tr '[:upper:]' '[:lower:]')
[[ $normalized_host != *.localhost ]] || die 'FRONTEND_ORIGIN must be a public HTTPS origin, not a localhost hostname.'
# Match WHATWG URL.origin, which the production server requires exactly.
# Browser origins lowercase hostnames and omit the default HTTPS port.
frontend_origin="https://$normalized_host"
if [[ $origin_authority != "$origin_host" ]]; then
  origin_port=${origin_authority#*:}
  [[ $origin_port =~ ^[0-9]{1,5}$ ]] || die 'FRONTEND_ORIGIN has an invalid port.'
  (( 10#$origin_port >= 1 && 10#$origin_port <= 65535 )) || die 'FRONTEND_ORIGIN port must be between 1 and 65535.'
  if (( 10#$origin_port != 443 )); then
    frontend_origin+=":$((10#$origin_port))"
  fi
fi

[[ -r /etc/os-release ]] || die 'Cannot identify this operating system.'
# The operating-system release file is installed by Ubuntu, not deployment input.
. /etc/os-release
[[ ${ID:-} == ubuntu && ${VERSION_ID:-} == 24.04 ]] || die 'This bootstrap supports Ubuntu 24.04 only.'
[[ $(dpkg --print-architecture) == amd64 ]] || die 'This bootstrap supports x86_64 / amd64 only.'

for package in docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc; do
  if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q '^install ok installed$'; then
    die "Conflicting package $package is installed. Review Docker's Ubuntu migration instructions before continuing."
  fi
done

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl jq util-linux snapd
install -m 0755 -d /etc/apt/keyrings
curl --fail --show-error --silent --location https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<'DOCKER_SOURCE'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
DOCKER_SOURCE
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
systemctl enable --now snapd.socket

# The AWS-supported Snap package receives automatic updates. No static AWS keys
# are installed: ECR/SSM use the EC2 instance profile configured separately.
if ! command -v aws >/dev/null 2>&1; then
  snap install aws-cli --classic
fi
if dpkg-query -W -f='${Status}' amazon-ssm-agent 2>/dev/null | grep -q '^install ok installed$'; then
  # Preserve an existing deb installation rather than run two SSM agents.
  systemctl enable --now amazon-ssm-agent
else
  if ! snap list amazon-ssm-agent >/dev/null 2>&1; then
    snap install amazon-ssm-agent --classic
  fi
  snap start --enable amazon-ssm-agent
fi

install -d -m 0750 /opt/oddbid /opt/oddbid/releases
if [[ ! -e /opt/oddbid/.env ]]; then
  printf 'API_DOMAIN=%s\nCADDY_EMAIL=%s\n' "$api_domain" "$caddy_email" > /opt/oddbid/.env
else
  printf '%s\n' 'Preserved existing /opt/oddbid/.env.'
fi
if [[ ! -e /opt/oddbid/server.env ]]; then
  printf 'ALLOWED_ORIGINS=%s\n' "$frontend_origin" > /opt/oddbid/server.env
else
  printf '%s\n' 'Preserved existing /opt/oddbid/server.env.'
fi
chmod 0600 /opt/oddbid/.env /opt/oddbid/server.env
docker compose version
aws --version
printf '%s\n' 'Bootstrap complete. Configure DNS, the instance role, and TCP 80/443 ingress before the first deployment.'
printf '%s\n' 'Application images are deployed separately by the reviewed GitHub Actions/SSM release workflow.'
