#!/usr/bin/env bash
set -euo pipefail

docker compose --profile api --profile openproject exec openproject \
  bundle exec rails runner /opt/wbs/openproject/bootstrap_wbs_standards.rb
