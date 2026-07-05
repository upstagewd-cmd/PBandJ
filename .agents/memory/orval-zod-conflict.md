---
name: Orval zod codegen conflict
description: Orval's zod client generates duplicate TypeScript types alongside Zod schemas, causing name collision in api-zod's index.ts re-export.
---

## The Rule
Use `mode: "single"` and `target: "generated/api.ts"` (no `schemas` key) in the orval zod config. Never add `schemas: { path: "generated/types", type: "typescript" }` to the zod output block.

**Why:** With `schemas`, orval generates both `generated/api.ts` (Zod schemas like `RequestUploadUrlBody`) AND `generated/types/requestUploadUrlBody.ts` (TypeScript interface of the same name). When `index.ts` re-exports both with `export * from`, TypeScript raises TS2308 duplicate export errors.

**How to apply:** Any time the OpenAPI spec is updated and codegen is run, keep the orval config as:
```ts
output: {
  client: "zod",
  target: "generated/api.ts",
  mode: "single",
  clean: false,   // don't clean — avoids deleting the file between runs
  ...
}
```
And `lib/api-zod/src/index.ts` should only export `export * from "./generated/api"`.
