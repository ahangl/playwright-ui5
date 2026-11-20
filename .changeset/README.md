# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). Each Markdown file here describes a change and its semver bump (patch, minor or major) for `@ahangl/playwright-ui5`.

- Add one with `npx changeset` for every change that consumers should see.
- `npm run version-packages` consumes them: it bumps the version in `package.json` and writes `CHANGELOG.md`.
- `npm run release` publishes the new version to npm.

See "Releasing" in the main README.
