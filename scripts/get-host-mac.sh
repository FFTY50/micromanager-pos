#!/usr/bin/env bash
set -euo pipefail

primary_iface=${1:-eth0}
fallback_iface=${2:-wlan0}

get_mac() {
  local iface="$1"
  if [ -f "/sys/class/net/${iface}/address" ]; then
    cat "/sys/class/net/${iface}/address"
    return 0
  fi
  return 1
}

if ! mac=$(get_mac "$primary_iface"); then
  if ! mac=$(get_mac "$fallback_iface"); then
    echo "unknown" >&2
    exit 1
  fi
fi

echo "$mac"
