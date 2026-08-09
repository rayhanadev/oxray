# oxray

Opinionated agent guardrails powered by [Oxlint](https://oxc.rs/docs/guide/usage/linter.html), [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html), and Ray's personal lint rules.

## Usage

Run oxray from a package directory:

```bash
bunx oxray
```

Oxray detects Bun, npm, pnpm, or Yarn and then:

- Installs `oxray`, `oxlint`, `oxfmt`, `oxlint-tsgolint`, `oxclippy`, and TypeScript 7 as dev dependencies.
- Adds the appropriate Bun or Node type definitions.
- Adds `lint` and `format` package scripts.
- Creates or safely updates `.oxlintrc.json` and `.oxfmtrc.json`.
- Enables type-aware linting and the standard TypeScript, Unicorn, and Oxc plugins.
- Lets you choose the recommended or extensive (all) oxclippy ruleset, or select individual presets.
- Enables import, package.json, and Tailwind CSS sorting in Oxfmt.
- Enables the personal rules exported by the oxray plugin.
- Creates `CLAUDE.md` as a pointer to `AGENTS.md`.
- Preserves existing agent instructions and adds a rule forbidding lint suppression.

Existing JSONC comments and unrelated configuration are preserved. Running oxray again with the same choices is safe and produces no additional config changes.

## Rules

### `oxray/no-type-erasure`

Disallows broad object patterns that discard useful type information:

- `Record<string, any>` and `Record<string, unknown>`
- Equivalent string index signatures
- `object`, `Object`, and empty `{}` types or interfaces
- Calls named `isRecord`, including member and optional calls

Use concrete object shapes and domain-specific type guards instead.

### `oxray/no-typeof`

Disallows every runtime `typeof` expression. TypeScript type queries such as `type Value = typeof value` are allowed.

## Project detection

Runtime detection uses existing type dependencies and project configuration. Ambiguous projects get an interactive Bun/Node prompt.

For Node projects, the `@types/node` version follows fnm's local precedence:

1. `.node-version`
2. `.nvmrc`
3. `package.json#engines.node`
4. The active fnm or Node version

Oxray intentionally aborts when TypeScript/JavaScript Oxlint or Oxfmt config files already exist; v0 writes and merges the JSON config variants only.

## Development

```bash
bun install
bun run build
bun test
bun run typecheck
bun run lint
bun run format -- --check
```

The package builds `dist/cli.js` for the guardrail installer and `dist/plugin.js` for Oxlint. Oxclippy rule implementations remain in [rayhanadev/oxclippy](https://github.com/rayhanadev/oxclippy); oxray only consumes its published presets.

## License

MIT
