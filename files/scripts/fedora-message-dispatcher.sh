#!/usr/bin/env bash
set -euo pipefail
exec > >(tee /var/log/fedora-message-dispatcher.log) 2>&1

dnf install -y \
    python3 \
    python3-pip \
    python3-jinja2 \
    python3-fedora-messaging && \
    dnf clean all

pip3 install fedora-bus-listener

GITHUB_TOKEN="__GITHUB_TOKEN__" fedora-bus-listener
