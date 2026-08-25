#!/usr/bin/env bash
# Sign and notarize darwin binaries. Requires Apple secrets listed in docs/RELEASING.md.
# Does nothing useful without them — do not treat an unsigned binary as notarized.
set -euo pipefail

if [[ -z "${APPLE_CERTIFICATE_P12:-}" || -z "${APPLE_CERTIFICATE_PASSWORD:-}" || -z "${APPLE_API_KEY:-}" || -z "${APPLE_API_KEY_ID:-}" || -z "${APPLE_API_ISSUER:-}" ]]; then
  echo "Apple signing secrets are not set. Leaving darwin binaries unsigned." >&2
  exit 0
fi

DIR="${1:-dist/bin}"
CERT_PATH="$(mktemp)"
KEY_PATH="$(mktemp)"
trap 'rm -f "${CERT_PATH}" "${KEY_PATH}"' EXIT
printf '%s' "${APPLE_CERTIFICATE_P12}" | base64 --decode > "${CERT_PATH}"
printf '%s' "${APPLE_API_KEY}" > "${KEY_PATH}"

security create-keychain -p "" build.keychain
security default-keychain -s build.keychain
security unlock-keychain -p "" build.keychain
security import "${CERT_PATH}" -k build.keychain -P "${APPLE_CERTIFICATE_PASSWORD}" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "" build.keychain

IDENTITY="${APPLE_CODESIGN_IDENTITY:?APPLE_CODESIGN_IDENTITY (Developer ID Application) is required to sign}"

for bin in "${DIR}"/agentdeck-darwin-arm64 "${DIR}"/agentdeck-darwin-x64; do
  if [[ -f "${bin}" ]]; then
    codesign --force --options runtime --sign "${IDENTITY}" --timestamp "${bin}"
    xcrun notarytool submit "${bin}" --key "${KEY_PATH}" --key-id "${APPLE_API_KEY_ID}" --issuer "${APPLE_API_ISSUER}" --wait
  fi
done
