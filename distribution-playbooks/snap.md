# Snap

## Current repo state

- Initial scaffold added at `packaging/snap/snapcraft.yaml`
- Runtime channel wrapper added at `packaging/snap/command-chain/cliprithm-env`
- The app channel is set to `snap` with **store-managed updates**

## Update behavior

- Snap installs should **not self-update** through the GitHub updater.
- The app can check the latest published version through the public **Snap Store API** and, if it finds a newer release, point the user back to Snap.
- The app should guide users back to Snap with:

```bash
sudo snap refresh cliprithm
```

- Actual update delivery still depends on Snap Store publication/review timing.

## Open questions

1. Whether strict confinement is sufficient for every local-media workflow or if classic confinement becomes necessary.
2. Whether FFmpeg should stay external or become part of the snapped runtime story.
3. Which additional interfaces may be required after real-world store review/testing.
