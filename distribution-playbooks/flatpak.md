# Flatpak

## Current repo state

- Initial scaffold added at `packaging/flatpak/com.botom.cliprithm.yml`
- Shared desktop/appstream metadata added under `packaging/linux/`
- The manifest injects a `flatpak` runtime channel so the app switches to **store-managed updates**

## Update behavior

- Flatpak installs should not self-update via GitHub.
- The app can check the published version through the public **Flathub appstream API** and, if a newer build exists, point the user back to Flatpak / Flathub.
- The app should point users back to Flathub / Flatpak with:

```bash
flatpak update com.botom.cliprithm
```

- Actual availability still depends on Flathub publication/review timing.

## Important considerations

1. Review whether `--filesystem=home` can be narrowed down further once the real export/import workflow is tested under sandboxing.
2. Confirm the SDK/runtime versions and Rust/Node extensions against the builder environment you choose.
3. Validate SQLite/log paths and portal behavior inside the sandbox before shipping.
