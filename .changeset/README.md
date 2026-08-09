# Changesets

Run `bun run changeset` in a pull request that changes oxray's published behavior. Commit the generated Markdown file with the change.

After changesets reach `main`, the publish workflow maintains a version PR. Merging that PR publishes the package to npm and creates the corresponding GitHub release.
