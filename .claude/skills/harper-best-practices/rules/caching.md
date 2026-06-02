---
name: caching
description: How to implement integrated data caching in Harper from external sources.
metadata:
  mode: generate
  sources:
    - learn/developers/caching-with-harper.md
  sourceCommit: b7fbddadd42eb4487190b650a9abc4bcfeef5819
  inputHash: 8212a7d7dbbd2b18
---

# Caching External Data Sources in Harper

Instructions for the agent to implement integrated data caching in Harper by wrapping external sources with a cache table and `sourcedFrom`.

## When to Use

Apply this rule when a Harper application needs to cache responses from an external API, microservice, or database to avoid repeated slow or expensive upstream calls. Use it whenever you need to define TTL-based cache expiration, observe ETag-based conditional responses, or manually invalidate cached entries.

## How It Works

1. **Define a cache table with `expiration`**: In `schema.graphql`, add the `expiration` argument to `@table`. The value is in seconds. Any record older than this threshold is considered stale and will be re-fetched on next access.

   ```graphql
   type JokeCache @table(expiration: 60) @export {
   	id: ID @primaryKey
   	setup: String
   	punchline: String
   }
   ```

2. **Wrap the external source in `resources.js`**: Create an object with a `get(id)` method that fetches from the upstream source. Then call `sourcedFrom` on the table to register it.

   ```javascript
   const jokeAPI = {
   	async get(id) {
   		const response = await fetch(
   			`https://official-joke-api.appspot.com/jokes/${id}`,
   		);
   		return response.json();
   	},
   };

   tables.JokeCache.sourcedFrom(jokeAPI);
   ```

   Harper's caching behavior after `sourcedFrom` is registered:
   - A request arrives for `/JokeCache/1`.
   - Harper checks if the record with id `1` exists in `JokeCache` and is not stale.
   - If fresh, Harper returns it immediately.
   - If missing or stale, Harper calls `jokeAPI.get()`, stores the result in `JokeCache`, and returns it.
   - Multiple simultaneous requests for the same missing or stale record wait on a single upstream call — Harper prevents cache stampedes automatically.

3. **Configure plugins in `config.yaml`**: Enable the schema, REST API, and JS resource plugins.

   ```yaml
   graphqlSchema:
     files: 'schema.graphql'
   rest: true
   jsResource:
     files: 'resources.js'
   ```

4. **Observe caching via ETags**: Harper automatically computes an ETag from the record's last-modified timestamp. On the first request you receive a `200` with an `etag` header. Pass that value back in `If-None-Match` on subsequent requests; Harper returns `304 Not Modified` with an empty body if the record is unchanged.

   ```bash
   curl -i 'http://localhost:9926/JokeCache/1' \
     -H 'If-None-Match: "abCDefGHij"'
   ```

5. **Force a cache bypass**: Send `Cache-Control: no-cache` to make Harper skip the local cache and always call the upstream source, regardless of TTL.

   ```bash
   curl -i 'http://localhost:9926/JokeCache/1' \
     -H 'Cache-Control: no-cache'
   ```

6. **Invalidate a cache entry on demand**: Remove `@export` from the schema type, then export a class of the same name in `resources.js` that extends the table and implements a `post` handler calling `this.invalidate(target)`.

   ```graphql
   type JokeCache @table(expiration: 60) {
   	id: ID @primaryKey
   	setup: String
   	punchline: String
   }
   ```

   ```javascript
   export class JokeCache extends tables.JokeCache {
   	static async post(target, data) {
   		const body = await data;
   		if (body?.action === 'invalidate') {
   			this.invalidate(target);
   			return { status: 200, data: { message: 'invalidated' } };
   		}
   	}
   }
   ```

   Trigger invalidation with a `POST`:

   ```bash
   curl -X POST 'http://localhost:9926/JokeCache/1' \
     -H 'Content-Type: application/json' \
     -d '{"action": "invalidate"}'
   ```

   The next `GET /JokeCache/1` will fetch fresh data from the upstream source regardless of TTL.

## Examples

Complete `schema.graphql` and `resources.js` for a cached external API with on-demand invalidation:

```graphql
type JokeCache @table(expiration: 60) {
	id: ID @primaryKey
	setup: String
	punchline: String
}
```

```javascript
// resources.js

const jokeAPI = {
	async get() {
		const id = this.getId();
		const response = await fetch(
			`https://official-joke-api.appspot.com/jokes/${id}`,
		);
		return response.json();
	},
};

tables.JokeCache.sourcedFrom(jokeAPI);

export class JokeCache extends tables.JokeCache {
	static async post(target, data) {
		const body = await data;
		if (body?.action === 'invalidate') {
			this.invalidate(target);
			return { status: 200, data: { message: 'invalidated' } };
		}
	}
}
```

First request — cache miss, upstream is called, `200` returned:

```bash
curl -i 'http://localhost:9926/JokeCache/1'
```

Second request with ETag — cache hit, `304 Not Modified`:

```bash
curl -i 'http://localhost:9926/JokeCache/1' \
  -H 'If-None-Match: "abCDefGHij"'
```

## Notes

- `expiration` is measured in seconds. Harper also supports separate `eviction` and `scanInterval` arguments on `@table` for fine-grained control over physical record removal.
- The `@export` directive on the schema type is not required when you export a Resource class of the same name from `resources.js` — the class export serves as the endpoint registration. See [custom-resources.md](custom-resources.md) for details on building Resource classes.
- Harper's REST layer automatically exposes `@export`-ed tables and Resource classes as HTTP endpoints. See [automatic-apis.md](automatic-apis.md) for how endpoints are structured and named.
- ETag values include their double quotes as part of the value — include them verbatim when passing the value in `If-None-Match`.
- `sourcedFrom` must be called after the table reference (`tables.JokeCache`) is available, which is guaranteed when the call is at the top level of `resources.js`.
