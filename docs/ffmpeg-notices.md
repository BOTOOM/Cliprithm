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

## Runtime strategy

Cliprithm keeps FFmpeg and FFprobe as its cross-platform media engine. FFprobe is used
for metadata and codec inspection. Export and preview jobs request hardware decoding and
encoding when the runtime advertises a compatible backend, then retry with software
processing if the driver or filter graph rejects the hardware path.

Project previews use cached, low-resolution H.264 proxy assets and generate a short
window around the playhead. A proxy manifest records the source path, size, and
modification timestamp so stale proxies are regenerated. Cut-only exports can use
stream copy when the source and output containers/codecs are compatible; speed changes,
scaling, filters, and multi-segment compositions continue through the re-encode path.
