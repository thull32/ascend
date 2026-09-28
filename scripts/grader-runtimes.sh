#!/usr/bin/env bash
# Downloads the WebAssembly runtimes the grader runs learner code in, checks
# them against pinned SHA-256 digests, and lays them out in DIR:
#
#   DIR/python.wasm        CPython for WASI (the build CPython's WASI
#   DIR/lib/python3.x/     maintainer publishes), and its standard library
#   DIR/qjs.wasm           QuickJS-ng for WASI
#
# Then `ascend-api --prepare-grader DIR` precompiles the library. Used by
# `make grader`, CI and the Dockerfile. Python matches the browser's Pyodide
# (3.14), so a solution behaves the same in both.
set -euo pipefail
DIR=${1:-runtimes/grader}

PY_VERSION=3.14.7
PY_URL="https://github.com/brettcannon/cpython-wasi-build/releases/download/v${PY_VERSION}/python-${PY_VERSION}-wasi_sdk-24.zip"
PY_SHA256=2e064d3fb8172471d39d741348efa722349c40b96301f69968dff714999c584b
QJS_VERSION=0.17.0
QJS_URL="https://github.com/quickjs-ng/quickjs/releases/download/v${QJS_VERSION}/qjs-wasi.wasm"
QJS_SHA256=42a732a676ec2d93488c19411e0fad283bf72658fdad746f089914b523c783b1

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL --retry 3 -o "$tmp/python.zip" "$PY_URL"
echo "$PY_SHA256  $tmp/python.zip" | sha256sum -c --quiet
curl -fsSL --retry 3 -o "$tmp/qjs.wasm" "$QJS_URL"
echo "$QJS_SHA256  $tmp/qjs.wasm" | sha256sum -c --quiet

rm -rf "$DIR"
mkdir -p "$DIR"
unzip -q "$tmp/python.zip" -d "$DIR"
mv "$tmp/qjs.wasm" "$DIR/qjs.wasm"
echo "grader runtimes: CPython ${PY_VERSION} and QuickJS-ng ${QJS_VERSION} in $DIR"
