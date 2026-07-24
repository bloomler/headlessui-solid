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
6. For a beta release, wait until NPM has published the version, then run
   `deno task release:npm-tags` from an interactive terminal and approve the NPM
   passkey prompt. This keeps both `latest` and `beta` on the new version
   without storing a 2FA-bypass token.
7. Rerun the publish workflow if its distribution-tag check was waiting for that
   passkey step.
8. Confirm the publish workflow completed and both registries expose the
   expected version. The GitHub release body must match that version's complete
   `CHANGELOG.md` section, and JSR must report a 100% package score.

The workflow verifies the package, dry-runs both registries, and publishes with
OIDC provenance. It can be safely rerun after a partial release because an
existing immutable NPM version is skipped. It waits for JSR to report the exact
stable version with a 100% score and extracts the GitHub release body from the
matching versioned changelog section. The final NPM tag check prevents a release
from completing while any required distribution tag is stale.
