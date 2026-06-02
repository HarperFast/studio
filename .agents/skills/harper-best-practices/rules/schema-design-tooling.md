---
name: schema-design-tooling
description: Best practices for Harper schema design, including core directives and GraphQL tooling configuration.
metadata:
  mode: synthesized
---

# Schema Design & Tooling

Harper uses GraphQL schemas to define database tables, relationships, and APIs. To ensure the best development experience for both humans and AI agents, it's important to understand the core directives and configure your project tooling correctly.

## Core Harper Directives

Harper extends GraphQL with custom directives that define database behavior. These are typically defined in `node_modules/harper/schema.graphql`. If you don't have access to that file, here is a reference of the most important ones:

### Table Definition

- `@table`: Marks a GraphQL type as a Harper database table.
- `@export`: Automatically generates REST and WebSocket APIs for the table.
- `@table(expiration: Int)`: Configures a time-to-expire for records in the table (useful for caching).

### Attribute Constraints & Indexing

- `@primaryKey`: Specifies the unique identifier for the table.
- `@indexed`: Creates a standard index on the field for faster lookups.
- `@indexed(type: "HNSW", distance: "cosine" | "euclidean" | "dot")`: Creates a vector index for similarity search.

### Relationships

- `@relationship(from: String)`: Defines a relationship to another table. `from` specifies the local field holding the foreign key.

### Authentication & Authorization

- `@auth(role: String)`: Restricts access to a table or field based on user roles.

## Configuring GraphQL Tooling

To get the best IDE support (autocompletion, validation) and to help AI agents understand your schema context, you should create a `graphql.config.yml` file in your project root.

This file tells GraphQL tools where to find Harper's built-in types and directives alongside your own schema files.

### Creating `graphql.config.yml`

Create a file named `graphql.config.yml` in your project root with the following content:

```yaml
schema:
  - 'node_modules/harper/schema.graphql'
  - 'schema.graphql'
  - 'schemas/*.graphql'
```

### Why this is important:

1. **Shared Directives**: It includes `@table`, `@primaryKey`, etc., so they aren't marked as "unknown directives".
2. **Context for Agents**: When an agent reads your project, seeing this config helps it locate the core Harper definitions, leading to more accurate code generation.
3. **Consistency**: The `npm create harper@latest` command includes this by default. Manually adding it to existing projects ensures they follow the same standards.

## Example Project Structure

A typical Harper project with proper schema tooling:

```text
my-harper-app/
├── config.yaml
├── graphql.config.yml
├── package.json
├── schema.graphql
└── resources.js
```
