#!/usr/bin/env bash
set -euo pipefail
exec > >(tee /var/log/kmod-build.log) 2>&1

# Substituted by the launch workflow
KMOD_NAME="__KMOD_NAME__"
REPO_BUCKET_NAME="__REPO_BUCKET_NAME__"
GPG_SECRET_NAME="__GPG_SECRET_NAME__"

# Instance metadata (IMDSv2)
IMDS_TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
  http://169.254.169.254/latest/meta-data/instance-id)
AWS_REGION=$(curl -s -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
  http://169.254.169.254/latest/meta-data/placement/region)
ARCH=$(uname -m)

# Install RPM Fusion and build dependencies
FEDORA_RELEASE="$(rpm -E %fedora)"
dnf install -y \
  "https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-${FEDORA_RELEASE}.noarch.rpm" \
  "https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-${FEDORA_RELEASE}.noarch.rpm"

LATEST_KERNEL=$(dnf info kernel | awk '/^Version/ { ver=$3 } /^Release/ { print ver"-"$3 }' | sort -V | tail -1)
dnf install -y \
  akmods \
  createrepo_c \
  "kernel-${LATEST_KERNEL}" \
  "kernel-devel-${LATEST_KERNEL}" \
  "akmod-${KMOD_NAME}"

# Build kernel module
akmods --kernels "$LATEST_KERNEL"

# Import GPG signing key
SECRET=$(aws secretsmanager get-secret-value \
  --region "$AWS_REGION" \
  --secret-id "$GPG_SECRET_NAME" \
  --query SecretString --output text)
echo "$SECRET" | jq -r .privateKey | gpg --batch --import
GPG_KEY_ID=$(gpg --list-keys --keyid-format SHORT | awk '/^pub/ { print $2 }' | cut -d/ -f2)
GPG_PASSPHRASE=$(echo "$SECRET" | jq -r .passphrase)
unset SECRET

# Sign built RPMs
find /var/cache/akmods -name "*.rpm" | while read -r rpm; do
  rpm \
    --define "_gpg_name $GPG_KEY_ID" \
    --define "_gpg_passphrase $GPG_PASSPHRASE" \
    --addsign "$rpm"
done
unset GPG_PASSPHRASE

# Fetch existing repodata, append new RPMs, regenerate metadata
STAGING=$(mktemp -d)
trap 'rm -rf $STAGING' EXIT

REPO_PATH="f${FEDORA_RELEASE}/${ARCH}"

aws s3 sync "s3://${REPO_BUCKET_NAME}/${REPO_PATH}/repodata/" "$STAGING/repodata/" \
  --region "$AWS_REGION"

find /var/cache/akmods -name "*.rpm" -exec cp {} "$STAGING/" \;

createrepo_c --update "$STAGING/"

aws s3 sync "$STAGING/" "s3://${REPO_BUCKET_NAME}/${REPO_PATH}/" \
  --region "$AWS_REGION" \
  --exclude "*" \
  --include "*.rpm" \
  --include "repodata/*"

# Self-terminate
aws ec2 terminate-instances \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID"
