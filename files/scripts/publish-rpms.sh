#!/usr/bin/env bash
set -euo pipefail

: "${REPO_BUCKET_NAME:?REPO_BUCKET_NAME is required}"
: "${GPG_KEY_ID:?GPG_KEY_ID is required}"
: "${GPG_PASSPHRASE:?GPG_PASSPHRASE is required}"

ARCH=$(uname -m)
STAGING=$(mktemp -d)
trap 'rm -rf $STAGING' EXIT

# Fetch only existing repodata (not the full RPM set)
aws s3 sync "s3://${REPO_BUCKET_NAME}/${ARCH}/repodata/" "$STAGING/repodata/"

# Copy and sign new RPMs into staging
find /var/cache/akmods -name "*.rpm" | while read -r rpm; do
  dest="$STAGING/$(basename "$rpm")"
  cp "$rpm" "$dest"
  rpm \
    --define "_gpg_name $GPG_KEY_ID" \
    --define "_gpg_passphrase $GPG_PASSPHRASE" \
    --addsign "$dest"
done

# Regenerate metadata, recycling existing package entries from repodata
createrepo_c --update "$STAGING/"

# Upload new RPMs and updated repodata
aws s3 sync "$STAGING/" "s3://${REPO_BUCKET_NAME}/${ARCH}/" \
  --exclude "*" \
  --include "*.rpm" \
  --include "repodata/*"
