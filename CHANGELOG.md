# Changelog

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
