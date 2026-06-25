#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-}}"
if [ -z "$BASE_URL" ]; then
  echo "usage: $0 https://your-sever-host" >&2
  exit 2
fi
BASE_URL="${BASE_URL%/}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

check_status() {
  local path="$1"
  local expected="$2"
  local status
  status="$(curl -sS -o /tmp/sever-smoke-body -w '%{http_code}' "$BASE_URL$path")"
  [ "$status" = "$expected" ] || fail "$path returned $status, expected $expected"
}

check_status_one_of() {
  local path="$1"
  shift
  local status
  status="$(curl -sS -o /tmp/sever-smoke-body -w '%{http_code}' "$BASE_URL$path")"
  for expected in "$@"; do
    [ "$status" = "$expected" ] && return 0
  done
  fail "$path returned $status, expected one of: $*"
}

check_header_contains() {
  local path="$1"
  local expected_status="$2"
  local needle="$3"
  local headers
  headers="$(curl -sS -D - -o /tmp/sever-smoke-body "$BASE_URL$path")"
  echo "$headers" | grep -qi "HTTP/.* $expected_status" || fail "$path did not return HTTP $expected_status"
  echo "$headers" | grep -qi "$needle" || fail "$path headers did not include $needle"
}

check_status "/health" "200"
grep -q '"ok":true' /tmp/sever-smoke-body || fail "/health did not return ok:true"

check_header_contains "/apex" "200" "content-type: text/html"
check_header_contains "/warehouse" "200" "content-type: text/html"
check_header_contains "/projects" "200" "content-type: text/html"

check_status "/api/not-found" "404"
grep -q '"code":"not_found"' /tmp/sever-smoke-body || fail "/api/not-found did not return JSON not_found"

check_status_one_of "/api/people/me" "200" "401"
check_status "/calendar/bad-token.ics" "404"

echo "SEVER smoke-check passed for $BASE_URL"
