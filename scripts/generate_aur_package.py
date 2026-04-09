#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import textwrap
import time
import urllib.request
from pathlib import Path
from urllib.parse import unquote, urlparse


URL = "https://github.com/BOTOOM/Cliprithm"
LICENSE = "MIT"
SOURCE_PKGDESC = "Smart desktop video silence remover and clip editor built with Tauri and FFmpeg"
BIN_PKGDESC = "Prebuilt Cliprithm AppImage packaged for Arch Linux"
RUNTIME_DEPENDS = [
    "ffmpeg",
    "glibc",
    "gtk3",
    "hicolor-icon-theme",
    "libayatana-appindicator",
    "webkit2gtk-4.1",
]
SOURCE_MAKEDEPENDS = [
    "cargo",
    "nodejs",
    "npm",
    "patchelf",
    "rust",
]
OPTDEPENDS = [
    "xdg-desktop-portal: improved desktop integration for file dialogs and portals",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate AUR packaging files for Cliprithm.")
    parser.add_argument("--version", required=True, help="Release version, e.g. 1.1.1")
    parser.add_argument("--tag", required=True, help="Git tag, e.g. cliprithm-v1.1.1")
    parser.add_argument(
        "--package",
        choices=("source", "bin"),
        default="source",
        help="Which AUR package variant to generate",
    )
    parser.add_argument("--output-dir", required=True, help="Directory where PKGBUILD and .SRCINFO are written")
    parser.add_argument("--pkgrel", type=int, default=1, help="Arch package release number")
    parser.add_argument("--owner", default="BOTOOM", help="GitHub owner")
    parser.add_argument("--repo", default="Cliprithm", help="GitHub repository")
    parser.add_argument("--package-name", help="Override the AUR package name")
    parser.add_argument("--artifact-url", help="Override the bin package AppImage URL")
    parser.add_argument("--icon-url", help="Override the icon URL used by the bin package")
    parser.add_argument("--license-url", help="Override the license URL used by the bin package")
    parser.add_argument(
        "--maintainer",
        default="Edwar Diaz <edwardiaz.dev@gmail.com>",
        help="Maintainer line for PKGBUILD",
    )
    return parser.parse_args()


def quote_array(values: list[str]) -> str:
    return "(" + " ".join(f"'{value}'" for value in values) + ")"


def quote_source_array(entries: list[tuple[str, str]]) -> str:
    return "(" + " ".join(f'"{name}::{url}"' for name, url in entries) + ")"


def source_root(repo: str, tag: str) -> str:
    return f"{repo}-{tag}"


def source_tarball_url(owner: str, repo: str, tag: str) -> str:
    return f"https://github.com/{owner}/{repo}/archive/refs/tags/{tag}.tar.gz"


def source_filename(pkgname: str, version: str) -> str:
    return f"{pkgname}-{version}.tar.gz"


def release_appimage_url(owner: str, repo: str, tag: str, version: str) -> str:
    return f"https://github.com/{owner}/{repo}/releases/download/{tag}/Cliprithm_{version}_amd64.AppImage"


def release_icon_url(owner: str, repo: str, tag: str) -> str:
    return f"https://raw.githubusercontent.com/{owner}/{repo}/{tag}/src-tauri/icons/128x128.png"


def release_license_url(owner: str, repo: str, tag: str) -> str:
    return f"https://raw.githubusercontent.com/{owner}/{repo}/{tag}/LICENSE"


def iter_url_bytes(url: str):
    parsed = urlparse(url)

    if parsed.scheme == "file":
        path = Path(unquote(parsed.path))
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk
        return

    request = urllib.request.Request(url, headers={"User-Agent": "cliprithm-aur-generator"})
    with urllib.request.urlopen(request) as response:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            yield chunk


def sha256_for_url(url: str) -> str:
    last_error: Exception | None = None

    for attempt in range(1, 6):
        try:
            digest = hashlib.sha256()
            for chunk in iter_url_bytes(url):
                digest.update(chunk)
            return digest.hexdigest()
        except Exception as error:  # noqa: BLE001
            last_error = error
            if attempt == 5:
                break
            time.sleep(attempt * 2)

    raise RuntimeError(f"Failed to calculate sha256 for {url}") from last_error


def maybe_array_line(name: str, values: list[str]) -> str:
    return f"{name}={quote_array(values)}\n" if values else ""


def maybe_srcinfo_lines(prefix: str, values: list[str]) -> list[str]:
    return [f"\t{prefix} = {value}" for value in values]


def render_source_pkgbuild(
    pkgname: str,
    version: str,
    pkgrel: int,
    tag: str,
    owner: str,
    repo: str,
    maintainer: str,
    source_sha256: str,
) -> str:
    src_filename = source_filename(pkgname, version)
    src_url = source_tarball_url(owner, repo, tag)
    src_root = source_root(repo, tag)

    return textwrap.dedent(
        f"""\
        # Maintainer: {maintainer}

        pkgname={pkgname}
        pkgver={version}
        pkgrel={pkgrel}
        pkgdesc="{SOURCE_PKGDESC}"
        arch=('x86_64')
        url="{URL}"
        license=('{LICENSE}')
        depends={quote_array(RUNTIME_DEPENDS)}
        makedepends={quote_array(SOURCE_MAKEDEPENDS)}
        optdepends={quote_array(OPTDEPENDS)}
        provides=('cliprithm')
        conflicts=('cliprithm-bin')
        source=("{src_filename}::{src_url}")
        sha256sums=('{source_sha256}')
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
          npm run tauri build -- --no-bundle --ci --no-sign
        }}

        package() {{
          cd "{src_root}"

          install -Dm755 "$srcdir/target/release/cliprithm" "$pkgdir/usr/lib/cliprithm/cliprithm"
          install -Dm644 "src-tauri/icons/128x128.png" "$pkgdir/usr/share/icons/hicolor/128x128/apps/cliprithm.png"
          install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"

          cat > "$srcdir/cliprithm" <<'EOF'
        #!/usr/bin/env bash
        set -euo pipefail
        export CLIPRITHM_DISTRIBUTION_CHANNEL=aur
        export CLIPRITHM_UPDATE_STRATEGY=store-managed
        export CLIPRITHM_PACKAGE_NAME=cliprithm
        export CLIPRITHM_STORE_NAME=AUR
        export CLIPRITHM_STORE_URL=https://aur.archlinux.org/packages/cliprithm
        export CLIPRITHM_STORE_INSTRUCTIONS='yay -Syu cliprithm'
        export CLIPRITHM_VERSION_SOURCE_TYPE=aur-rpc
        export CLIPRITHM_VERSION_SOURCE_URL=https://aur.archlinux.org/rpc/v5/info/cliprithm
        exec /usr/lib/cliprithm/cliprithm "$@"
        EOF
          install -Dm755 "$srcdir/cliprithm" "$pkgdir/usr/bin/cliprithm"

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


def render_bin_pkgbuild(
    pkgname: str,
    version: str,
    pkgrel: int,
    maintainer: str,
    artifact_name: str,
    artifact_url: str,
    icon_url: str,
    license_url: str,
    sha256sums: list[str],
) -> str:
    sources = [
        (artifact_name, artifact_url),
        ("cliprithm.png", icon_url),
        ("LICENSE", license_url),
    ]

    return textwrap.dedent(
        f"""\
        # Maintainer: {maintainer}

        pkgname={pkgname}
        pkgver={version}
        pkgrel={pkgrel}
        pkgdesc="{BIN_PKGDESC}"
        arch=('x86_64')
        url="{URL}"
        license=('{LICENSE}')
        depends={quote_array(RUNTIME_DEPENDS)}
        optdepends={quote_array(OPTDEPENDS)}
        provides=('cliprithm')
        conflicts=('cliprithm')
        source={quote_source_array(sources)}
        sha256sums={quote_array(sha256sums)}
        noextract=('{artifact_name}')

        package() {{
          install -Dm755 "$srcdir/{artifact_name}" "$pkgdir/opt/cliprithm/cliprithm.AppImage"
          install -Dm644 "$srcdir/cliprithm.png" "$pkgdir/usr/share/icons/hicolor/128x128/apps/cliprithm.png"
          install -Dm644 "$srcdir/LICENSE" "$pkgdir/usr/share/licenses/$pkgname/LICENSE"

          cat > "$srcdir/cliprithm" <<'EOF'
        #!/usr/bin/env bash
        set -euo pipefail
        export CLIPRITHM_DISTRIBUTION_CHANNEL=aur-bin
        export CLIPRITHM_UPDATE_STRATEGY=store-managed
        export CLIPRITHM_PACKAGE_NAME=cliprithm-bin
        export CLIPRITHM_STORE_NAME=AUR
        export CLIPRITHM_STORE_URL=https://aur.archlinux.org/packages/cliprithm-bin
        export CLIPRITHM_STORE_INSTRUCTIONS='yay -Syu cliprithm-bin'
        export CLIPRITHM_VERSION_SOURCE_TYPE=aur-rpc
        export CLIPRITHM_VERSION_SOURCE_URL=https://aur.archlinux.org/rpc/v5/info/cliprithm-bin
        export APPIMAGE_EXTRACT_AND_RUN=1
        export WEBKIT_DISABLE_DMABUF_RENDERER=1
        export WEBKIT_DISABLE_COMPOSITING_MODE=1
        export LIBGL_ALWAYS_SOFTWARE=1
        exec /opt/cliprithm/cliprithm.AppImage "$@"
        EOF
          install -Dm755 "$srcdir/cliprithm" "$pkgdir/usr/bin/cliprithm"

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


def render_source_srcinfo(
    pkgname: str,
    version: str,
    pkgrel: int,
    owner: str,
    repo: str,
    tag: str,
    source_sha256: str,
) -> str:
    src_filename = source_filename(pkgname, version)
    src_url = source_tarball_url(owner, repo, tag)
    lines = [
        f"pkgbase = {pkgname}",
        f"\tpkgdesc = {SOURCE_PKGDESC}",
        f"\tpkgver = {version}",
        f"\tpkgrel = {pkgrel}",
        f"\turl = {URL}",
        "\tarch = x86_64",
        f"\tlicense = {LICENSE}",
        *maybe_srcinfo_lines("makedepends", SOURCE_MAKEDEPENDS),
        *maybe_srcinfo_lines("depends", RUNTIME_DEPENDS),
        *maybe_srcinfo_lines("optdepends", OPTDEPENDS),
        "\tprovides = cliprithm",
        "\tconflicts = cliprithm-bin",
        "\toptions = !lto",
        f"\tsource = {src_filename}::{src_url}",
        f"\tsha256sums = {source_sha256}",
        "",
        f"pkgname = {pkgname}",
    ]
    return "\n".join(lines) + "\n"


def render_bin_srcinfo(
    pkgname: str,
    version: str,
    pkgrel: int,
    artifact_name: str,
    artifact_url: str,
    icon_url: str,
    license_url: str,
    sha256sums: list[str],
) -> str:
    sources = [
        f"{artifact_name}::{artifact_url}",
        f"cliprithm.png::{icon_url}",
        f"LICENSE::{license_url}",
    ]
    lines = [
        f"pkgbase = {pkgname}",
        f"\tpkgdesc = {BIN_PKGDESC}",
        f"\tpkgver = {version}",
        f"\tpkgrel = {pkgrel}",
        f"\turl = {URL}",
        "\tarch = x86_64",
        f"\tlicense = {LICENSE}",
        *maybe_srcinfo_lines("depends", RUNTIME_DEPENDS),
        *maybe_srcinfo_lines("optdepends", OPTDEPENDS),
        "\tprovides = cliprithm",
        "\tconflicts = cliprithm",
        f"\tnoextract = {artifact_name}",
        *[f"\tsource = {source}" for source in sources],
        *[f"\tsha256sums = {sha256}" for sha256 in sha256sums],
        "",
        f"pkgname = {pkgname}",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.package == "source":
        pkgname = args.package_name or "cliprithm"
        tarball_url = source_tarball_url(args.owner, args.repo, args.tag)
        source_sha256 = sha256_for_url(tarball_url)

        pkgbuild = render_source_pkgbuild(
            pkgname,
            args.version,
            args.pkgrel,
            args.tag,
            args.owner,
            args.repo,
            args.maintainer,
            source_sha256,
        )
        srcinfo = render_source_srcinfo(
            pkgname,
            args.version,
            args.pkgrel,
            args.owner,
            args.repo,
            args.tag,
            source_sha256,
        )

        source_summary = [("Source URL", tarball_url), ("sha256", source_sha256)]
    else:
        pkgname = args.package_name or "cliprithm-bin"
        artifact_url = args.artifact_url or release_appimage_url(
            args.owner, args.repo, args.tag, args.version
        )
        icon_url = args.icon_url or release_icon_url(args.owner, args.repo, args.tag)
        license_url = args.license_url or release_license_url(args.owner, args.repo, args.tag)
        artifact_name = Path(urlparse(artifact_url).path).name or f"Cliprithm_{args.version}_amd64.AppImage"
        sha256sums = [
            sha256_for_url(artifact_url),
            sha256_for_url(icon_url),
            sha256_for_url(license_url),
        ]

        pkgbuild = render_bin_pkgbuild(
            pkgname,
            args.version,
            args.pkgrel,
            args.maintainer,
            artifact_name,
            artifact_url,
            icon_url,
            license_url,
            sha256sums,
        )
        srcinfo = render_bin_srcinfo(
            pkgname,
            args.version,
            args.pkgrel,
            artifact_name,
            artifact_url,
            icon_url,
            license_url,
            sha256sums,
        )

        source_summary = [
            ("Artifact URL", artifact_url),
            ("Icon URL", icon_url),
            ("License URL", license_url),
            ("Artifact sha256", sha256sums[0]),
        ]

    (output_dir / "PKGBUILD").write_text(pkgbuild, encoding="utf-8")
    (output_dir / ".SRCINFO").write_text(srcinfo, encoding="utf-8")

    print(f"Generated {args.package} AUR files in {output_dir}")
    for label, value in source_summary:
        print(f"{label}: {value}")


if __name__ == "__main__":
    main()
