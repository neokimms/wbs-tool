#!/usr/bin/env bash
set -euo pipefail

docker compose --profile api --profile openproject exec -T openproject \
  bundle exec rails runner /opt/wbs/openproject/bootstrap_si_template_project.rb
