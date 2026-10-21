# Changelog

## [0.7.1](https://github.com/racode246/leafbound/compare/v0.7.0...v0.7.1) (2026-10-21)


### Bug Fixes

* **deps:** update bundled CA roots for the eMudhra intermediate CA compromise ([#76](https://github.com/racode246/leafbound/issues/76)) ([c83d49e](https://github.com/racode246/leafbound/commit/c83d49ee818b93fa97578955c4c1d09e57379241))

## [0.7.0](https://github.com/racode246/leafbound/compare/v0.6.0...v0.7.0) (2026-10-21)


### Features

* **assistant:** answer whole-chapter questions and keep citations stable ([#75](https://github.com/racode246/leafbound/issues/75)) ([3501a9e](https://github.com/racode246/leafbound/commit/3501a9ed68b007d58e2a3df78cd64c3be1aac71f))


### Bug Fixes

* **deps:** override @xmldom/xmldom to 0.8.15 ([#71](https://github.com/racode246/leafbound/issues/71)) ([61160cf](https://github.com/racode246/leafbound/commit/61160cf7d4f0cfcc412d7180b01bf106674cb250))

## [0.6.0](https://github.com/racode246/leafbound/compare/v0.5.0...v0.6.0) (2026-10-18)


### Features

* **reader:** change the font size with Ctrl+= / Ctrl+- / Ctrl+0 ([#65](https://github.com/racode246/leafbound/issues/65)) ([dadb2c4](https://github.com/racode246/leafbound/commit/dadb2c48275ca46833947834e22de1627d04bcda))
* **reader:** infer TOC nesting from heading numbers when the TOC is flat ([#68](https://github.com/racode246/leafbound/issues/68)) ([a0a7fea](https://github.com/racode246/leafbound/commit/a0a7feaff547c9766e620602d4e7bffd3aa32eae)), closes [#66](https://github.com/racode246/leafbound/issues/66)
* **reader:** return to the reading position after a jump ([#67](https://github.com/racode246/leafbound/issues/67)) ([40d0cac](https://github.com/racode246/leafbound/commit/40d0cac0c908946e8074e8289ae92b2741a3d012)), closes [#63](https://github.com/racode246/leafbound/issues/63)

## [0.5.0](https://github.com/racode246/leafbound/compare/v0.4.1...v0.5.0) (2026-10-18)


### Features

* **log:** write a rotating log file ([#58](https://github.com/racode246/leafbound/issues/58)) ([61da6b3](https://github.com/racode246/leafbound/commit/61da6b3b315c73727d58454d95c6b3c0708ec0fa))
* **window:** restore window position and size on launch ([#61](https://github.com/racode246/leafbound/issues/61)) ([75839dc](https://github.com/racode246/leafbound/commit/75839dc061eafa2933c077799dd55c90137a5ba1))


### Bug Fixes

* **library:** fall back to defaults for unknown setting values ([#59](https://github.com/racode246/leafbound/issues/59)) ([58519c2](https://github.com/racode246/leafbound/commit/58519c23ea3cfa5ae949091c1693a68850d83a42))


### Performance Improvements

* **ipc:** run blocking commands off the main thread ([#57](https://github.com/racode246/leafbound/issues/57)) ([3e7b4a9](https://github.com/racode246/leafbound/commit/3e7b4a9df8797bd4f771cceecb9af05dce26547f))

## [0.4.1](https://github.com/racode246/leafbound/compare/v0.4.0...v0.4.1) (2026-10-18)


### Bug Fixes

* **assistant:** ignore the Enter that confirms an IME conversion on macOS ([#55](https://github.com/racode246/leafbound/issues/55)) ([7a35a4b](https://github.com/racode246/leafbound/commit/7a35a4baa10544c3671b032c3eb3d87c437c935f)), closes [#53](https://github.com/racode246/leafbound/issues/53)

## [0.4.0](https://github.com/racode246/leafbound/compare/v0.3.1...v0.4.0) (2026-10-18)


### Features

* support macOS (Apple Silicon) ([#51](https://github.com/racode246/leafbound/issues/51)) ([3c0c4fc](https://github.com/racode246/leafbound/commit/3c0c4fc73ebb9b6b45dfdfa2628a2a81219031dd))

## [0.3.1](https://github.com/racode246/leafbound/compare/v0.3.0...v0.3.1) (2026-10-17)


### Bug Fixes

* **release:** drop 'closes #n' from the update notes ([#49](https://github.com/racode246/leafbound/issues/49)) ([307d7ca](https://github.com/racode246/leafbound/commit/307d7ca34931c00e3247abae9a0f8f66fcaa9681)), closes [#48](https://github.com/racode246/leafbound/issues/48)

## [0.3.0](https://github.com/racode246/leafbound/compare/v0.2.0...v0.3.0) (2026-10-17)


### Features

* **assistant:** answer in terms of the book, not the prompt ([#44](https://github.com/racode246/leafbound/issues/44)) ([385dc0e](https://github.com/racode246/leafbound/commit/385dc0eeebdb8d01084a21b20df803ea167acecf)), closes [#5](https://github.com/racode246/leafbound/issues/5)
* **assistant:** search the book with a hypothetical answer (HyDE) ([#3](https://github.com/racode246/leafbound/issues/3)) ([9c5530f](https://github.com/racode246/leafbound/commit/9c5530fe03ceafe0bb0b7265b56810882f2962e5))
* check for and install updates in the app ([#46](https://github.com/racode246/leafbound/issues/46)) ([77f8e06](https://github.com/racode246/leafbound/commit/77f8e06b5fb6d575edf8b9c33da8dd4be2f96e3e)), closes [#19](https://github.com/racode246/leafbound/issues/19)
* **reader:** ask AI about selected text ([#47](https://github.com/racode246/leafbound/issues/47)) ([0c52180](https://github.com/racode246/leafbound/commit/0c5218066e748fcc630ab2a19881fee2f5eb5915)), closes [#6](https://github.com/racode246/leafbound/issues/6)
* **reader:** mark the current chapter in the Contents panel ([#40](https://github.com/racode246/leafbound/issues/40)) ([4f35dd5](https://github.com/racode246/leafbound/commit/4f35dd52dd44b26303bf060555adf7865b213774)), closes [#38](https://github.com/racode246/leafbound/issues/38)
* **reader:** show the header buttons as icons with hover labels ([#43](https://github.com/racode246/leafbound/issues/43)) ([4819464](https://github.com/racode246/leafbound/commit/4819464c34d60d91013927b6b721420349db4cf8))
* **security:** enable a Content Security Policy ([#37](https://github.com/racode246/leafbound/issues/37)) ([62bb2c3](https://github.com/racode246/leafbound/commit/62bb2c36a567a6ac118ab0f0fb4b4e78c570d725)), closes [#4](https://github.com/racode246/leafbound/issues/4)
* **ui:** draw the app's icons with Lucide ([#42](https://github.com/racode246/leafbound/issues/42)) ([6b17efc](https://github.com/racode246/leafbound/commit/6b17efc21cf6cc0f10fab9050618ff5986533b2c)), closes [#39](https://github.com/racode246/leafbound/issues/39)


### Bug Fixes

* **assistant:** prepare the embedding model only once at a time ([#27](https://github.com/racode246/leafbound/issues/27)) ([8a85d47](https://github.com/racode246/leafbound/commit/8a85d479d93a37839a358eaeacc24e453a0f83aa))
* **library:** remove files of deleted books on startup ([#35](https://github.com/racode246/leafbound/issues/35)) ([06bd426](https://github.com/racode246/leafbound/commit/06bd42658a58c7cf883e937532bbed9ac7dc33b5))
* **ui:** keep the page from scrolling sideways ([#36](https://github.com/racode246/leafbound/issues/36)) ([5d4343f](https://github.com/racode246/leafbound/commit/5d4343f136082aaafcb04c9d28c25573084f28aa)), closes [#9](https://github.com/racode246/leafbound/issues/9)

## [0.2.0](https://github.com/racode246/leafbound/compare/v0.1.1...v0.2.0) (2026-10-17)


### Features

* ask an LLM about the book being read ([0d2bb9e](https://github.com/racode246/leafbound/commit/0d2bb9e0acc93b8c0644dafa515a74198f977c1b))
