---
name: defining-relationships
description: How to define and use relationships between tables in Harper using GraphQL.
metadata:
  mode: synthesized
---

# Defining Relationships

Instructions for the agent to follow when defining relationships between Harper tables.

## When to Use

Use this skill when you need to link data across different tables, enabling automatic joins and efficient related-data fetching via REST APIs.

## How It Works

1. **Identify the Relationship Type**: Determine if it's one-to-one, many-to-one, or one-to-many.
2. **Use the `@relationship` Directive**: Apply it to a field in your GraphQL schema.
   - **Many-to-One (Current table holds FK)**: Use `from`.
     ```graphql
     type Book @table @export {
     	authorId: ID
     	author: Author @relationship(from: "authorId")
     }
     ```
   - **One-to-Many (Related table holds FK)**: Use `to` and an array type.
     ```graphql
     type Author @table @export {
     	books: [Book] @relationship(to: "authorId")
     }
     ```
3. **Query with Relationships**: Use dot syntax in REST API calls for filtering or the `select()` operator for including related data.
   - Example Filter: `GET /Book/?author.name=Harper`
   - Example Select: `GET /Author/?select(name,books(title))`
