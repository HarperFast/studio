---
name: extending-tables
description: How to add custom logic to automatically generated table resources in Harper.
metadata:
  mode: synthesized
---

# Extending Tables

Instructions for the agent to follow when extending table resources in Harper.

## When to Use

Use this skill when you need to add custom validation, side effects (like webhooks), data transformation, or custom access control to the standard CRUD operations of a Harper table.

## How It Works

1. **Define the Table in GraphQL**: In your `.graphql` schema, define the table using the `@table` directive. **Do not** use `@export` if you plan to extend it.
   ```graphql
   type MyTable @table {
   	id: ID @primaryKey
   	name: String
   }
   ```
2. **Create the Extension File**: Create a `.ts` file in your `resources/` directory.
3. **Extend the Table Resource**: Export a class that extends `tables.YourTableName`:

   ```typescript
   import { type RequestTargetOrId, tables } from 'harper';

   export class MyTable extends tables.MyTable {
   	async post(target: RequestTargetOrId, record: any) {
   		// Custom logic here
   		if (!record.name) {
   			throw new Error('Name required');
   		}
   		return super.post(target, record);
   	}
   }
   ```

4. **Override Methods**: Override `get`, `post`, `put`, `patch`, or `delete` as needed. Always call `super[method]` to maintain default Harper functionality unless you intend to replace it entirely.
5. **Implement Logic**: Use overrides for validation, side effects, or transforming data before/after database operations.
