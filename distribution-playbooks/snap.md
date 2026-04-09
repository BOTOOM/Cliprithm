# Snap

## Current repo state

- Snap manifest: `packaging/snap/snapcraft.yaml`
- Runtime wrapper: `packaging/snap/command-chain/cliprithm-env`
- Build helper: `scripts/build_snap.sh`
- NPM entry points:
  - `npm run build:snap`
  - `npm run build:snap:docker`
- Docker build output: `dist/cliprithm_<version>_amd64.snap`
- Official references:
  - `snapcraft pack`: <https://documentation.ubuntu.com/snapcraft/latest/reference/commands/pack/>
  - Register a snap: <https://documentation.ubuntu.com/snapcraft/latest/how-to/publishing/register-a-snap/>
  - Publish a snap: <https://documentation.ubuntu.com/snapcraft/latest/how-to/publishing/publish-a-snap/>
  - Authentication and exported credentials: <https://documentation.ubuntu.com/snapcraft/latest/how-to/publishing/authenticate/>

## Update behavior

- Snap installs should **not self-update** through the GitHub updater.
- The app can check the latest published version through the public **Snap Store API** and, if it finds a newer release, point the user back to Snap.
- The app should guide users back to Snap with:

```bash
sudo snap refresh cliprithm
```

## From zero on Manjaro with Docker

This is the recommended path for local builds on Manjaro / Arch.

1. Install and enable Docker on the host.

```bash
sudo pacman -S docker
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
# close the session and log back in so the docker group applies
```

2. Restore JavaScript dependencies and build the snap.

```bash
npm ci
npm run build:snap:docker
```

3. Fix artifact ownership if Docker created it as `root`.

```bash
sudo chown $USER:$USER dist/*.snap
```

What the helper does:

- Uses `myroslavmail/snapcraft:stable` because the old `snapcore/snapcraft:*` Docker Hub images are too old for `core24` + `gnome`
- Mounts the repo in the container and runs the build from `packaging/snap/`
- Bootstraps current **Node.js** and **Rust** toolchains inside the Snap build environment
- Forces software GL rendering and disables WebKit accelerated compositing inside the snap to avoid Mesa/EGL crashes seen on Manjaro
- Bundles `ffmpeg` and `ffprobe` inside the snap so media analysis/export works under strict confinement
- Moves the final `.snap` into `dist/`

## Install and test locally on Manjaro

To sideload the built snap on Manjaro:

1. Install `snapd` from AUR.

```bash
# choose one workflow you already use:
pamac build snapd
# or
yay -S snapd
```

2. Enable the daemon.

```bash
sudo systemctl enable --now snapd.socket
```

3. If `/snap` does not exist, create the standard symlink.

```bash
if [ ! -e /snap ]; then
  sudo ln -s /var/lib/snapd/snap /snap
fi
```

4. Start a new session once so the snap paths from `/etc/profile.d/snapd.sh` are applied.

5. Install the locally built package:

```bash
sudo snap install --dangerous dist/cliprithm_*.snap
```

6. Run and inspect it:

```bash
snap list cliprithm
snap connections cliprithm
snap run cliprithm
```

7. Reinstall a newer local build:

```bash
sudo snap remove cliprithm
sudo snap install --dangerous dist/cliprithm_*.snap
```

If you use AppArmor on Manjaro, enable it as well so confinement is closer to Ubuntu:

```bash
sudo systemctl enable --now apparmor.service
sudo systemctl enable --now snapd.apparmor.service
```

## Publish cases

### First publication

Use this only if `cliprithm` is not yet registered/published in Snapcraft.

1. Create or reuse the Ubuntu One / Snapcraft publisher account.
2. Reserve the name `cliprithm` in Snapcraft.

```bash
snapcraft login
snapcraft whoami
snapcraft register cliprithm
snapcraft names
```

If `snapcraft upload` returns `resource-not-found: Snap not found for name=cliprithm`, the name is not fully registered in the store yet. Finish `snapcraft register cliprithm` first and, if the name enters manual review, wait until it appears in `snapcraft names`.

3. Build and test locally:

```bash
npm ci
npm run build:snap:docker
sudo chown $USER:$USER dist/*.snap
```

4. Authenticate and upload the first release:

```bash
snapcraft upload --release=stable dist/cliprithm_*.snap
```

5. Verify the published snap from the store on a clean machine:

```bash
sudo snap install cliprithm
snap run cliprithm
```

### Next publication to stable

This is your current case once the snap already exists in the store.

1. Bump the app version in:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `packaging/snap/snapcraft.yaml`
2. Build and test locally:

```bash
npm ci
npm run build:snap:docker
sudo chown $USER:$USER dist/*.snap
sudo snap remove cliprithm 2>/dev/null || true
sudo snap install --dangerous dist/cliprithm_*.snap
snap run cliprithm
```

3. Publish the next stable revision:

```bash
snapcraft login
snapcraft whoami
snapcraft upload --release=stable dist/cliprithm_*.snap
```

### Staged publication with candidate or beta

Use this when you want a safer rollout before `stable`.

```bash
snapcraft upload --release=candidate dist/cliprithm_*.snap
# or
snapcraft upload --release=beta dist/cliprithm_*.snap
```

After validating that revision, promote it to stable:

```bash
snapcraft status cliprithm
snapcraft release cliprithm <revision> stable
```

### Remote builders instead of local Docker

If at some point you prefer Launchpad remote builders:

```bash
snapcraft login
npm run build:snap -- --remote
```

The helper prepares the temporary top-level git workspace required by Snapcraft remote build.

## Smoke test checklist before publish

1. Open a local video
2. Detect silence
3. Preview and export
4. Open Diagnostics and confirm logs/errors are visible
5. Confirm the update banner points to `sudo snap refresh cliprithm`
6. Confirm the app starts from `snap run cliprithm`

## GitHub configuration

### Required secret

- `SNAPCRAFT_STORE_CREDENTIALS` - official Snapcraft environment variable for exported store credentials in CI/CD

Generate it from a machine where you already authenticated:

```bash
snapcraft export-login cliprithm.snapcraft.login --snaps cliprithm --channels stable
```

Store the **file contents** in the GitHub secret `SNAPCRAFT_STORE_CREDENTIALS`.

### Recommended repository variables

- `SNAP_NAME=cliprithm`
- `SNAP_RELEASE_CHANNEL=stable`

## Notes

- On non-Ubuntu hosts, `snapcraft pack --destructive-mode` directly on the host is not the recommended path for this `core24` snap; use Docker, LXD, or remote builders.
- Snap delivery stays under Snap Store control. The app should only inform users that a new version is available and tell them to run:

```bash
sudo snap refresh cliprithm
```
