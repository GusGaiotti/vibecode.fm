#!/bin/sh
# Fetches the native binary from the matching GitHub release on first run.
# Never fails a session: every path exits 0.

root="${CLAUDE_PLUGIN_ROOT:-.}"
repo="GusGaiotti/vibecode.fm"

os="$(uname -s 2>/dev/null || echo unknown)"
arch="$(uname -m 2>/dev/null || echo unknown)"

case "$os" in
    Linux) plat="linux" ext="" ;;
    Darwin) plat="macos" ext="" ;;
    MINGW*|MSYS*|CYGWIN*|Windows*) plat="windows" ext=".exe" ;;
    *) exit 0 ;;
esac

bin="$root/bin/vibecode-fm$ext"
[ -f "$bin" ] && exit 0

case "$plat/$arch" in
    macos/arm64|macos/aarch64) a="arm64" ;;
    windows/*) a="x86_64" ;;
    */x86_64|*/amd64) a="x86_64" ;;
    macos/*) a="arm64" ;;
    *) exit 0 ;;
esac

asset="vibecode-fm-$plat-$a$ext"
base="https://github.com/$repo/releases/latest/download"

fetch() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$1" -o "$2" 2>/dev/null
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "$2" "$1" 2>/dev/null
    else
        return 1
    fi
}

sha_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" 2>/dev/null | cut -d' ' -f1
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1
    fi
}

mkdir -p "$root/bin" 2>/dev/null || exit 0
tmp="$bin.download.$$"
fetch "$base/$asset" "$tmp" || { rm -f "$tmp"; exit 0; }
[ -s "$tmp" ] || { rm -f "$tmp"; exit 0; }

sums="$tmp.sha256"
if fetch "$base/$asset.sha256" "$sums"; then
    expected="$(cut -d' ' -f1 "$sums" 2>/dev/null)"
    actual="$(sha_of "$tmp")"
    rm -f "$sums"
    if [ -n "$expected" ] && [ -n "$actual" ] && [ "$expected" != "$actual" ]; then
        rm -f "$tmp"
        exit 0
    fi
fi

chmod +x "$tmp" 2>/dev/null
mv -f "$tmp" "$bin" 2>/dev/null || rm -f "$tmp"
exit 0
