---
name: programmatic-table-requests
description: How to interact with Harper tables programmatically using the `tables` object.
metadata:
  mode: synthesized
---

# Programmatic Table Requests

Instructions for the agent to follow when interacting with Harper tables via code.

## When to Use

Use this skill when you need to perform database operations (CRUD, search, subscribe) from within Harper Resources or scripts.

## How It Works

1. **Access the Table**: Use the global `tables` object followed by your table name (e.g., `tables.MyTable`).
2. **Perform CRUD Operations**:
   - **Get**: `await tables.MyTable.get(id)` for a single record or `await tables.MyTable.get({ conditions: [...] })` for multiple.
   - **Create**: `await tables.MyTable.post(record)` (auto-generates ID) or `await tables.MyTable.put(id, record)`.
   - **Update**: `await tables.MyTable.patch(id, partialRecord)` for partial updates.
   - **Delete**: `await tables.MyTable.delete(id)`.
3. **Use Updatable Records for Atomic Ops**: Call `update(id)` to get a reference, then use `addTo` or `subtractFrom` for atomic increments/decrements:
   ```typescript
   const stats = await tables.Stats.update('daily');
   stats.addTo('viewCount', 1);
   ```
4. **Search and Stream**: Use `search(query)` for efficient streaming of large result sets:
   ```typescript
   for await (const record of tables.MyTable.search({ conditions: [...] })) {
     // process record
   }
   ```
   See the [Query Conditions](#query-conditions) section below for the full query object reference.
5. **Real-time Subscriptions**: Use `subscribe(query)` to listen for changes:
   ```typescript
   for await (const event of tables.MyTable.subscribe(query)) {
   	// handle event
   }
   ```
6. **Publish Events**: Use `publish(id, message)` to trigger subscriptions without necessarily persisting data.

## Query Conditions

When passing a query to `search()`, `get()`, or `subscribe()`, use a query object with a `conditions` array.

### Condition Object Shape

| Property     | Description                                                                                |
| ------------ | ------------------------------------------------------------------------------------------ |
| `attribute`  | Field name, or array of field names to traverse a relationship (e.g., `['brand', 'name']`) |
| `value`      | The value to compare against                                                               |
| `comparator` | One of the comparator strings below (default: `equals`)                                    |
| `operator`   | `and` (default) or `or` — applies to a nested `conditions` block                           |
| `conditions` | Nested array of condition objects for complex AND/OR logic                                 |

### Comparator Values

Use these exact strings — incorrect comparator names will silently fail or error:

| Comparator           | Meaning                                                    |
| -------------------- | ---------------------------------------------------------- |
| `equals`             | Exact match (default)                                      |
| `not_equal`          | Not equal                                                  |
| `greater_than`       | `>`                                                        |
| `greater_than_equal` | `>=`                                                       |
| `less_than`          | `<`                                                        |
| `less_than_equal`    | `<=`                                                       |
| `starts_with`        | String starts with value                                   |
| `contains`           | String contains value                                      |
| `ends_with`          | String ends with value                                     |
| `between`            | Value is between two bounds (pass `value` as `[min, max]`) |

### Query Object Parameters

| Property     | Description                                                                          |
| ------------ | ------------------------------------------------------------------------------------ |
| `conditions` | Array of condition objects                                                           |
| `limit`      | Maximum number of records to return                                                  |
| `offset`     | Number of records to skip (for pagination)                                           |
| `select`     | Array of attribute names to return; supports `$id` and `$updatedtime`                |
| `sort`       | Object with `attribute`, `descending` (bool), and optional `next` for secondary sort |

### Examples

**Simple filter:**

```javascript
for await (const record of tables.Product.search({
  conditions: [{ attribute: 'price', comparator: 'less_than', value: 100 }],
  limit: 20,
})) { ... }
```

**AND + nested OR:**

```javascript
for await (const record of tables.Product.search({
  conditions: [
    { attribute: 'price', comparator: 'less_than', value: 100 },
    {
      operator: 'or',
      conditions: [
        { attribute: 'rating', comparator: 'greater_than', value: 4 },
        { attribute: 'featured', value: true },
      ],
    },
  ],
})) { ... }
```

**Relationship traversal:**

```javascript
for await (const record of tables.Book.search({
  conditions: [{ attribute: ['brand', 'name'], comparator: 'equals', value: 'Harper' }],
})) { ... }
```

**Sort and paginate:**

```javascript
for await (const record of tables.Product.search({
  conditions: [{ attribute: 'inStock', value: true }],
  sort: { attribute: 'price', descending: false },
  limit: 10,
  offset: 20,
})) { ... }
```

## Cautions

Be very careful when performing updates and deletions! You may be dealing with live production data. The wrong request to delete, without approval from a human, could be devastating to a business. Always use the proper approval process.
