#!/usr/bin/env bash
# Deploys the Aurelius push worker to Cloudflare (free plan) and writes its URL and public key into
# ../src/config.js. Idempotent. Prerequisite (once): `npx wrangler login`.
# The VAPID private key lives outside the repository (default ~/.config/aurelius-push/vapid.json).
set -euo pipefail
cd "$(dirname "$0")"
W="npx -y wrangler@4"
KEYS="${AURELIUS_VAPID:-$HOME/.config/aurelius-push/vapid.json}"

if ! $W whoami 2>&1 | grep -qi "logged in"; then
  echo "Cloudflare: not logged in. Run once:  cd $(pwd) && npx wrangler login" >&2
  exit 1
fi

if [ ! -f "$KEYS" ]; then
  mkdir -p "$(dirname "$KEYS")"
  node -e '(async()=>{const k=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
    const j=await crypto.subtle.exportKey("jwk",k.privateKey);const r=new Uint8Array(await crypto.subtle.exportKey("raw",k.publicKey));
    require("fs").writeFileSync(process.argv[1],JSON.stringify({jwk:{kty:j.kty,crv:j.crv,x:j.x,y:j.y,d:j.d},pub:Buffer.from(r).toString("base64url")}),{mode:0o600})})()' "$KEYS"
  echo "Generated VAPID keys in $KEYS (keep this file; losing it means re-enabling notifications)."
fi

if grep -q REPLACE_WITH_D1_ID wrangler.toml; then
  $W d1 create aurelius-push >/dev/null 2>&1 || true
  id=$($W d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s).find(d=>d.name==="aurelius-push");if(!x)process.exit(1);console.log(x.uuid)})')
  sed -i "s/REPLACE_WITH_D1_ID/$id/" wrangler.toml
  echo "D1 database: $id"
fi
$W d1 execute aurelius-push --remote --file schema.sql -y >/dev/null

$W deploy | tee /tmp/aurelius-deploy.log
node -e 'process.stdout.write(JSON.stringify(require(process.argv[1]).jwk))' "$KEYS" | $W secret put VAPID_PRIVATE_JWK >/dev/null
node -e 'process.stdout.write(require(process.argv[1]).pub)' "$KEYS" | $W secret put VAPID_PUBLIC >/dev/null

url=$(grep -oE 'https://[A-Za-z0-9.-]+\.workers\.dev' /tmp/aurelius-deploy.log | head -1)
pub=$(node -e 'process.stdout.write(require(process.argv[1]).pub)' "$KEYS")
for i in 1 2 3 4 5 6; do
  if curl -fsS "$url/v1/vapid" | grep -q "$pub"; then break; fi
  sleep 5
done
curl -fsS "$url/v1/vapid" | grep -q "$pub" || { echo "Worker deployed at $url but /v1/vapid does not return the key yet" >&2; exit 1; }
sed -i "s|^export const PUSH_API = .*|export const PUSH_API = '$url';|; s|^export const VAPID_PUBLIC = .*|export const VAPID_PUBLIC = '$pub';|" ../src/config.js
echo "OK: push worker $url (src/config.js updated; commit and push to publish)."
