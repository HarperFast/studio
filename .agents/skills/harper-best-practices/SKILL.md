---
description: Best practices for building Harper applications, covering schema definition, automatic APIs, authentication, custom resources, and data handling. Triggers on tasks involving Harper database design, API implementation, and deployment.
license: Apache-2.0
metadata:
  author: harper
  github-path: harper-best-practices
  github-ref: refs/tags/v1.7.0
  github-repo: https://github.com/harperfast/skills
  github-tree-sha: ef40be7e5cec8c588c324a09a1a10e316439b331
  version: 1.0.0
name: harper-best-practices
---

# Harper Best Practices

Guidelines for building scalable, secure, and performant applications on Harper. These practices cover everything from initial schema design to advanced deployment strategies.

## When to Use

Reference these guidelines when:

- Defining or modifying database schemas
- Implementing or extending REST/WebSocket APIs
- Handling authentication and session management
- Working with custom resources and extensions
- Optimizing data storage and retrieval (Blobs, Vector Indexing)
- Deploying applications to Harper Fabric

## How It Works

1. Review the requirements for the task (schema design, API needs, or infrastructure setup).
2. Consult the relevant category under "Rule Categories by Priority" to understand the impact of your decisions.
3. Apply specific rules from the "Quick Reference" section below by reading their detailed rule files.
4. If you're building a new table, prioritize the `schema-` rules.
5. If you're extending functionality, consult the `logic-` and `api-` rules.
6. Validate your implementation against the `ops-` rules before deployment.

## Examples

See the concrete examples embedded in each rule subsection below (GraphQL schemas, REST query patterns, and deployment workflow snippets).

<!-- BEGIN GENERATED INDEX -->

## Rule Categories by Priority

| Priority | Category             | Impact | Prefix    |
| -------- | -------------------- | ------ | --------- |
| 1        | Schema & Data Design | HIGH   | `schema-` |
| 2        | API & Communication  | HIGH   | `api-`    |
| 3        | Logic & Extension    | MEDIUM | `logic-`  |
| 4        | Infrastructure & Ops | MEDIUM | `ops-`    |

## Quick Reference

### 1. Schema & Data Design (HIGH)

- `adding-tables-with-schemas` — Guidelines for adding tables to a Harper database using GraphQL schemas.
- `schema-design-tooling` — Best practices for Harper schema design, including core directives and GraphQL tooling configuration.
- `defining-relationships` — How to define and use relationships between tables in Harper using GraphQL.
- `vector-indexing` — How to enable and query vector indexes for similarity search in Harper.
- `using-blob-datatype` — How to use the Blob data type for efficient binary storage in Harper.
- `handling-binary-data` — How to store and serve binary data like images or audio in Harper.

### 2. API & Communication (HIGH)

- `automatic-apis` — How to use Harper's automatically generated REST and WebSocket APIs.
- `querying-rest-apis` — How to use query parameters to filter, sort, and paginate Harper REST APIs.
- `real-time-apps` — How to build real-time features in Harper using WebSockets and Pub/Sub.
- `checking-authentication` — How to handle user authentication and sessions in Harper Resources.

### 3. Logic & Extension (MEDIUM)

- `custom-resources` — How to define custom REST endpoints with JavaScript or TypeScript in Harper.
- `extending-tables` — How to add custom logic to automatically generated table resources in Harper.
- `programmatic-table-requests` — How to interact with Harper tables programmatically using the `tables` object.
- `typescript-type-stripping` — How to run TypeScript files directly in Harper without a build step.
- `caching` — How to implement integrated data caching in Harper from external sources.

### 4. Infrastructure & Ops (MEDIUM)

- `deploying-to-harper-fabric` — How to deploy a Harper application to the Harper Fabric cloud.
- `creating-a-fabric-account-and-cluster` — How to create a Harper Fabric account, organization, and cluster.
- `creating-harper-apps` — How to initialize a new Harper application using the CLI.
- `serving-web-content` — How to serve static files and integrated Vite/React applications in Harper.
- `logging` — Best practices for logging in Harper, including console capture, the granular logger interface, and programmatic log retrieval.

<!-- END GENERATED INDEX -->

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/adding-tables-with-schemas.md
rules/schema-design-tooling.md
rules/automatic-apis.md
rules/creating-harper-apps.md
rules/logging.md
```

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
