# Homebrew Cask

## Current repo state

- A Homebrew Cask template now lives at `packaging/homebrew/cliprithm.rb.template`
- The intended behavior for this channel is **store-managed updates**

## Recommended approach

- Use a dedicated Homebrew-oriented macOS artifact build with:
  - `CLIPRITHM_DISTRIBUTION_CHANNEL=homebrew`
  - `CLIPRITHM_UPDATE_STRATEGY=store-managed`
- For version checks, prefer one of these build-time values:
  - Official Homebrew Cask: `CLIPRITHM_VERSION_SOURCE_TYPE=homebrew-cask-json`
  - Custom tap: `CLIPRITHM_VERSION_SOURCE_TYPE=homebrew-cask-ruby`
- Point the cask to the signed `.dmg` artifact that matches the published macOS build.
- Keep updates aligned with Homebrew expectations instead of using the GitHub in-app updater.
- The app can check the newest published Homebrew version and still send the user back to `brew upgrade --cask cliprithm` instead of self-updating.

## User-facing update command

```bash
brew upgrade --cask cliprithm
```

## Remaining work

1. Decide the final tap repository URL.
2. Fill the cask template placeholders with real version + SHA values during release.
3. Validate macOS release naming so the cask URL matches the actual artifact names.
