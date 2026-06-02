---
name: adding-tables-with-schemas
description: Guidelines for adding tables to a Harper database using GraphQL schemas.
metadata:
  mode: synthesized
---

# Adding Tables with Schemas

Instructions for the agent to follow when adding tables to a Harper database.

## When to Use

Use this skill when you need to define new data structures or modify existing ones in a Harper database.

## How It Works

1. **Create Dedicated Schema Files**: Prefer having a dedicated schema `.graphql` file for each table. Check the `config.yaml` file under `graphqlSchema.files` to see how it's configured. It typically accepts wildcards (e.g., `schemas/*.graphql`), but may be configured to point at a single file.
2. **Use Directives**: All available directives for defining your schema are defined in `node_modules/harper/schema.graphql`. Common directives include `@table`, `@export`, `@primaryKey`, `@indexed`, and `@relationship`.
3. **Define Relationships**: Link tables together using the `@relationship` directive. For more details, see the [Defining Relationships](defining-relationships.md) skill.
4. **Enable Automatic APIs**: If you add `@table @export` to a schema type, Harper automatically sets up REST and WebSocket APIs for basic CRUD operations against that table. **Important**: REST endpoints also require `rest: true` in `config.yaml` — without it, `@export`ed tables will not respond to HTTP requests. For a detailed list of available endpoints and how to use them, see the [Automatic REST APIs](automatic-apis.md) skill.
   - `GET /{TableName}`: Describes the schema itself.
   - `GET /{TableName}/`: Lists all records (supports filtering, sorting, and pagination via query parameters). See the [Querying REST APIs](querying-rest-apis.md) skill for details.
   - `GET /{TableName}/{id}`: Retrieves a single record by its ID.
   - `POST /{TableName}/`: Creates a new record.
   - `PUT /{TableName}/{id}`: Updates an existing record.
   - `PATCH /{TableName}/{id}`: Performs a partial update on a record.
   - `DELETE /{TableName}/`: Deletes all records or filtered records.
   - `DELETE /{TableName}/{id}`: Deletes a single record by its ID.
5. **Consider Table Extensions**: If you are going to [extend the table](./extending-tables.md) in your resources, then do not `@export` the table from the schema.

## Examples

In a hypothetical `schemas/ExamplePerson.graphql`:

```graphql
type ExamplePerson @table @export {
	id: ID @primaryKey
	name: String
	tag: String @indexed
}
```
