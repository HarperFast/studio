---
name: creating-harper-apps
description: How to initialize a new Harper application using the CLI.
metadata:
  mode: synthesized
---

# Creating Harper Applications

The fastest way to start a new Harper project is using the `create-harper` CLI tool. This command initializes a project with a standard folder structure, essential configuration files, and basic schema definitions.

## When to Use

Use this command when starting a new Harper application or adding a new Harper microservice to an existing architecture.

## Commands

Initialize a project using your preferred package manager:

### NPM

```bash
npm create harper@latest
```

### PNPM

```bash
pnpm create harper@latest
```

### Bun

```bash
bun create harper@latest
```

## Options

You can specify the project name and template directly:

```bash
npm create harper@latest my-app --template default
```

## Next Steps

1. **Configure Environment**: Set up your `.env` file with local or cloud credentials.
2. **Define Schema**: Modify `schema.graphql` to fit your application's data model.
3. **Start Development**: Run `npm run dev` to start the local Harper instance.
4. **Deploy**: Use `npm run deploy` to push your application to Harper Fabric.
