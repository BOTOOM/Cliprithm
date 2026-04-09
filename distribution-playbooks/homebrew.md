# Homebrew Cask

## Current repo state

- A Homebrew Cask template now lives at `packaging/homebrew/cliprithm.rb.template`
- The intended behavior for this channel is **store-managed updates**
- Official reference: <https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap>

## Recommended release model

Use a **custom tap first**. It gives you full control, is much simpler than waiting for inclusion in `homebrew-cask`, and matches your current ownership model.

## Step by step for first publication

1. On a macOS machine with Homebrew installed, create the tap:

```bash
brew tap-new BOTOOM/homebrew-tap
brew install gh
gh repo create BOTOOM/homebrew-tap --push --public --source "$(brew --repository BOTOOM/homebrew-tap)"
```

2. Build the macOS release artifact that the cask will distribute. For your current custom-tap flow, use these build-time variables:

```bash
CLIPRITHM_DISTRIBUTION_CHANNEL=homebrew \
CLIPRITHM_UPDATE_STRATEGY=store-managed \
CLIPRITHM_PACKAGE_NAME=cliprithm \
CLIPRITHM_STORE_NAME=Homebrew \
CLIPRITHM_STORE_URL=https://github.com/BOTOOM/homebrew-tap \
CLIPRITHM_STORE_INSTRUCTIONS='brew upgrade --cask cliprithm' \
CLIPRITHM_VERSION_SOURCE_TYPE=homebrew-cask-ruby \
CLIPRITHM_VERSION_SOURCE_URL=https://raw.githubusercontent.com/BOTOOM/homebrew-tap/main/Casks/cliprithm.rb \
npm run tauri build
```

3. Publish the signed `.dmg` files in a GitHub Release.
4. Copy `packaging/homebrew/cliprithm.rb.template` into your tap as `Casks/cliprithm.rb` and replace:
   - `{{VERSION}}`
   - `{{ARM64_SHA256}}`
   - `{{INTEL_SHA256}}`
5. Commit and push the cask update to the tap repository.
6. Test installation on a clean macOS environment:

```bash
brew install --cask BOTOOM/homebrew-tap/cliprithm
open /Applications/Cliprithm.app
```

7. Confirm the app opens, processes media correctly, exposes diagnostics, and points users to:

```bash
brew upgrade --cask cliprithm
```

## GitHub configuration

### If the tap lives in its own repository

- `HOMEBREW_TAP_GITHUB_TOKEN` - **repo convention** for a GitHub token or PAT with `contents: write` on the tap repository, so this main repo can update `BOTOOM/homebrew-tap`.
- `HOMEBREW_TAP_REPOSITORY=BOTOOM/homebrew-tap`
- `HOMEBREW_CASK_PATH=Casks/cliprithm.rb`

### If you work directly inside the tap repository

- No extra store secret is required beyond the normal GitHub token available to that repository's own workflows.

## Optional path: official Homebrew Cask later

If Cliprithm is eventually accepted into the official Homebrew Cask repository, switch the version check to:

- `CLIPRITHM_VERSION_SOURCE_TYPE=homebrew-cask-json`
- `CLIPRITHM_VERSION_SOURCE_URL=https://formulae.brew.sh/api/cask/cliprithm.json`

## Step by step for later releases

1. Publish the new macOS release artifacts first.
2. Update `Casks/cliprithm.rb` in your tap with the new version, URLs, and SHA256 values.
3. Push the tap change.
4. Users receive the update through normal Homebrew flow, and the app only notifies them that a newer cask is available.

## User-facing update command

```bash
brew upgrade --cask cliprithm
```

## Remaining work

1. Decide the final tap repository URL.
2. Fill the cask template placeholders with real version + SHA values during release.
3. Validate macOS release naming so the cask URL matches the actual artifact names.
