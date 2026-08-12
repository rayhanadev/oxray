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

## Lint corrections

Oxray diagnostics explain the failed invariant and show corrected code when the rule can derive it.

- Run `oxlint --fix` to apply corrections that preserve runtime behavior.
- Run `oxlint --fix-suggestions` only after reviewing corrections that tighten validation.
- Run Oxfmt and Oxlint after applying either correction class.

## Evidence and organization rules

Oxray includes selected ideas from [anti-slop](https://github.com/dmmulroy/anti-slop) and [Factory's ESLint plugin](https://github.com/Factory-AI/eslint-plugin).
The implementations use Oxlint's plugin API and fit Oxray's existing conventions.

- `no-chained-type-assertions` rejects nested assertions such as `value as unknown as User`.
- `no-conditional-empty-object-spread` rejects empty-object omission branches.
- `no-known-value-widening` preserves evidence carried by known initializers.
- `no-unknown-type-aliases` keeps `unknown` visible at boundaries.
- `no-unsafe-dictionary-type` requires concrete dictionary value contracts.
- `no-widen-then-assert` preserves precise types through local flows.
- Dedicated rules keep `types`, `enums`, `constants`, `errors`, and `schemas` files focused.
- `filename-match-export` matches a named default export to its filename.
- `no-exported-function-expressions` requires declarations for directly or indirectly exported functions.

The organization rules do not force every declaration into a shared file.
Feature modules can keep cohesive declarations beside their implementation.
`schemas.ts` can colocate only `z.infer<...>` aliases with schema constants.

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
