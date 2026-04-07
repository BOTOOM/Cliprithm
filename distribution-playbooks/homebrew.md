# Homebrew Cask

## Scope

Homebrew is relevant mainly for macOS users, but it can still improve discoverability for desktop installs.

## Recommended approach

- Use a Homebrew Cask once macOS release artifacts are consistently published.
- Point the cask to the signed `.dmg` or `.app.tar.gz` artifact instead of trying to adapt Linux packages.
- Keep auto-update behavior aligned with the platform package expectations; users may prefer Homebrew-managed upgrades instead of the in-app updater.

## Suggested next step

Wait until macOS release automation is stable, then add a separate cask repo or upstream tap strategy.
