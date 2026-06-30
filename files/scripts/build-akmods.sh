#!/usr/bin/env bash
set -euo pipefail

LATEST_KERNEL=$(dnf info kernel | awk '/^Version/ { ver=$3 } /^Release/ { print ver"-"$3 }' | sort -V | tail -1)
FEDORA_RELEASE="$(rpm -E %fedora)"

dnf install -y \
    "https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$FEDORA_RELEASE.noarch.rpm" \
    "https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$FEDORA_RELEASE.noarch.rpm"

dnf install -y \
    akmods \
    "kernel-devel-${LATEST_KERNEL}" \
    "kernel-${LATEST_KERNEL}" \
    akmod-nvidia

akmods --kernels "$LATEST_KERNEL"
