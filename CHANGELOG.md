# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0-beta.2] - 2026-07-24

### Changed

- Publish the NPM package as ESNext ESM builds and one bundled declaration file
  under `dist`, while keeping the JSR package source-first.
- Refer to the compatibility targets as Headless UI 2 and Deno 2 in public
  documentation.

### Fixed

- Exclude the TypeScript source tree from the NPM tarball.
- Validate the exact NPM packlist and the bundled declarations as package
  consumers before release.

## [0.1.0-beta.1] - 2026-07-24

### Added

- Add the initial community SolidJS 2 port of the Headless UI 2.2.10 public
  component and type surface.
- Add browser and server conditional exports, Deno-native verification, SSR,
  hydration, DOM, and native-browser coverage.
- Add direct NPM and JSR release manifests and OIDC publishing automation.
- Add module documentation and API documentation for all 198 public exports,
  with a verification guard for JSR score inputs.

### Changed

- Flatten the Solid package to a standalone repository.
- Remove upstream React and Tailwind packages, React and Vue playgrounds,
  upstream release scripts, Jest infrastructure, and experimental spikes.
- Publish the NPM and JSR packages as `@bloomler/headlessui-solid` to make the
  port's third-party ownership explicit.
- Develop and verify the full public, SSR, hydration, DOM, and browser surface
  against the coordinated SolidJS 2 `2.0.0-beta.25` runtime packages while
  allowing consumers to test later SolidJS 2 releases.
- Align the build pipeline with `vite-plugin-solid@3.0.0-next.16`.
- Upgrade the test DOM runtime to `jsdom@29.1.1`.
