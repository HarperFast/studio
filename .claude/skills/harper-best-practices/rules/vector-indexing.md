---
name: vector-indexing
description: How to enable and query vector indexes for similarity search in Harper.
metadata:
  mode: generate
  sources:
    - reference/v5/database/schema.md#Vector Indexing
  sourceCommit: b7fbddadd42eb4487190b650a9abc4bcfeef5819
  inputHash: 3732961c671aac00
---

# Vector Indexing

Instructions for the agent to follow when enabling and querying vector indexes for similarity search in Harper using the HNSW algorithm.

## When to Use

Apply this rule when adding a vector index to a Harper table schema or writing similarity search queries against high-dimensional vector fields. Use it whenever you need approximate nearest-neighbor search, distance-threshold filtering, or distance-scored results.

## How It Works

1. **Declare the vector index on a `[Float]` field**: Add `@indexed(type: "HNSW")` to any `[Float]` attribute in a `@table` type. See [adding-tables-with-schemas.md](adding-tables-with-schemas.md) for general schema setup.

   ```graphql
   type Document @table {
   	id: Long @primaryKey
   	textEmbeddings: [Float] @indexed(type: "HNSW")
   }
   ```

2. **Query by nearest neighbors using `sort`**: Call `Document.search()` with a `sort` object containing `attribute` (the indexed field name) and `target` (the query vector). Include `limit` to cap results.

   ```javascript
   let results = Document.search({
   	sort: { attribute: 'textEmbeddings', target: searchVector },
   	limit: 5,
   });
   ```

3. **Combine with filter conditions**: Add a `conditions` array alongside `sort` to pre-filter records before ranking by similarity.

   ```javascript
   let results = Document.search({
   	conditions: [{ attribute: 'price', comparator: 'lt', value: 50 }],
   	sort: { attribute: 'textEmbeddings', target: searchVector },
   	limit: 5,
   });
   ```

4. **Filter by distance threshold**: To return only records within a similarity cutoff (without ranking), place `target` directly on the condition alongside `comparator` and `value`. Omit `sort`.

   ```javascript
   let results = Document.search({
   	conditions: {
   		attribute: 'textEmbeddings',
   		comparator: 'lt',
   		value: 0.1,
   		target: searchVector,
   	},
   });
   ```

5. **Include computed distance in results**: Use the special `$distance` field in `select` to return the distance from the target vector. Works with both `sort`-based and `conditions`-based queries.

   ```javascript
   let results = Document.search({
   	select: ['name', '$distance'],
   	sort: { attribute: 'textEmbeddings', target: searchVector },
   	limit: 5,
   });
   ```

6. **Tune HNSW parameters**: Pass additional parameters to `@indexed(type: "HNSW", ...)` to control index quality and performance.

   | Parameter              | Default           | Description                                                                                         |
   | ---------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
   | `distance`             | `"cosine"`        | Distance function: `"euclidean"` or `"cosine"` (negative cosine similarity)                         |
   | `efConstruction`       | `100`             | Max nodes explored during index construction. Higher = better recall, lower = better performance    |
   | `M`                    | `16`              | Preferred connections per graph layer. Higher = more space, better recall for high-dimensional data |
   | `optimizeRouting`      | `0.5`             | Heuristic aggressiveness for omitting redundant connections (0 = off, 1 = most aggressive)          |
   | `mL`                   | computed from `M` | Normalization factor for level generation                                                           |
   | `efSearchConstruction` | `50`              | Max nodes explored during search                                                                    |

## Examples

**Schema with custom HNSW parameters:**

```graphql
type Document @table {
	id: Long @primaryKey
	textEmbeddings: [Float]
	@indexed(
		type: "HNSW"
		distance: "euclidean"
		optimizeRouting: 0
		efSearchConstruction: 100
	)
}
```

**Nearest-neighbor search with distance score:**

```javascript
let results = Document.search({
	select: ['name', '$distance'],
	sort: { attribute: 'textEmbeddings', target: searchVector },
	limit: 5,
});
```

**Distance-threshold filter (no ranking):**

```javascript
let results = Document.search({
	conditions: {
		attribute: 'textEmbeddings',
		comparator: 'lt',
		value: 0.1,
		target: searchVector,
	},
});
```

## Notes

- The default `distance` function is `cosine`. Pass `distance: "euclidean"` to switch.
- `efConstruction` controls index build quality; raising it improves recall at the cost of build time.
- `$distance` is available in both `sort`-based ranking and `conditions`-based threshold queries.
- Use the threshold (`conditions` + `target`) form when you want to bound result quality by a similarity cutoff rather than ranking by similarity.
