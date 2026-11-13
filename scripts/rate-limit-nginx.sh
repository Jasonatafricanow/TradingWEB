#!/bin/sh
# Install TradingWEB nginx rate limiting. Run on the server as root:
#   sh scripts/rate-limit-nginx.sh
# Optional:
#   SITE_CONF=/etc/nginx/sites-available/tradingweb   (default)
#   TRUSTED_PROXY_CIDRS="173.245.48.0/20 103.21.244.0/22 ..."  when behind a CDN/proxy
#   REAL_IP_HEADER=CF-Connecting-IP                    (default X-Forwarded-For)
#   NGINX_DIR=/etc/nginx                               (for testing)
set -eu

HERE=$(cd "$(dirname "$0")/.." && pwd)
SRC="$HERE/deploy/nginx"
NGINX_DIR=${NGINX_DIR:-/etc/nginx}
SITE_CONF=${SITE_CONF:-$NGINX_DIR/sites-available/tradingweb}
REAL_IP_HEADER=${REAL_IP_HEADER:-X-Forwarded-For}
TRUSTED_PROXY_CIDRS=${TRUSTED_PROXY_CIDRS:-}

[ -f "$SITE_CONF" ] || { echo "site config not found: $SITE_CONF" >&2; exit 1; }
mkdir -p "$NGINX_DIR/conf.d" "$NGINX_DIR/snippets"

real_ip=""
if [ -n "$TRUSTED_PROXY_CIDRS" ]; then
  for cidr in $TRUSTED_PROXY_CIDRS; do real_ip="${real_ip}set_real_ip_from $cidr;\n"; done
  real_ip="${real_ip}real_ip_header $REAL_IP_HEADER;\nreal_ip_recursive on;"
fi
awk -v repl="$real_ip" '{ if ($0 ~ /# @REAL_IP@/) { gsub(/\n/, "\n", repl); print repl } else print }' \
  "$SRC/tradingweb-ratelimit-http.conf" > "$NGINX_DIR/conf.d/tradingweb-ratelimit.conf"
cp "$SRC/tradingweb-proxy.conf" "$NGINX_DIR/snippets/tradingweb-proxy.conf"
cp "$SRC/tradingweb-ratelimit-locations.conf" "$NGINX_DIR/snippets/tradingweb-ratelimit-locations.conf"

# Remove the broken one-line zones left in nginx.conf by the old script.
if grep -q "# Rate limiting zones *limit_req_zone" "$NGINX_DIR/nginx.conf" 2>/dev/null; then
  cp "$NGINX_DIR/nginx.conf" "$NGINX_DIR/nginx.conf.bak-ratelimit"
  sed -i '/# Rate limiting zones *limit_req_zone/d' "$NGINX_DIR/nginx.conf"
fi
# Remove the old per-proxy_pass line, which referenced a zone that never existed.
sed -i '/limit_req zone=api burst=20 nodelay;/d' "$SITE_CONF"

if ! grep -q "snippets/tradingweb-ratelimit-locations.conf" "$SITE_CONF"; then
  cp "$SITE_CONF" "$SITE_CONF.bak-ratelimit"
  # Insert before the first "location /" catch-all in the server block.
  awk 'done == 0 && /^[[:space:]]*location[[:space:]]+\/[[:space:]]*\{/ {
         print "    include snippets/tradingweb-ratelimit-locations.conf;"; done = 1 }
       { print }
       END { if (done == 0) exit 3 }' "$SITE_CONF.bak-ratelimit" > "$SITE_CONF" || {
    cp "$SITE_CONF.bak-ratelimit" "$SITE_CONF"
    echo "no 'location / {' block in $SITE_CONF; add 'include snippets/tradingweb-ratelimit-locations.conf;' to the server block manually" >&2
    exit 1
  }
fi

if [ "${SKIP_RELOAD:-}" = "1" ]; then
  nginx -t -c "$NGINX_DIR/nginx.conf"
else
  nginx -t && systemctl reload nginx
fi
echo "nginx rate limiting applied"
