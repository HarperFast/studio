---
name: typescript-type-stripping
description: How to run TypeScript files directly in Harper without a build step.
metadata:
  mode: synthesized
---

# TypeScript Type Stripping

Instructions for the agent to follow when using TypeScript in Harper.

## When to Use

Use this skill when you want to write Harper Resources in TypeScript and have them execute directly in Node.js without an intermediate build or compilation step.

## How It Works

1. **Verify Node.js Version**: Ensure you are using Node.js v22.6.0 or higher.
2. **Name Files with `.ts`**: Create your resource files in the `resources/` directory with a `.ts` extension.
3. **Use TypeScript Syntax**: Write your resource classes using standard TypeScript (interfaces, types, etc.).
   ```typescript
   import { Resource } from 'harper';
   export class MyResource extends Resource {
   	async get(): Promise<{ message: string }> {
   		return { message: 'Running TS directly!' };
   	}
   }
   ```
4. **Use Explicit Extensions in Imports**: When importing other local modules, include the `.ts` extension: `import { helper } from './helper.ts'`.
5. **Configure `config.yaml`**: Ensure `jsResource` points to your `.ts` files:
   ```yaml
   jsResource:
     files: 'resources/*.ts'
   ```
