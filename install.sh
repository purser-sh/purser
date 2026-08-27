#!/usr/bin/env bash
# Install the Purser companion binary from a GitHub Release.
#
# NOT YET FUNCTIONAL for strangers: there is no public tagged release.
# Use the README Quickstart (git clone && bun install && bun run dev) until v0.1.0.
# Requires PURSER_REPO (owner/name) and a tagged release with SHA256SUMS.
set -euo pipefail

REPO="${PURSER_REPO:-}"
VERSION="${PURSER_VERSION:-latest}"
PREFIX="${PURSER_PREFIX:-/usr/local}"

if [[ -z "${REPO}" ]]; then
  echo "install.sh is not ready for public use yet (no tagged release)." >&2
  echo "Clone the repo and run: bun install && bun run dev" >&2
  echo "When releases exist, set PURSER_REPO=owner/name and re-run." >&2
  exit 1
fi

os="$(uname -s)"
arch="$(uname -m)"
asset=""
case "${os}:${arch}" in
  Darwin:arm64) asset="purser-darwin-arm64" ;;
  Darwin:x86_64) asset="purser-darwin-x64" ;;
  Linux:x86_64) asset="purser-linux-x64" ;;
  Linux:amd64) asset="purser-linux-x64" ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "On Windows use the purser-windows-x64.exe asset from the release. This script is for macOS/Linux." >&2
    exit 1
    ;;
  *)
    echo "Unsupported platform ${os} ${arch}. This script ships darwin-arm64, darwin-x64, and linux-x64." >&2
    exit 1
    ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

if [[ "${VERSION}" == "latest" ]]; then
  base="https://github.com/${REPO}/releases/latest/download"
else
  base="https://github.com/${REPO}/releases/download/${VERSION}"
fi

curl -fsSL "${base}/SHA256SUMS" -o "${tmp}/SHA256SUMS"
curl -fsSL "${base}/${asset}" -o "${tmp}/${asset}"

expected="$(awk -v name="${asset}" '$2 == name { print $1 }' "${tmp}/SHA256SUMS")"
if [[ -z "${expected}" ]]; then
  echo "SHA256SUMS has no entry for ${asset}" >&2
  exit 1
fi
actual="$(shasum -a 256 "${tmp}/${asset}" | awk '{ print $1 }')"
if [[ "${actual}" != "${expected}" ]]; then
  echo "checksum mismatch for ${asset}" >&2
  exit 1
fi

install -d "${PREFIX}/bin"
install -m 0755 "${tmp}/${asset}" "${PREFIX}/bin/purser"
echo "Installed ${PREFIX}/bin/purser"
echo "Token is created in ~/.purser/config.json on first run and is not printed."
