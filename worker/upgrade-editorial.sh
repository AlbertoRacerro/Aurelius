#!/usr/bin/env bash
# Upgrade existing Worker; never generates/rotates VAPID keys or touches old tables.
set -euo pipefail
cd "$(dirname "$0")/.."
npm test
npm run validate:content
cd worker
npx -y wrangler@4 whoami
npx -y wrangler@4 d1 execute aurelius-push --remote --file migrations/0002_editorial.sql -y
npx -y wrangler@4 d1 execute aurelius-push --remote --file migrations/0003_personal.sql -y
# Provision FEEDBACK_TOKEN and GITHUB_EDITORIAL_TOKEN through wrangler secret put first.
# Existing VAPID and ENROLL_KEY secrets stay untouched.
npx -y wrangler@4 deploy
