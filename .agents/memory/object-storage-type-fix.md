---
name: Object storage template type fix
description: The objectStorage.ts skill template has a TypeScript error on signed_url destructuring that needs a cast.
---

## The Rule
After copying `objectStorage.ts` from the skill template, add a type cast on the `response.json()` call where it destructures `signed_url`:

```ts
// Before (fails TS strict mode):
const { signed_url: signedURL } = await response.json();

// After:
const { signed_url: signedURL } = await response.json() as { signed_url: string };
```

**Why:** `response.json()` returns `unknown` in strict TypeScript. The template doesn't include this cast, causing TS2339.
