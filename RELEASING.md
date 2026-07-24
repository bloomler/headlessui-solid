# Releasing

These operational notes are for package maintainers. NPM and JSR both use the
scoped name `@bloomler/headlessui-solid`.

## One-time registry setup

1. Create the `bloomler` JSR scope and its `headlessui-solid` package.
2. Link the JSR package to `bloomler/headlessui-solid` on GitHub so Actions can
   publish with OIDC provenance.
3. Create a protected GitHub environment named `release`.
4. Publish the first NPM version interactively with public access and the
   appropriate distribution tag.
5. In the NPM package settings, configure a GitHub Actions trusted publisher:
   - Owner: `bloomler`
   - Repository: `headlessui-solid`
   - Workflow: `publish.yml`
   - Environment: `release`
   - Allowed action: `npm publish`

## Publishing a version

1. Update the matching versions in `package.json` and `deno.json`.
2. Update `CHANGELOG.md` and any versioned installation examples.
3. Run `deno task verify:all`.
4. Commit and push the release.
5. Create and push the matching `v<version>` tag.
6. Confirm the publish workflow completed and both registries expose the
   expected version.

The workflow verifies the package, dry-runs both registries, and publishes with
OIDC provenance. It can be safely rerun after a partial release because an
existing immutable NPM version is skipped.
