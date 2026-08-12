Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

You must never disable or suppress lint rules.

<!-- oxray:comments:start -->
## Comments and documentation

- Use JSDoc for exported functions and classes.
- Use JSDoc when a comment describes a function, class, method, accessor, or constructor.
- Explain constraints, side effects, failure behavior, or design reasons. Do not narrate the code.
- Use clear technical English that follows ASD-STE100 principles.
- Keep descriptive sentences at 25 words or fewer.
- Keep procedural sentences at 20 words or fewer.
- Use active voice and simple verb tenses.
- Keep each paragraph to one topic and six sentences or fewer.

### File overviews

Add a leading `@fileoverview` JSDoc block when a module has a broad API or complex control flow.
Explain the module boundary and the important flow. Do not list the exports.

### Domain knowledge

Put durable business rules, architecture decisions, invariants, and shared terminology in the nearest AGENTS.md.
Use a relative JSDoc reference such as `@see ../../AGENTS.md#retry-policy` near the affected code.
Maintain one project glossary for preferred domain terms when several names could describe the same concept.

### Comment exceptions

If the project permits suppressions, use only rule-specific `disable-line` or `disable-next-line` directives.
Add the `--` delimiter and a clear rationale of at least five words to each lint suppression.
Delete commented-out implementation code or move it to a JSDoc example.
If disabled code must remain, add `KEPT: <reason>` immediately before it.

If the ASD-STE100 skill is available, use it when you write or revise substantial documentation.

## Responding to lint diagnostics

- Apply the exact replacement when a diagnostic provides one.
- Run `oxlint --fix` for corrections that preserve runtime behavior.
- Review each change before you run `oxlint --fix-suggestions`.
- Replace diagnostic placeholders with project-specific names and types.
- Run Oxfmt and Oxlint after each correction.
<!-- oxray:comments:end -->
