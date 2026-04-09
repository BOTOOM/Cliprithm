# Flatpak

## Current repo state

- Flatpak manifest: `packaging/flatpak/com.botom.cliprithm.yml`
- Shared desktop/appstream metadata: `packaging/linux/`
- Build helper: `scripts/build_flatpak.sh`
- NPM entry points:
  - `npm run build:flatpak`
  - `npm run build:flatpak:docker`
- Docker build output: `dist/com.botom.cliprithm.flatpak`
- Official references:
  - Submission guide: <https://docs.flathub.org/docs/for-app-authors/submission>
  - GitHub Actions note: <https://docs.flathub.org/docs/for-app-authors/github-actions>
  - Verification: <https://docs.flathub.org/docs/for-app-authors/verification>

## Update behavior

- Flatpak installs should not self-update via GitHub.
- The app can check the published version through the public **Flathub appstream API** and, if a newer build exists, point the user back to Flatpak / Flathub.
- The app should point users back to Flatpak with:

```bash
flatpak update com.botom.cliprithm
```

## From zero on Manjaro with Docker

This is the recommended path for local Flatpak packaging on Manjaro / Arch.

1. Install and enable Docker.

```bash
sudo pacman -S docker
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
# close the session and log back in so the docker group applies
```

2. Restore dependencies and build the Flatpak bundle.

```bash
npm ci
npm run build:flatpak:docker
```

3. Fix artifact ownership if Docker created it as `root`.

```bash
sudo chown $USER:$USER dist/*.flatpak
```

What the helper does:

- Uses `ubuntu:24.04` as a lighter base image
- Installs `flatpak`, `flatpak-builder`, and `elfutils` inside the container
- Reuses the Docker volume `cliprithm-flatpak-cache` for runtimes and SDK caches
- Enables network access in the build sandbox for the module build
- Exports a real Flatpak repo and creates `dist/com.botom.cliprithm.flatpak`

To wipe the Flatpak Docker cache and start clean:

```bash
docker volume rm cliprithm-flatpak-cache
```

## Install and test locally on Manjaro

1. Install Flatpak on the host:

```bash
sudo pacman -S flatpak
```

2. Add Flathub if it is not already configured:

```bash
flatpak remote-add --if-not-exists --user flathub https://dl.flathub.org/repo/flathub.flatpakrepo
```

3. Install the locally built bundle:

```bash
flatpak install --user dist/com.botom.cliprithm.flatpak
```

4. Run it:

```bash
flatpak run com.botom.cliprithm
```

5. Reinstall a newer local build:

```bash
flatpak install --user --reinstall dist/com.botom.cliprithm.flatpak
```

6. Remove the local test install:

```bash
flatpak uninstall --user com.botom.cliprithm
```

## Publish cases

### First publication on Flathub

For a new app, Flathub does **not** publish from your bundle directly. The correct flow is:

1. Build and validate locally from this repo:

```bash
npm ci
npm run build:flatpak:docker
sudo chown $USER:$USER dist/*.flatpak
flatpak install --user dist/com.botom.cliprithm.flatpak
flatpak run com.botom.cliprithm
```

2. Run the linter if you have `org.flatpak.Builder` locally:

```bash
flatpak install -y flathub org.flatpak.Builder
flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest packaging/flatpak/com.botom.cliprithm.yml
```

3. Fork `flathub/flathub`, work from the `new-pr` base branch, add the required files, and open the submission PR against `new-pr`.

4. Respond to review comments and use `bot, build` on the PR when Flathub asks for a test build.

### Later releases after the app already exists on Flathub

Once the app has its maintained Flathub repository, the normal release flow is:

1. Update the maintained Flathub manifest/repo with the new version/source information.
2. Let Flathub build and publish through its normal review/build process.
3. After publication, the app should guide users to:

```bash
flatpak update com.botom.cliprithm
```

Important: this repo is excellent for **building and validating locally**, but Flathub publication still happens through the Flathub-managed manifest/repository workflow.

## Smoke test checklist before publish

1. Install the generated bundle locally
2. Start the app with `flatpak run com.botom.cliprithm`
3. Open a local video
4. Detect silence
5. Preview and export
6. Confirm logs/diagnostics still work in the sandbox
7. Confirm the update guidance points to `flatpak update com.botom.cliprithm`

## GitHub configuration

### What is officially required

- For a **new Flathub submission**, there is no mandatory store secret in this repo.
- For later automation on your own repos, Flathub points to the official `flatpak/flatpak-github-actions` project.

### Recommended repository variables

- `FLATPAK_APP_ID=com.botom.cliprithm`
- `FLATHUB_REPO=flathub/com.botom.cliprithm`

### Optional secret for future automation

- `FLATHUB_GITHUB_TOKEN` - repo convention if you later automate commits/PRs into a Flathub-maintained repository or fork

## Important considerations

1. `org.gnome.Platform 47` / `org.gnome.Sdk 47` are currently end-of-life according to Flatpak output, so plan a runtime bump before shipping broadly.
2. Review whether `--filesystem=home` can be narrowed down once the real import/export workflow is fully validated under sandboxing.
3. Validate SQLite/log paths and portal behavior inside the Flatpak sandbox before publishing.
