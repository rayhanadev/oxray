# oxray

An opinionated [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) plugin and project scaffolder, powered by [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html), [oxclippy](https://github.com/rayhanadev/oxclippy), and a small set of personal rules.

## Quick start

Run ox from the directory containing your `package.json`:

```bash
bunx @rayhanadev/ox
```

Or install it in the project and run the `ox` command directly:

```bash
bun add --dev @rayhanadev/ox
bunx ox
```

Oxray also works with npm, pnpm, and Yarn projects. It detects the project's package manager and runtime before making changes.

## What it configures

Oxray:

- Installs Oxlint, Oxfmt, type-aware linting, oxclippy, `@rayhanadev/ox`, and TypeScript 7.
- Installs the matching Bun or Node.js type definitions.
- Adds `lint` and `format` package scripts.
- Creates or updates `.oxlintrc.json` and `.oxfmtrc.json` without replacing unrelated settings or JSONC comments.
- Creates or updates an Oxray-owned section in `AGENTS.md` without replacing project guidance.
- Enables the TypeScript, Unicorn, and Oxc lint plugins.
- Enables comment and API documentation policy with advisory checks separated from blocking checks.
- Enables import, `package.json`, and Tailwind CSS sorting.

Running ox again with the same choices is safe and does not duplicate configuration.

## Oxclippy presets

Choose how much of oxclippy to enable during setup:

- **Recommended** — all non-pedantic rules.
- **Extensive** — every oxclippy rule.
- **Custom** — choose from style, complexity, correctness, iterator, functions, principles, and pedantic presets.

Oxclippy owns the reusable Clippy-inspired rules and presets. Oxray consumes them as one part of its project setup.

## Project detection

Oxray infers Bun or Node.js from existing dependencies and project files. Ambiguous projects get an interactive prompt.

For Node.js projects, the `@types/node` version follows this precedence:

1. `.node-version`
2. `.nvmrc`
3. `package.json#engines.node`
4. The active fnm or Node.js version

Oxray currently writes the JSON variants of the Oxlint and Oxfmt config files. It stops instead of competing with existing JavaScript, TypeScript, or JSONC config variants.

## License

MIT
