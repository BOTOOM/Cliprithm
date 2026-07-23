# FFmpeg and FFprobe notices

Cliprithm distributes FFmpeg and FFprobe binaries with official application artifacts.

The binaries are third-party components and remain licensed under the licenses selected
by their builds. The exact license and configuration are reported by each binary's
`-version` output and must be preserved when rebuilding or replacing a sidecar.

For release verification, both binaries are executed with `-version` from the packaged
artifact. Do not replace a release sidecar with a locally built binary unless its
license, enabled components, architecture, and redistribution terms have been checked.

The source packages used by this repository are `ffmpeg-static` and `ffprobe-static`.
Their package metadata and the included FFmpeg notices should be retained in release
artifacts according to the applicable redistribution terms.
