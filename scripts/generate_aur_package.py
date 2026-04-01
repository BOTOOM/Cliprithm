#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import time
import textwrap
import urllib.request
from pathlib import Path


PKGDESC = "Smart desktop video silence remover and clip editor built with Tauri and FFmpeg"
URL = "https://github.com/BOTOOM/Cliprithm"
LICENSE = "MIT"
DEPENDS = [
    "ffmpeg",
    "glibc",
    "gtk3",
    "hicolor-icon-theme",
    "libayatana-appindicator",
    "webkit2gtk-4.1",
]
MAKEDEPENDS = [
    "cargo",
    "nodejs",
    "npm",
    "patchelf",
    "rust",
]
OPTDEPENDS = [
    "xdg-desktop-portal: improved desktop integration for file dialogs and portals",
]
CONFLICTS = [
    "cliprithm-bin",
]
PROVIDES = [
    "cliprithm",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate AUR packaging files for Cliprithm.")
    parser.add_argument("--version", required=True, help="Release version, e.g. 1.0.0")
    parser.add_argument("--tag", required=True, help="Git tag, e.g. cliprithm-v1.0.0")
    parser.add_argument("--output-dir", required=True, help="Directory where PKGBUILD and .SRCINFO are written")
    parser.add_argument("--owner", default="BOTOOM", help="GitHub owner")
    parser.add_argument("--repo", default="Cliprithm", help="GitHub repository")
    parser.add_argument(
        "--maintainer",
        default="Edwar Diaz <edwardiaz.dev@gmail.com>",
        help="Maintainer line for PKGBUILD",
    )
    return parser.parse_args()


def quote_array(values: list[str]) -> str:
    return "(" + " ".join(f"'{value}'" for value in values) + ")"


def source_root(repo: str, tag: str) -> str:
    return f"{repo}-{tag}"


def source_url(owner: str, repo: str, tag: str, version: str) -> str:
    return f"https://github.com/{owner}/{repo}/archive/refs/tags/{tag}.tar.gz"


def source_filename(pkgname: str, version: str) -> str:
    return f"{pkgname}-{version}.tar.gz"


def sha256_for_url(url: str) -> str:
    last_error: Exception | None = None

    for attempt in range(1, 6):
        try:
            digest = hashlib.sha256()
            request = urllib.request.Request(url, headers={"User-Agent": "cliprithm-aur-generator"})
            with urllib.request.urlopen(request) as response:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    digest.update(chunk)
            return digest.hexdigest()
        except Exception as error:  # noqa: BLE001
            last_error = error
            if attempt == 5:
                break
            time.sleep(attempt * 2)

    raise RuntimeError(f"Failed to download source tarball from {url}") from last_error


def render_pkgbuild(
    pkgname: str,
    version: str,
    tag: str,
    owner: str,
    repo: str,
    maintainer: str,
    sha256: str,
) -> str:
    src_filename = source_filename(pkgname, version)
    src_url = source_url(owner, repo, tag, version)
    src_root = source_root(repo, tag)

    return textwrap.dedent(
        f"""\
        # Maintainer: {maintainer}

        pkgname={pkgname}
        pkgver={version}
        pkgrel=1
        pkgdesc="{PKGDESC}"
        arch=('x86_64')
        url="{URL}"
        license=('{LICENSE}')
        depends={quote_array(DEPENDS)}
        makedepends={quote_array(MAKEDEPENDS)}
        optdepends={quote_array(OPTDEPENDS)}
        provides={quote_array(PROVIDES)}
        conflicts={quote_array(CONFLICTS)}
        source=("{src_filename}::{src_url}")
        sha256sums=('{sha256}')
        options=('!lto')

        prepare() {{
          cd "{src_root}"
          export CARGO_HOME="$srcdir/cargo-home"
          export npm_config_cache="$srcdir/npm-cache"
          npm ci --cache "$npm_config_cache" --prefer-offline
        }}

        build() {{
          cd "{src_root}"
          export CARGO_HOME="$srcdir/cargo-home"
          export CARGO_TARGET_DIR="$srcdir/target"
          npm run build
          cargo build --manifest-path src-tauri/Cargo.toml --release --locked
        }}

        package() {{
          cd "{src_root}"

          install -Dm755 "$srcdir/target/release/cliprithm" "$pkgdir/usr/bin/cliprithm"
          install -Dm644 "src-tauri/icons/128x128.png" "$pkgdir/usr/share/icons/hicolor/128x128/apps/cliprithm.png"
          install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"

          cat > "$srcdir/$pkgname.desktop" <<'EOF'
        [Desktop Entry]
        Type=Application
        Name=Cliprithm
        Comment=Smart video silence remover and clip editor
        Exec=cliprithm
        Icon=cliprithm
        Categories=AudioVideo;AudioVideoEditing;Video;
        Terminal=false
        StartupWMClass=cliprithm
        EOF

          install -Dm644 "$srcdir/$pkgname.desktop" "$pkgdir/usr/share/applications/$pkgname.desktop"
        }}
        """
    )


def render_srcinfo(pkgname: str, version: str, tag: str, owner: str, repo: str, sha256: str) -> str:
    src_filename = source_filename(pkgname, version)
    src_url = source_url(owner, repo, tag, version)
    lines = [
        f"pkgbase = {pkgname}",
        f"\tpkgdesc = {PKGDESC}",
        f"\tpkgver = {version}",
        "\tpkgrel = 1",
        "\turl = https://github.com/BOTOOM/Cliprithm",
        "\tarch = x86_64",
        f"\tlicense = {LICENSE}",
    ]
    for value in MAKEDEPENDS:
        lines.append(f"\tmakedepends = {value}")
    for value in DEPENDS:
        lines.append(f"\tdepends = {value}")
    for value in OPTDEPENDS:
        lines.append(f"\toptdepends = {value}")
    for value in PROVIDES:
        lines.append(f"\tprovides = {value}")
    for value in CONFLICTS:
        lines.append(f"\tconflicts = {value}")
    lines.append("\toptions = !lto")
    lines.extend(
        [
            f"\tsource = {src_filename}::{src_url}",
            f"\tsha256sums = {sha256}",
            "",
            f"pkgname = {pkgname}",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    args = parse_args()
    pkgname = "cliprithm"
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    tarball_url = source_url(args.owner, args.repo, args.tag, args.version)
    sha256 = sha256_for_url(tarball_url)

    pkgbuild = render_pkgbuild(pkgname, args.version, args.tag, args.owner, args.repo, args.maintainer, sha256)
    srcinfo = render_srcinfo(pkgname, args.version, args.tag, args.owner, args.repo, sha256)

    (output_dir / "PKGBUILD").write_text(pkgbuild, encoding="utf-8")
    (output_dir / ".SRCINFO").write_text(srcinfo, encoding="utf-8")

    print(f"Generated AUR files in {output_dir}")
    print(f"Source URL: {tarball_url}")
    print(f"sha256: {sha256}")


if __name__ == "__main__":
    main()
