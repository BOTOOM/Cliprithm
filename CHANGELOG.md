# Changelog

## [1.4.1](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.4.0...cliprithm-v1.4.1) (2026-06-24)


### Bug Fixes

* **ci:** harden release asset rebuild workflow ([c965d4c](https://github.com/BOTOOM/Cliprithm/commit/c965d4ca5a6646bbbda1e441f42986db8db9f680))
* **ci:** locate AppImage from target bundle path ([a294f80](https://github.com/BOTOOM/Cliprithm/commit/a294f80b5707877bd43e45074aeff7eeb438db61))
* **ci:** resolve Linux AppImage purge path ([ad91725](https://github.com/BOTOOM/Cliprithm/commit/ad9172591bb62e9ddef68ccae3eab77831f915e3))

## [1.4.0](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.3.6...cliprithm-v1.4.0) (2026-06-24)


### Features

* **desktop:** improve ffmpeg guidance and localized video workflows ([674a277](https://github.com/BOTOOM/Cliprithm/commit/674a2778c48f606a26d6c98324b19d21f69463ef))
* **editor:** surface silence reanalysis progress ([09971e4](https://github.com/BOTOOM/Cliprithm/commit/09971e49bd00ff863b0fe719458e76956a47f232))
* **export:** add custom framing controls and still previews ([b4dc1e5](https://github.com/BOTOOM/Cliprithm/commit/b4dc1e5b3caa73312272dfeeba5992c41550bac3))
* improve desktop video workflow, export framing, and processing feedback ([18d5468](https://github.com/BOTOOM/Cliprithm/commit/18d5468961b2dfbc8cc4990e56d6d439a5d95deb))
* **processing:** stream silence detection progress ([7817345](https://github.com/BOTOOM/Cliprithm/commit/78173455d1a696baccb055e7ab2b837180948be5))

## [1.3.5](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.3.4...cliprithm-v1.3.5) (2026-06-24)


### Bug Fixes

* **aur:** add automatic X11 fallback to generated AUR launchers ([6928e65](https://github.com/BOTOOM/Cliprithm/commit/6928e6567575da623acfb40845d0830d6b7248fb))
* **linux:** force GDK_BACKEND=x11 by default on Linux to bypass Wayland EGL bugs ([dcecc9a](https://github.com/BOTOOM/Cliprithm/commit/dcecc9a7b04a31360aab153b8a4ae41334d72a12))
* **linux:** resolve WebKitGTK bad EGL display abort crash ([b694535](https://github.com/BOTOOM/Cliprithm/commit/b694535ad27225d93e3534894348c4c85b27f80c))

## [1.3.4](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.3.3...cliprithm-v1.3.4) (2026-06-23)


### Bug Fixes

* **ci:** copy hidden files explicitly when publishing to AUR ([b26b449](https://github.com/BOTOOM/Cliprithm/commit/b26b449a1f4ba7f7225e460246634a984546a643))

## [1.3.3](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.3.2...cliprithm-v1.3.3) (2026-06-19)


### Bug Fixes

* **build:** align Tauri pnpm tooling ([b6d2372](https://github.com/BOTOOM/Cliprithm/commit/b6d237239b74aac578c3e706f196f640a47f9c7f))
* **build:** reuse prebundled ffmpeg sidecars ([d9204a1](https://github.com/BOTOOM/Cliprithm/commit/d9204a1b9cefc13f8ac9f4f3209be8900fd8e2a4))
* **ci:** ensure release_created evaluates to a boolean ([eeca7b8](https://github.com/BOTOOM/Cliprithm/commit/eeca7b8d9e60a36540fde7af1afde86856f508ad))
* **ci:** fix release_created condition in build job ([d1ffc48](https://github.com/BOTOOM/Cliprithm/commit/d1ffc489c59dc0237a10acbd1cc34e92af7c40bd))

## [1.3.2](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.3.1...cliprithm-v1.3.2) (2026-06-06)


### Bug Fixes

* **aur:** harden package generation ([decde67](https://github.com/BOTOOM/Cliprithm/commit/decde670b1f46f5ca82e44b18c64d2e9b77af64e))

## [1.3.1](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.3.0...cliprithm-v1.3.1) (2026-05-10)


### Bug Fixes

* bundle ffmpeg/ffprobe in Windows+macOS installer and add retry UX for missing ffmpeg ([ea4d9cf](https://github.com/BOTOOM/Cliprithm/commit/ea4d9cf4d92bf5ec8ad340c071f36bf1a0a6eca0))
* bundle FFmpeg/FFprobe sidecars in Windows & macOS installers; add retry UX when missing ([fcd8074](https://github.com/BOTOOM/Cliprithm/commit/fcd8074fa74317cb3df3f799ff428d8f7c756b70))

## [1.3.0](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.2.2...cliprithm-v1.3.0) (2026-05-06)


### Features

* integrate ffmpeg and ffprobe binaries, enhance media processing capabilities ([f60edc4](https://github.com/BOTOOM/Cliprithm/commit/f60edc4374f21ddfbc0fcbc2aa1df1fe23d7fb22))
* integrate FFmpeg and FFprobe support ([fd049b1](https://github.com/BOTOOM/Cliprithm/commit/fd049b14c8d7abb3b3290b9070d6841341885c6b))

## [1.2.2](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.2.1...cliprithm-v1.2.2) (2026-04-29)


### Bug Fixes

* **editor:** avoid abort-related fatal errors during rapid playback/seek ([69db04c](https://github.com/BOTOOM/Cliprithm/commit/69db04c1b80efda50d91b8f32e04e4d1512018c2))

## [1.2.1](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.2.0...cliprithm-v1.2.1) (2026-04-09)


### Bug Fixes

* **release:** publish aur bin and harden appimage startup ([0032556](https://github.com/BOTOOM/Cliprithm/commit/0032556e3739d92a93f28bab2a0fbdceffe35185))

## [1.2.0](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.1.2...cliprithm-v1.2.0) (2026-04-09)


### Features

* add diagnostics and local distro tooling ([d2332cc](https://github.com/BOTOOM/Cliprithm/commit/d2332cc5c9577db26148522fc6aee90c1f69a5c4))
* add store-aware distribution updates ([705c4a2](https://github.com/BOTOOM/Cliprithm/commit/705c4a2205b13e120533f9163031b785bea16418))
* **packaging:** add docker workflows for linux packages ([4189134](https://github.com/BOTOOM/Cliprithm/commit/41891340299b201f3b8d418d992496e5f206b5de))


### Bug Fixes

* separate update behavior by platform ([504947a](https://github.com/BOTOOM/Cliprithm/commit/504947a59ab352e088c99dbe75a5ced2fbf1bfae))
* stabilize diagnostics store selectors ([44d398c](https://github.com/BOTOOM/Cliprithm/commit/44d398cb97b3e3cebcd402f59f2929d167421ba6))

## [1.1.2](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.1.1...cliprithm-v1.1.2) (2026-04-07)


### Bug Fixes

* support tauri wrapper on windows ([04e4fb6](https://github.com/BOTOOM/Cliprithm/commit/04e4fb69176ad06641bfe95f642141c334d47ad4))

## [1.1.1](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.1.0...cliprithm-v1.1.1) (2026-04-06)


### Bug Fixes

* correct aur packaging build and add cleanup script ([9b247cd](https://github.com/BOTOOM/Cliprithm/commit/9b247cd534bd529968d19f558ab916e34c658506))
* stabilize local linux tauri builds ([f15f127](https://github.com/BOTOOM/Cliprithm/commit/f15f1273413b11aff26169223ecd84954fd8bc57))
* update vite to address audit advisory ([197f7bc](https://github.com/BOTOOM/Cliprithm/commit/197f7bc6aa93de53514baef210d1c4f41b51b221))

## [1.1.0](https://github.com/BOTOOM/Cliprithm/compare/cliprithm-v1.0.0...cliprithm-v1.1.0) (2026-04-01)


### Features

* add AUR packaging automation ([ed66d48](https://github.com/BOTOOM/Cliprithm/commit/ed66d484ae35e05d07ab911dd1ac36fc9b2a99d3))

## 1.0.0 (2026-04-01)


### ⚠ BREAKING CHANGES

* rebrand from SilenCut to Cliprithm

### Features

* add a silence review step before clip editing ([5b3e155](https://github.com/BOTOOM/Cliprithm/commit/5b3e1557eb1ef94971fb4604b82f1f74aaf4f9b0))
* add About page with developer info, sponsor links, and i18n ([9f529bc](https://github.com/BOTOOM/Cliprithm/commit/9f529bc2ae284d5a49beffdc80724fe239d854f3))
* add app-wide english and spanish ui ([9074313](https://github.com/BOTOOM/Cliprithm/commit/9074313671a1ec34e714381538003db9777a2eb1))
* add Captions Beta, Settings panel, README ([fdf855c](https://github.com/BOTOOM/Cliprithm/commit/fdf855cbd7adc994a78923aed28b9575d21f326b))
* add CI/CD, auto-updater, SQLite media library, process plugin ([ee41365](https://github.com/BOTOOM/Cliprithm/commit/ee4136545d842cebcc72a4d7c6a4b154db95e59c))
* add clip-based editor workflow and runtime guards ([1b6208e](https://github.com/BOTOOM/Cliprithm/commit/1b6208ef8bbca41fdc929fb0ec0825b0ff9b85eb))
* add Cliprithm SVG logo and regenerate all icons ([38d6ced](https://github.com/BOTOOM/Cliprithm/commit/38d6ced089dd540d92bb128df39a58e8441363f3))
* add edited sequence preview mode ([8cf6249](https://github.com/BOTOOM/Cliprithm/commit/8cf62499d2e0ceb91bfd7243156c7398f267dc32))
* add structured logging system (dev=debug, release=warn only) ([82b0a7e](https://github.com/BOTOOM/Cliprithm/commit/82b0a7e05acd70a02ad2bd3aa0fee1b3f7cb82b5))
* add undo support for timeline edits ([fc2acfd](https://github.com/BOTOOM/Cliprithm/commit/fc2acfd603c10ff3a74c2f9dc97f47f7bfb93cc2))
* global playback speed control (0.25x–4x) with export support ([ede4bfa](https://github.com/BOTOOM/Cliprithm/commit/ede4bfa382e01496a28ce005689fc1678871ee57))
* improve detection review feedback and guidance ([116fd4e](https://github.com/BOTOOM/Cliprithm/commit/116fd4ed876339a2b6c7e05dd87f521b1608b93f))
* initialize SilenCut Tauri project ([6128f79](https://github.com/BOTOOM/Cliprithm/commit/6128f7989fe5cf0fd47396fcac55733e76ba79e9))
* local HTTP media server for video streaming ([a275616](https://github.com/BOTOOM/Cliprithm/commit/a275616069eea5e0cc8f52f2861aa6f03799cb22))
* non-linear speed control with manual input ([3b177ec](https://github.com/BOTOOM/Cliprithm/commit/3b177ecb8dfe30243913f39d20f58ef9b191d513))
* project persistence with auto-save and restore ([0cc20f7](https://github.com/BOTOOM/Cliprithm/commit/0cc20f7e67ec66a1fc9a36a13f60e87f149ad1bc))
* rebrand from SilenCut to Cliprithm ([9702822](https://github.com/BOTOOM/Cliprithm/commit/97028229d616a0e3ed06800021f89cb89a23a2bc))


### Bug Fixes

* add HEAD request support to media server ([03fb8d2](https://github.com/BOTOOM/Cliprithm/commit/03fb8d25568adda355c52fa60867e3cef5f4ebdf))
* add preview proxy fallback for unsupported videos ([9f8bd60](https://github.com/BOTOOM/Cliprithm/commit/9f8bd600ac36eceae0305d4c7d8855052a89acc3))
* align processing ring with reported progress ([77eeeb2](https://github.com/BOTOOM/Cliprithm/commit/77eeeb2748e1a1b2a0db9c427d5e0209956820aa))
* align updater public key with generated signer key ([0235701](https://github.com/BOTOOM/Cliprithm/commit/0235701b960326fc2828b3dc3002c4d9fd1f0e50))
* allow preview proxy reads from app data ([3de01d0](https://github.com/BOTOOM/Cliprithm/commit/3de01d0e85fa17f0feb2d0d678da3218ecfe9bbd))
* allow release-please PAT fallback ([154c67b](https://github.com/BOTOOM/Cliprithm/commit/154c67b4a1b344dd25217c409f1a4de68f449541))
* avoid blocking editor while preview builds ([bb8770d](https://github.com/BOTOOM/Cliprithm/commit/bb8770d1db110d59633893208a5a1ab809e71bf5))
* clean up unused imports and fix package name ([6ed88f9](https://github.com/BOTOOM/Cliprithm/commit/6ed88f92b8b5bc9c3f4f699590ba3b10eaff08bf))
* correct release-please manifest format ([832013a](https://github.com/BOTOOM/Cliprithm/commit/832013adfe72120e85cf8b9834596b17b0da8f7b))
* correct rust-toolchain action name in CI/CD workflows ([4ec84e3](https://github.com/BOTOOM/Cliprithm/commit/4ec84e36b9fa9cb931370c9d86f32fb449767288))
* generate seek-friendly preview proxies ([35cd853](https://github.com/BOTOOM/Cliprithm/commit/35cd85394d18c4dcd83038e814c3418af4eae529))
* grant release workflow write permissions ([334ccce](https://github.com/BOTOOM/Cliprithm/commit/334ccce3924c9d739f27ee1747c8afcaf7b21c37))
* keep zoom interactions scoped to the timeline ([dcf8e31](https://github.com/BOTOOM/Cliprithm/commit/dcf8e312554e5e28f1b0535118025ae0172f2777))
* load desktop preview proxies through blob URLs ([f04d9f5](https://github.com/BOTOOM/Cliprithm/commit/f04d9f5dbf9fd43d8733ef7b156cc6154b81ff66))
* pause edited preview on manual timeline seeks ([04fa72d](https://github.com/BOTOOM/Cliprithm/commit/04fa72d556abdbb785db86e4a9f48529cc9503ee))
* project restore shows processing view before transitioning ([2661ecf](https://github.com/BOTOOM/Cliprithm/commit/2661ecf7bf5c32b0fd20a7e05d10f19d23f639b5))
* stabilize timeline seeking and preview recovery ([bed702a](https://github.com/BOTOOM/Cliprithm/commit/bed702ad44f1f31cc19efb9cb60764c9a935ff0f))
* sync Tauri versions during release builds ([5455e1c](https://github.com/BOTOOM/Cliprithm/commit/5455e1c0aa5542dc59e4b6aecbe9203596d83cea))
* timeline desync after clip deletion and zoom ([5d5c8e2](https://github.com/BOTOOM/Cliprithm/commit/5d5c8e2dc9eff572625901d793f6042f9058dc92))
* use asset protocol instead of blob URLs for video preview ([fa8c7bc](https://github.com/BOTOOM/Cliprithm/commit/fa8c7bc1643f21830c13712ec86a9a43c905bd99))
* use default JSON updater for tauri config ([74889b0](https://github.com/BOTOOM/Cliprithm/commit/74889b0d98eda6c26a8ea3d8a6390cb7d9cb7c46))
* use Tauri opener plugin for About page links ([7743846](https://github.com/BOTOOM/Cliprithm/commit/77438461f4a935b94fa56eb52dc69e768cf69d00))
