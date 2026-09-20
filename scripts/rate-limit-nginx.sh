#!/bin/sh
# Apply rate limiting to tradingweb nginx config on London server
# Run this on the server or via SSH

# Add limit_req zones to http block if not present
grep -q "limit_req_zone" /etc/nginx/nginx.conf || {
  sed -i '/^http {/a\n    # Rate limiting zones    limit_req_zone \$binary_remote_addr zone=api:10m rate=60r/m;    limit_req_zone \$binary_remote_addr zone=auth:10m rate=10r/m;    limit_req_zone \$binary_remote_addr zone=checkout:10m rate=20r/m;' /etc/nginx/nginx.conf
}

# Add limit_req to location blocks in site config
grep -q "limit_req zone=api" /etc/nginx/sites-available/tradingweb || {
  sed -i '/proxy_pass http:\/\/127.0.0.1:3000;/i        limit_req zone=api burst=20 nodelay;' /etc/nginx/sites-available/tradingweb
}

nginx -t && systemctl reload nginx && echo "nginx rate limiting applied"
