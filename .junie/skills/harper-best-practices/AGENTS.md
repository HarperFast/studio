# Harper Best Practices

Guidelines for building scalable, secure, and performant applications on Harper. These practices cover everything from initial schema design to advanced deployment strategies.

## 1. Schema & Data Design

### 1.1 Adding Tables with Schemas

Instructions for the agent to follow when adding tables to a Harper database.

#### When to Use

Use this skill when you need to define new data structures or modify existing ones in a Harper database.

#### How It Works

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

#### Examples

In a hypothetical `schemas/ExamplePerson.graphql`:

```graphql
type ExamplePerson @table @export {
	id: ID @primaryKey
	name: String
	tag: String @indexed
}
```

### 1.2 Schema Design & Tooling

Harper uses GraphQL schemas to define database tables, relationships, and APIs. To ensure the best development experience for both humans and AI agents, it's important to understand the core directives and configure your project tooling correctly.

#### Core Harper Directives

Harper extends GraphQL with custom directives that define database behavior. These are typically defined in `node_modules/harper/schema.graphql`. If you don't have access to that file, here is a reference of the most important ones:

##### Table Definition

- `@table`: Marks a GraphQL type as a Harper database table.
- `@export`: Automatically generates REST and WebSocket APIs for the table.
- `@table(expiration: Int)`: Configures a time-to-expire for records in the table (useful for caching).

##### Attribute Constraints & Indexing

- `@primaryKey`: Specifies the unique identifier for the table.
- `@indexed`: Creates a standard index on the field for faster lookups.
- `@indexed(type: "HNSW", distance: "cosine" | "euclidean" | "dot")`: Creates a vector index for similarity search.

##### Relationships

- `@relationship(from: String)`: Defines a relationship to another table. `from` specifies the local field holding the foreign key.

##### Authentication & Authorization

- `@auth(role: String)`: Restricts access to a table or field based on user roles.

#### Configuring GraphQL Tooling

To get the best IDE support (autocompletion, validation) and to help AI agents understand your schema context, you should create a `graphql.config.yml` file in your project root.

This file tells GraphQL tools where to find Harper's built-in types and directives alongside your own schema files.

##### Creating `graphql.config.yml`

Create a file named `graphql.config.yml` in your project root with the following content:

```yaml
schema:
  - 'node_modules/harper/schema.graphql'
  - 'schema.graphql'
  - 'schemas/*.graphql'
```

##### Why this is important:

1. **Shared Directives**: It includes `@table`, `@primaryKey`, etc., so they aren't marked as "unknown directives".
2. **Context for Agents**: When an agent reads your project, seeing this config helps it locate the core Harper definitions, leading to more accurate code generation.
3. **Consistency**: The `npm create harper@latest` command includes this by default. Manually adding it to existing projects ensures they follow the same standards.

#### Example Project Structure

A typical Harper project with proper schema tooling:

```text
my-harper-app/
├── config.yaml
├── graphql.config.yml
├── package.json
├── schema.graphql
└── resources.js
```

### 1.3 Defining Relationships

Instructions for the agent to follow when defining relationships between Harper tables.

#### When to Use

Use this skill when you need to link data across different tables, enabling automatic joins and efficient related-data fetching via REST APIs.

#### How It Works

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

### 1.4 Vector Indexing

Instructions for the agent to follow when enabling and querying vector indexes for similarity search in Harper using the HNSW algorithm.

#### When to Use

Apply this rule when adding a vector index to a Harper table schema or writing similarity search queries against high-dimensional vector fields. Use it whenever you need approximate nearest-neighbor search, distance-threshold filtering, or distance-scored results.

#### How It Works

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

#### Examples

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

#### Notes

- The default `distance` function is `cosine`. Pass `distance: "euclidean"` to switch.
- `efConstruction` controls index build quality; raising it improves recall at the cost of build time.
- `$distance` is available in both `sort`-based ranking and `conditions`-based threshold queries.
- Use the threshold (`conditions` + `target`) form when you want to bound result quality by a similarity cutoff rather than ranking by similarity.

### 1.5 Using Blob Datatype

Instructions for the agent to follow when working with the Blob data type in Harper.

#### When to Use

Use this skill when you need to store unstructured or large binary data (media, documents) that is too large for standard JSON fields. Blobs provide efficient storage and integrated streaming support.

#### How It Works

1. **Define Blob Fields**: In your GraphQL schema, use the `Blob` type:
   ```graphql
   type MyTable @table {
   	id: ID @primaryKey
   	data: Blob
   }
   ```
2. **Create and Store Blobs**: Use `createBlob()` from Harper's globals to wrap Buffers or Streams:
   ```javascript
   import { tables } from 'harper';
   const blob = createBlob(largeBuffer);
   await tables.MyTable.put('my-id', { data: blob });
   ```
3. **Use Streaming (Optional)**: For very large files, pass a stream to `createBlob()` to avoid loading the entire file into memory.
4. **Read Blob Data**: Retrieve the record and use `.bytes()` or streaming interfaces on the blob field:
   ```javascript
   const record = await tables.MyTable.get('my-id');
   const buffer = await record.data.bytes();
   ```
5. **Ensure Write Completion**: Use `saveBeforeCommit: true` in `createBlob` options if you need the blob fully written before the record is committed.
6. **Handle Errors**: Attach error listeners to the blob object to handle streaming failures.

### 1.6 Handling Binary Data

Instructions for the agent to follow when handling binary data in Harper.

#### When to Use

Use this skill when you need to store binary files (images, audio, etc.) in the database or serve them back to clients via REST endpoints.

#### How It Works

1. **Store Binary Data**: In your resource's `post` or `put` method, convert incoming data to Buffers and then to Blobs using `createBlob` from Harper's globals. Include the MIME type if available:

   ```typescript
   async post(target, record) {
     if (record.data) {
       record.data = createBlob(Buffer.from(record.data, record.encoding || 'base64'), {
         type: record.contentType || 'application/octet-stream',
       });
     }
     return super.post(target, record);
   }
   ```

2. **Serve Binary Data**: In your resource's `get` method, return a response object with the appropriate `Content-Type` and the binary data in the `body`:
   ```typescript
   async get(target) {
    const record = await super.get(target);
    if (record?.data) {
      return {
        status: 200,
        headers: { 'Content-Type': record.data.type || 'application/octet-stream' },
        body: record.data,
      };
    }
    return record;
   }
   ```
3. **Use the Blob Type**: Ensure your GraphQL schema uses the `Blob` scalar for binary fields.

## 2. API & Communication

### 2.1 Automatic APIs

Instructions for the agent to follow when enabling and using Harper's automatically generated REST and WebSocket APIs.

#### When to Use

Apply this rule when adding REST or WebSocket API access to Harper tables or custom resources. Use it when configuring `config.yaml` to expose endpoints, mapping HTTP methods to resource operations, or implementing real-time WebSocket connections on a resource class.

#### How It Works

1. **Enable the REST plugin**: Add `rest: true` to your application's `config.yaml`. This activates the HTTP REST interface and enables WebSocket support by default.

   ```yaml
   rest: true
   ```

   To configure optional behavior:

   ```yaml
   rest:
     lastModified: true # enables Last-Modified response header support
     webSocket: false # disables automatic WebSocket support (enabled by default)
   ```

2. **Export your resource in the schema**: Tables are not exposed by default. Use the `@export` directive in your schema definition to make a table available as a REST endpoint. The exported name defines the base URL path, served on the application HTTP server port (default `9926`).

3. **Use the correct URL structure**: The REST interface follows a consistent path convention.

   | Path                                         | Description                                                                        |
   | -------------------------------------------- | ---------------------------------------------------------------------------------- |
   | `/my-resource`                               | Returns a description of the resource (e.g., table metadata)                       |
   | `/my-resource/`                              | Trailing slash — represents the full collection; append query parameters to search |
   | `/my-resource/record-id`                     | A specific record identified by its primary key                                    |
   | `/my-resource/record-id/`                    | Trailing slash — collection of records with the given id prefix                    |
   | `/my-resource/record-id/with/multiple/parts` | Record id with multiple path segments                                              |

4. **Map HTTP methods to operations**: Each HTTP method maps to a resource method and operation.
   - **GET** — Retrieve a record or search. Calls `get()`.

     ```
     GET /MyTable/123
     GET /MyTable/?name=Harper
     GET /MyTable/123.propertyName
     ```

     Responses include an `ETag` header. Clients may send `If-None-Match` to receive `304 Not Modified` when the record is unchanged.

   - **PUT** — Create or replace a record (upsert). Calls `put(record)`. Properties not in the body are removed.

     ```
     PUT /MyTable/123
     Content-Type: application/json

     { "name": "some data" }
     ```

   - **POST** — Create a new record without specifying a primary key. Calls `post(data)`. The assigned key is returned in the `Location` response header.

     ```
     POST /MyTable/
     Content-Type: application/json

     { "name": "some data" }
     ```

   - **PATCH** — Partially update a record, merging only provided properties. Unspecified properties are preserved.

     ```
     PATCH /MyTable/123
     Content-Type: application/json

     { "status": "active" }
     ```

   - **DELETE** — Delete a record or all records matching a query.
     ```
     DELETE /MyTable/123
     DELETE /MyTable/?status=archived
     ```

5. **Access the auto-generated OpenAPI spec**: Harper generates an OpenAPI specification for all exported resources. Retrieve it at:

   ```
   GET /openapi
   ```

6. **Connect via WebSocket**: When `rest` is enabled, WebSocket support is on by default. Connect to a resource URL to subscribe to change events for that resource.

   ```javascript
   let ws = new WebSocket('wss://server/my-resource/341');
   ws.onmessage = (event) => {
   	let data = JSON.parse(event.data);
   };
   ```

   Connecting to `wss://server/my-resource/341` accesses the `my-resource` resource with record id `341` and subscribes to it. When the record changes or a message is published to it, the WebSocket connection receives the update.

7. **Implement a custom `connect()` handler**: Override `connect(incomingMessages)` on a resource class to control WebSocket behavior. The method must return an async iterable or generator that produces messages to send to the client.

#### Examples

**Simple echo server using an async generator**:

```javascript
export class Echo extends Resource {
	async *connect(incomingMessages) {
		for await (let message of incomingMessages) {
			yield message; // echo each message back
		}
	}
}
```

**Using the default `connect()` with event-style access and a timer**:

```javascript
export class Example extends Resource {
	connect(incomingMessages) {
		let outgoingMessages = super.connect();

		let timer = setInterval(() => {
			outgoingMessages.send({ greeting: 'hi again!' });
		}, 1000);

		incomingMessages.on('data', (message) => {
			outgoingMessages.send(message); // echo incoming messages
		});

		outgoingMessages.on('close', () => {
			clearInterval(timer);
		});

		return outgoingMessages;
	}
}
```

**Minimal `config.yaml` enabling REST with WebSocket disabled**:

```yaml
rest:
  webSocket: false
```

#### Notes

- Tables must be explicitly exported using `@export` in the schema — they are not exposed by default.
- `rest: true` is the minimal configuration to enable both REST and WebSocket support. See [real-time-apps.md](real-time-apps.md) for patterns around real-time WebSocket usage.
- For full query syntax on `GET` and `DELETE` with query parameters, see [querying-rest-apis.md](querying-rest-apis.md).
- The default `connect()` returns an iterable with a `send(message)` method and a `close` event for cleanup on disconnect.
- For MQTT over WebSockets, set the sub-protocol header `Sec-WebSocket-Protocol: mqtt`.
- In distributed environments, non-retained messages are delivered in the order received per node; retained messages (PUT/updated records) keep only the latest-timestamp version as the winning record across the cluster.
- Use the `Content-Type` request header to specify body format and the `Accept` header to request a specific response format.

### 2.2 Querying REST APIs

Instructions for the agent to filter, sort, select, and paginate Harper REST API collections using URL query parameters.

#### When to Use

Apply this rule when building or modifying code that queries Harper REST endpoints with filtering, sorting, field selection, or pagination. Use it whenever constructing URLs against collection paths exposed by Harper's automatic REST interface (see [automatic-apis.md](automatic-apis.md)).

#### How It Works

1. **Filter by attribute**: Add query parameters matching attribute names and values. The queried attribute must be indexed.

   ```
   GET /Product/?category=software
   GET /Product/?category=software&inStock=true
   ```

2. **Apply comparison operators (FIQL syntax)**: Use FIQL operators directly in query parameter values.

   | Operator     | Meaning                                |
   | ------------ | -------------------------------------- |
   | `==`         | Equal                                  |
   | `=lt=`       | Less than                              |
   | `=le=`       | Less than or equal                     |
   | `=gt=`       | Greater than                           |
   | `=ge=`       | Greater than or equal                  |
   | `=ne=`, `!=` | Not equal                              |
   | `=ct=`       | Contains (strings)                     |
   | `=sw=`       | Starts with (strings)                  |
   | `=ew=`       | Ends with (strings)                    |
   | `=`, `===`   | Strict equality (no type conversion)   |
   | `!==`        | Strict inequality (no type conversion) |

   ```
   GET /Product/?price=gt=100
   GET /Product/?price=le=20
   GET /Product/?name==Keyboard*
   GET /Product/?category=software&price=gt=100&price=lt=200
   ```

   For date fields, URL-encode colons as `%3A`:

   ```
   GET /Product/?listDate=gt=2017-03-08T09%3A30%3A00.000Z
   ```

3. **Chain conditions for range queries**: Omit the attribute name on the second condition to apply it to the same attribute. Only `gt`/`ge` combined with `lt`/`le` is supported.

   ```
   GET /Product/?price=gt=100&lt=200
   ```

4. **Combine conditions with OR logic**: Use `|` instead of `&`.

   ```
   GET /Product/?rating=5|featured=true
   ```

5. **Group conditions**: Use parentheses or square brackets to control order of operations. Prefer square brackets when constructing queries from user input, since standard URI encoding safely encodes `[` and `]`.

   ```
   GET /Product/?rating=5|(price=gt=100&price=lt=200)
   GET /Product/?rating=5&[tag=fast|tag=scalable|tag=efficient]
   ```

   Construct grouped queries from JavaScript:

   ```javascript
   let url = `/Product/?rating=5&[${tags.map(encodeURIComponent).join('|')}]`;
   ```

6. **Select specific properties with `select(`**: Use `select()` to control which fields are returned.

   | Syntax                                 | Returns                                     |
   | -------------------------------------- | ------------------------------------------- |
   | `?select(property)`                    | Values of a single property directly        |
   | `?select(property1,property2)`         | Objects with only the specified properties  |
   | `?select([property1,property2])`       | Arrays of property values                   |
   | `?select(property1,)`                  | Objects with a single specified property    |
   | `?select(property{subProp1,subProp2})` | Nested objects with specific sub-properties |

   ```
   GET /Product/?category=software&select(name)
   GET /Product/?brand.name=Microsoft&select(name,brand{name})
   ```

7. **Limit results with `limit(`**: Use `limit(end)` or `limit(start,end)` to paginate.

   ```
   GET /Product/?rating=gt=3&inStock=true&select(rating,name)&limit(20)
   GET /Product/?rating=gt=3&limit(10,30)
   ```

8. **Sort results with `sort(`**: Use `sort(property)` or `sort(+property,-property,...)`. Prefix `+` or no prefix = ascending; `-` = descending.

   ```
   GET /Product/?rating=gt=3&sort(+name)
   GET /Product/?sort(+rating,-price)
   ```

9. **Query across relationships**: Use dot-syntax to filter by related table attributes. Relationships must be defined in the schema using `@relation`.

   ```
   GET /Product/?brand.name=Microsoft
   GET /Brand/?products.name=Keyboard
   ```

   Use `select()` to include relationship attributes in the response (they are not included by default):

   ```
   GET /Product/?brand.name=Microsoft&select(name,brand{name})
   ```

10. **Access a specific property by URL**: Append the property name with dot syntax to the record ID. Only works for properties declared in the schema.
    ```
    GET /MyTable/123.propertyName
    ```

#### Examples

**Range filter with select and limit:**

```
GET /Product/?category=software&price=gt=100&price=lt=200&select(name,price)&limit(20)
```

**Sort descending with multiple fields:**

```
GET /Product/?sort(+rating,-price)
```

**OR logic with grouping:**

```
GET /Product/?price=lt=100|[rating=5&[tag=fast|tag=scalable|tag=efficient]&inStock=true]
```

**Relationship join with nested select:**

```
GET /Product/?brand.name=Microsoft&select(name,brand{name,id})
```

**Schema defining a relationship for join queries:**

```graphql
type Product @table @export {
	id: Long @primaryKey
	name: String
	brandId: Long @indexed
	brand: Brand @relation(from: "brandId")
}
type Brand @table @export {
	id: Long @primaryKey
	name: String
	products: [Product] @relation(to: "brandId")
}
```

**Many-to-many relationship query:**

```graphql
type Product @table @export {
	id: Long @primaryKey
	name: String
	resellerIds: [Long] @indexed
	resellers: [Reseller] @relation(from: "resellerId")
}
```

```
GET /Product/?resellers.name=Cool Shop&select(id,name,resellers{name,id})
```

**Type conversion with explicit prefix:**

```
GET /Product/?price==number:123
GET /Product/?active==boolean:true
GET /Product/?listDate==date:2024-01-05T20%3A07%3A27.955Z
```

#### Notes

- Only indexed attributes can be used as the primary filter; additional unindexed attributes can be combined with `&` once at least one indexed attribute is present.
- For null value queries, use `?attribute=null`. Indexes must have been created with null indexing support; existing indexes must be removed and re-added to support null queries.
- FIQL comparators (`==`, `!=`, `=gt=`, etc.) apply automatic type conversion based on value syntax or schema-declared type. Strict operators (`=`, `===`, `!==`) skip automatic type conversion.
- Filtering by a related attribute produces INNER JOIN behavior (only records with a matching related record are returned). Using `select()` on a relationship without a filter produces LEFT JOIN behavior.
- The array order of foreign key values in many-to-many relationships is preserved when resolving the relationship.
- See [automatic-apis.md](automatic-apis.md) for how Harper tables are automatically exposed as REST endpoints.

### 2.3 Real-Time Apps with WebSockets and Pub/Sub

Instructions for the agent to follow when building real-time features in Harper using WebSockets and Pub/Sub.

#### When to Use

Apply this rule when implementing any feature that requires real-time bidirectional communication, live data streaming, or push-based updates in a Harper application. This includes chat, live dashboards, sensor feeds, and any scenario where clients must receive resource changes as they happen.

#### How It Works

1. **Enable WebSocket support**: WebSocket support is enabled automatically when the `rest` plugin is enabled. To explicitly disable it, set the following in your config:

   ```yaml
   rest:
     webSocket: false
   ```

2. **Connect a client to a resource**: A WebSocket connection to a resource URL automatically subscribes to that resource. When the record changes or a message is published to it, the connection receives the update.

   ```javascript
   let ws = new WebSocket('wss://server/my-resource/341');
   ws.onmessage = (event) => {
   	let data = JSON.parse(event.data);
   };
   ```

   `new WebSocket('wss://server/my-resource/341')` accesses the resource defined for `my-resource` with record id `341` and subscribes to it.

3. **Implement a custom `connect()` handler**: Override the `connect(incomingMessages)` method on a resource class to control WebSocket behavior. The method must return an async iterable (or generator) that produces messages to send to the client. See [automatic-apis.md](automatic-apis.md) for more on defining resource classes.

4. **Use the default `connect()` for event-style access**: Call `super.connect()` to get a streaming iterable that provides:
   - A `send(message)` method for pushing outgoing messages
   - A `close` event for cleanup on disconnect

5. **Handle message ordering in distributed environments**: Harper delivers messages to local subscribers immediately without inter-node coordination delay.

   | Message Type                                             | Behavior                                                                |
   | -------------------------------------------------------- | ----------------------------------------------------------------------- |
   | Non-retained (no `retain` flag)                          | Every message delivered in order received; suitable for chat            |
   | Retained (published with `retain`, or PUT/updated in DB) | Only the latest-timestamp message is kept; suitable for sensor readings |

6. **Use MQTT over WebSockets** when needed by setting the sub-protocol header:
   ```
   Sec-WebSocket-Protocol: mqtt
   ```

#### Examples

**Simple echo server** — override `connect(incomingMessages)` to yield each incoming message back to the client:

```javascript
export class Echo extends Resource {
	async *connect(incomingMessages) {
		for await (let message of incomingMessages) {
			yield message; // echo each message back
		}
	}
}
```

**Custom connect with timer and event-style access** — use `super.connect()` to get the outgoing stream, push periodic messages, echo incoming messages, and clean up on disconnect:

```javascript
export class Example extends Resource {
	connect(incomingMessages) {
		let outgoingMessages = super.connect();

		let timer = setInterval(() => {
			outgoingMessages.send({ greeting: 'hi again!' });
		}, 1000);

		incomingMessages.on('data', (message) => {
			outgoingMessages.send(message); // echo incoming messages
		});

		outgoingMessages.on('close', () => {
			clearInterval(timer);
		});

		return outgoingMessages;
	}
}
```

#### Notes

- WebSocket connections target a resource URL path. By default, connecting to a resource subscribes to changes for that resource.
- The `connect(incomingMessages)` method **must** return an async iterable or generator; returning a plain value will not work.
- `super.connect()` returns a streaming iterable with `send(message)` and a `close` event — use this when you need to push messages outside of the incoming message loop.
- For one-way real-time streaming without bidirectional communication, consider Server-Sent Events instead.
- For full pub/sub capabilities, Harper also supports MQTT; set `Sec-WebSocket-Protocol: mqtt` to use MQTT over WebSockets.

### 2.4 Checking Authentication

Instructions for the agent to follow when handling user authentication and session management inside Harper Resources.

#### When to Use

Apply this rule when implementing authentication checks, login/logout flows, or token issuance inside a custom Resource. Use it any time a Resource needs to identify the current user, establish a session, or issue JWTs to clients. See [custom-resources.md](custom-resources.md) for the general Resource authoring pattern.

#### How It Works

1. **Check the current user** with `getCurrentUser()`. Call it inside any Resource method to retrieve the authenticated user or `undefined` if no user is authenticated. Guard protected endpoints by returning a `401` when the result is `undefined`.

   ```javascript
   async get(target) {
     const user = this.getCurrentUser();
     if (!user) return new Response(null, { status: 401 });
     return { username: user.username, role: user.role };
   }
   ```

   The returned object exposes `username`, `role`, and `role.permission` flags.

2. **Enable sessions** before using session-based login. Set `authentication.enableSessions: true` in `harperdb-config.yaml`:

   ```yaml
   authentication:
     enableSessions: true
   ```

3. **Access login and session helpers** via `getContext()`. The context object exposes `context.login` and `context.session` for sign-in/out flows.
   - Call `context.login(username, password)` to verify credentials and establish a session cookie on success.
   - To end a session, delete it via `context.session.delete(context.session.id)`.

4. **Implement sign-in and sign-out Resources** using the context helpers:

   ```javascript
   export class SignIn extends Resource {
   	async post(_target, data) {
   		const context = this.getContext();
   		try {
   			await context.login(data.username, data.password);
   		} catch {
   			return new Response('Invalid credentials', { status: 403 });
   		}
   		return new Response('Logged in', { status: 200 });
   	}
   }

   export class SignOut extends Resource {
   	async post() {
   		const context = this.getContext();
   		if (!context.session) { return new Response(null, { status: 401 }); }
   		await context.session.delete(context.session.id);
   		return new Response('Logged out', { status: 200 });
   	}
   }
   ```

5. **Issue JWTs for non-browser clients** (CLI tools, mobile apps, service-to-service). Cookie-based sessions are intended for browser clients. For other clients, mint tokens programmatically using `server.operation()`:

   ```javascript
   import { Resource, server } from 'harper';

   export class IssueTokens extends Resource {
   	static async get(_target, context) {
   		const { operation_token, refresh_token } = await server.operation(
   			{ operation: 'create_authentication_tokens' },
   			context,
   			true,
   		);
   		return { operation_token, refresh_token };
   	}

   	static async post(_target, data) {
   		const { username, password } = await data;
   		if (!username || !password) {
   			return new Response('username and password required', { status: 400 });
   		}
   		const { operation_token, refresh_token } = await server.operation({
   			operation: 'create_authentication_tokens',
   			username,
   			password,
   		});
   		return { operation_token, refresh_token };
   	}
   }

   export class RefreshJWT extends Resource {
   	static async post(_target, data) {
   		const { refresh_token } = await data;
   		if (!refresh_token) {
   			return new Response('refresh_token required', { status: 400 });
   		}
   		const { operation_token } = await server.operation({
   			operation: 'refresh_operation_token',
   			refresh_token,
   		});
   		return { operation_token };
   	}
   }
   ```

   Pass `true` as the third argument to `server.operation()` when the operation should run as the current authenticated user. Omit it or pass `false` when the operation supplies its own credentials.

6. **Configure JWT token expiry** in `harperdb-config.yaml` under the `authentication` section:

   ```yaml
   authentication:
     operationTokenTimeout: 1d
     refreshTokenTimeout: 30d
   ```

   Duration strings follow the `jsonwebtoken` package format (e.g., `1d`, `12h`, `60m`).

#### Examples

**Protecting a resource endpoint and returning user info:**

```javascript
async get(target) {
  const user = this.getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  return { username: user.username, role: user.role };
}
```

**Full session-based sign-in/sign-out flow:**

```javascript
export class SignIn extends Resource {
	async post(_target, data) {
		const context = this.getContext();
		try {
			await context.login(data.username, data.password);
		} catch {
			return new Response('Invalid credentials', { status: 403 });
		}
		return new Response('Logged in', { status: 200 });
	}
}

export class SignOut extends Resource {
	async post() {
		const context = this.getContext();
		if (!context.session) { return new Response(null, { status: 401 }); }
		await context.session.delete(context.session.id);
		return new Response('Logged out', { status: 200 });
	}
}
```

**JWT token refresh endpoint:**

```javascript
export class RefreshJWT extends Resource {
	static async post(_target, data) {
		const { refresh_token } = await data;
		if (!refresh_token) {
			return new Response('refresh_token required', { status: 400 });
		}
		const { operation_token } = await server.operation({
			operation: 'refresh_operation_token',
			refresh_token,
		});
		return { operation_token };
	}
}
```

#### Notes

- `getCurrentUser()` and `getContext()` are instance methods; call them with `this` inside non-static Resource methods.
- `enableSessions` must be `true` in config before `context.login` or `context.session` will function.
- Cookie-based sessions target browser clients. Use JWT issuance via `server.operation()` for all other client types.
- When both `operation_token` and `refresh_token` have expired, the client must call `create_authentication_tokens` again with credentials.

## 3. Logic & Extension

### 3.1 Custom Resources

Instructions for the agent to follow when creating custom resources in Harper.

#### When to Use

Use this skill when the automatic CRUD operations provided by `@table @export` are insufficient, and you need custom logic, third-party API integration, or specialized data handling for your REST endpoints.

#### How It Works

1. **Check if a Custom Resource is Necessary**: Verify if [Automatic APIs](./automatic-apis.md) or [Extending Tables](./extending-tables.md) can satisfy the requirement first.
2. **Create the Resource File**: Create a `.ts` or `.js` file in the directory specified by `jsResource` in `config.yaml` (typically `resources/`).
3. **Define the Resource Class**: Export a class extending `Resource` from `harper`:

   ```typescript
   import { type RequestTargetOrId, Resource } from 'harper';

   export class MyResource extends Resource {
   	async get(target?: RequestTargetOrId) {
   		return { message: 'Hello from custom GET!' };
   	}
   }
   ```

4. **Implement HTTP Methods**: Add methods like `get`, `post`, `put`, `patch`, or `delete` to handle corresponding requests.
5. **Route Nesting and Naming**: You can control the URL structure by how you export your resources:
   - **Direct Class Export**: `export class Foo extends Resource` creates endpoints at `/Foo/`. Class names are case-sensitive in the URL.
   - **Nested Objects**: `export const Bar = { Foo };` creates endpoints at `/Bar/Foo/`.
   - **Lowercase and Hyphens**: Use object keys to define custom paths: `export const bar = { 'foo-baz': Foo };` exposes endpoints at `/bar/foo-baz/`.
6. **Access Tables (Optional)**: Import and use the `tables` object to interact with your data:
   ```typescript
   import { tables } from 'harper';
   // ... inside a method
   const results = await tables.MyTable.list();
   ```
7. **Configure Loading**: Ensure `config.yaml` points to your resource files (e.g., `jsResource: { files: 'resources/*.ts' }`).

### 3.2 Extending Tables

Instructions for the agent to follow when extending table resources in Harper.

#### When to Use

Use this skill when you need to add custom validation, side effects (like webhooks), data transformation, or custom access control to the standard CRUD operations of a Harper table.

#### How It Works

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

### 3.3 Programmatic Table Requests

Instructions for the agent to follow when interacting with Harper tables via code.

#### When to Use

Use this skill when you need to perform database operations (CRUD, search, subscribe) from within Harper Resources or scripts.

#### How It Works

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

#### Query Conditions

When passing a query to `search()`, `get()`, or `subscribe()`, use a query object with a `conditions` array.

##### Condition Object Shape

| Property     | Description                                                                                |
| ------------ | ------------------------------------------------------------------------------------------ |
| `attribute`  | Field name, or array of field names to traverse a relationship (e.g., `['brand', 'name']`) |
| `value`      | The value to compare against                                                               |
| `comparator` | One of the comparator strings below (default: `equals`)                                    |
| `operator`   | `and` (default) or `or` — applies to a nested `conditions` block                           |
| `conditions` | Nested array of condition objects for complex AND/OR logic                                 |

##### Comparator Values

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

##### Query Object Parameters

| Property     | Description                                                                          |
| ------------ | ------------------------------------------------------------------------------------ |
| `conditions` | Array of condition objects                                                           |
| `limit`      | Maximum number of records to return                                                  |
| `offset`     | Number of records to skip (for pagination)                                           |
| `select`     | Array of attribute names to return; supports `$id` and `$updatedtime`                |
| `sort`       | Object with `attribute`, `descending` (bool), and optional `next` for secondary sort |

##### Examples

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

#### Cautions

Be very careful when performing updates and deletions! You may be dealing with live production data. The wrong request to delete, without approval from a human, could be devastating to a business. Always use the proper approval process.

### 3.4 TypeScript Type Stripping

Instructions for the agent to follow when using TypeScript in Harper.

#### When to Use

Use this skill when you want to write Harper Resources in TypeScript and have them execute directly in Node.js without an intermediate build or compilation step.

#### How It Works

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

### 3.5 Caching External Data Sources in Harper

Instructions for the agent to implement integrated data caching in Harper by wrapping external sources with a cache table and `sourcedFrom`.

#### When to Use

Apply this rule when a Harper application needs to cache responses from an external API, microservice, or database to avoid repeated slow or expensive upstream calls. Use it whenever you need to define TTL-based cache expiration, observe ETag-based conditional responses, or manually invalidate cached entries.

#### How It Works

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

#### Examples

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

#### Notes

- `expiration` is measured in seconds. Harper also supports separate `eviction` and `scanInterval` arguments on `@table` for fine-grained control over physical record removal.
- The `@export` directive on the schema type is not required when you export a Resource class of the same name from `resources.js` — the class export serves as the endpoint registration. See [custom-resources.md](custom-resources.md) for details on building Resource classes.
- Harper's REST layer automatically exposes `@export`-ed tables and Resource classes as HTTP endpoints. See [automatic-apis.md](automatic-apis.md) for how endpoints are structured and named.
- ETag values include their double quotes as part of the value — include them verbatim when passing the value in `If-None-Match`.
- `sourcedFrom` must be called after the table reference (`tables.JokeCache`) is available, which is guaranteed when the call is at the top level of `resources.js`.

## 4. Infrastructure & Ops

### 4.1 Deploying to Harper Fabric

Instructions for the agent to follow when deploying a Harper application to the Harper Fabric cloud using the Harper CLI.

#### When to Use

Apply this rule when deploying a Harper application to a remote Harper instance or Harper Fabric cluster. This covers interactive deployments, CI/CD pipelines, and any scenario where the agent must push a local or remote package to a target environment.

#### How It Works

1. **Authenticate with the remote target**: Run `harper login` once to store an authentication token. The CLI writes `HARPER_CLI_TARGET` to a local `.env` so subsequent commands do not need credentials repeated. Find the **Application URL** on the cluster's **Config → Overview** page (see [creating-a-fabric-account-and-cluster.md](creating-a-fabric-account-and-cluster.md)).

   ```bash
   harper login <Application URL>
   # Provide cluster username and password when prompted
   ```

2. **Deploy the application**: Run `harper deploy` with the required parameters. After logging in, no credentials are needed inline.

   ```bash
   harper deploy \
     project=<name> \
     package=<package> \
     target=<remote> \
     restart=true \
     replicated=true
   ```

3. **Choose a package source**: Set the `package` parameter to any valid npm dependency value, or omit it to package and deploy the current local directory.

   | Value                                                | Effect                                           |
   | ---------------------------------------------------- | ------------------------------------------------ |
   | _(omitted)_                                          | Packages and deploys the current local directory |
   | `"@harperdb/status-check"`                           | npm package                                      |
   | `"HarperDB/status-check"`                            | GitHub repo (short form)                         |
   | `"https://github.com/HarperDB/status-check"`         | GitHub repo (full URL)                           |
   | `"git+ssh://git@github.com:HarperDB/secret-app.git"` | Private repo via SSH                             |
   | `"https://example.com/application.tar.gz"`           | Remote tarball                                   |

   For git tags, use the `semver` directive for reliable versioning:

   ```
   HarperDB/application-template#semver:v1.0.0
   ```

4. **Authenticate for CI/CD pipelines**: Use environment variables instead of interactive login. Set credentials before running `harper deploy`.

   ```bash
   export HARPER_CLI_USERNAME=<username>
   export HARPER_CLI_PASSWORD=<password>
   harper deploy \
     project=<name> \
     package=<package> \
     target=<remote> \
     restart=true \
     replicated=true
   ```

5. **Register SSH keys for private repos**: Before deploying from an SSH-based private repository, use the Add SSH Key operation to register the key with the remote instance.

#### Examples

**Interactive login then deploy (recommended):**

```bash
# Log in once
harper login <remote>
# Provide your username and password when prompted

# Subsequently deploy without credentials
harper deploy \
  project=<name> \
  package=<package> \
  target=<remote> \
  restart=true \
  replicated=true
```

**Deploy with inline credentials (not recommended for production):**

```bash
harper deploy \
  project=<name> \
  package=<package> \
  username=<username> \
  password=<password> \
  target=<remote> \
  restart=true \
  replicated=true
```

**Deploy a specific GitHub release by semver tag:**

```bash
harper deploy \
  project=my-app \
  package="HarperDB/application-template#semver:v1.0.0" \
  target=<remote> \
  restart=true \
  replicated=true
```

#### Notes

- Always prefer `harper login` for interactive use and environment variables (`HARPER_CLI_USERNAME`, `HARPER_CLI_PASSWORD`) for CI/CD. Avoid inline `username`/`password` parameters in production.
- Omitting `package` causes the CLI to package the current local directory. Specifying a local file path creates a symlink, so changes are picked up between restarts without redeploying.
- Harper generates a `package.json` from component configurations and resolves dependencies using a form of `npm install`.
- For SSH-based private repos, register keys with the Add SSH Key operation before deploying.

### 4.2 Creating a Harper Fabric Account and Cluster

Follow these steps to set up your Harper Fabric environment for deployment.

#### How It Works

1. **Sign Up/In**: Go to [https://fabric.harper.fast/](https://fabric.harper.fast/) and sign up or sign in.
2. **Create an Organization**: Create an organization (org) to manage your projects.
3. **Create a Cluster**: Create a new cluster. This can be on the free tier, no credit card required.
4. **Set Credentials**: During setup, set the cluster username and password to finish configuring it.
5. **Get Application URL**: Navigate to the **Config** tab and copy the **Application URL**.
6. **Configure Environment**: Update your `.env` file or GitHub Actions secrets with cluster-specific credentials.
7. **Next Steps**: See the [deploying-to-harper-fabric](deploying-to-harper-fabric.md) rule for detailed instructions on deploying your application successfully.

#### Examples

##### Environment Configuration

```bash
CLI_TARGET_USERNAME='YOUR_CLUSTER_USERNAME'
CLI_TARGET_PASSWORD='YOUR_CLUSTER_PASSWORD'
CLI_TARGET='YOUR_CLUSTER_URL'
```

### 4.3 Creating Harper Applications

The fastest way to start a new Harper project is using the `create-harper` CLI tool. This command initializes a project with a standard folder structure, essential configuration files, and basic schema definitions.

#### When to Use

Use this command when starting a new Harper application or adding a new Harper microservice to an existing architecture.

#### Commands

Initialize a project using your preferred package manager:

##### NPM

```bash
npm create harper@latest
```

##### PNPM

```bash
pnpm create harper@latest
```

##### Bun

```bash
bun create harper@latest
```

#### Options

You can specify the project name and template directly:

```bash
npm create harper@latest my-app --template default
```

#### Next Steps

1. **Configure Environment**: Set up your `.env` file with local or cloud credentials.
2. **Define Schema**: Modify `schema.graphql` to fit your application's data model.
3. **Start Development**: Run `npm run dev` to start the local Harper instance.
4. **Deploy**: Use `npm run deploy` to push your application to Harper Fabric.

### 4.4 Serving Web Content

Instructions for the agent to follow when serving web content from Harper.

#### When to Use

Use this skill when you need to serve a frontend (HTML, CSS, JS, or a React app) directly from your Harper instance.

#### How It Works

1. **Choose a Method**: Decide between the simple Static Plugin or the integrated Vite Plugin.
2. **Option A: Static Plugin (Simple)**:
   - Add to `config.yaml`:
     ```yaml
     static:
       files: 'web/*'
     ```
   - Place files in a `web/` folder in the project root.
   - Files are served at the root URL (e.g., `http://localhost:9926/index.html`).
3. **Option B: Vite Plugin (Advanced/Development)**:
   - Add to `config.yaml`:
     ```yaml
     '@harperfast/vite-plugin':
       package: '@harperfast/vite-plugin'
     ```
   - Ensure `vite.config.ts` and `index.html` are in the project root.

   ```javascript
   import vue from '@vitejs/plugin-vue';
   import path from 'node:path';
   import { defineConfig } from 'vite';

   // https://vite.dev/config/
   export default defineConfig({
   	plugins: [vue()],
   	resolve: {
   		alias: {
   			'@': path.resolve(import.meta.dirname, './src'),
   		},
   	},
   	build: {
   		outDir: 'web',
   		emptyOutDir: true,
   		rolldownOptions: {
   			external: ['**/*.test.*', '**/*.spec.*'],
   		},
   	},
   });
   ```

   - Install dependencies: `npm install --save-dev vite @harperfast/vite-plugin`.
   - Then `harper run .` will start up Harper and Vite with HMR. Vite does _not_ need to be executed separately.

4. **Deploy for Production**: For Vite apps, use a build script to generate static files into a `web/` folder and deploy them using the static handler pattern. For example, these scripts in a package.json can perform the necessary steps:
   ```json
   "build": "vite build",
   "deploy": "rm -Rf deploy && npm run build && mkdir deploy && mv web deploy/ && cp -R deploy-template/* deploy/ && cp -R schemas resources deploy/ && (cd deploy && harper deploy_component . project=web restart=rolling replicated=true) && rm -Rf deploy",
   ```
   Then in production, the "Static Plugin" option will performantly and securely serve your assets. `npm create harper@latest` scaffolds all of this for you.

### 4.5 Harper Logging

Instructions for the agent to follow when implementing logging in Harper applications, including direct logger usage, tagged loggers, and console capture behavior.

#### When to Use

Apply this rule when writing any JavaScript component, plugin, or resource that needs to emit structured log entries, filter logs by component, or capture existing `console.log` output into Harper's log system. Use it whenever you need to understand log levels, log entry format, or the `logger` global API.

#### How It Works

1. **Use the `logger` global directly** — `logger` is available in all JavaScript components without any imports. Call the method matching the desired severity level:

   ```javascript
   logger.trace('detailed trace message');
   logger.debug('debug info', { someContext: 'value' });
   logger.info('informational message');
   logger.warn('potential issue');
   logger.error('error occurred', error);
   logger.fatal('fatal error');
   logger.notify('server is ready');
   ```

   Only entries at or above the configured `logging.level` (or `logging.external.level`) are written to `hdb.log`.

2. **Create a tagged logger with `withTag(`** — Call `logger.withTag(tag)` once per module or class to get a `TaggedLogger` scoped to that tag. This prefixes every log entry with the tag, making log output filterable by component.

   ```javascript
   const log = logger.withTag('my-resource');
   ```

   Because `TaggedLogger` methods for disabled levels are `null`, always use optional chaining (`?.`) when calling them:

   ```javascript
   log.debug?.('Fetching record', { id });
   log.warn?.('Record not found', { id });
   log.error?.('Failed to update record', err);
   ```

   `TaggedLogger` does not have a `withTag()` method.

3. **Understand the interface contracts** — `MainLogger` always has all methods defined:

   ```typescript
   interface MainLogger {
   	trace(...messages: any[]): void;
   	debug(...messages: any[]): void;
   	info(...messages: any[]): void;
   	warn(...messages: any[]): void;
   	error(...messages: any[]): void;
   	fatal(...messages: any[]): void;
   	notify(...messages: any[]): void;
   	withTag(tag: string): TaggedLogger;
   }
   ```

   `TaggedLogger` methods may be `null`:

   ```typescript
   interface TaggedLogger {
   	trace: ((...messages: any[]) => void) | null;
   	debug: ((...messages: any[]) => void) | null;
   	info: ((...messages: any[]) => void) | null;
   	warn: ((...messages: any[]) => void) | null;
   	error: ((...messages: any[]) => void) | null;
   	fatal: ((...messages: any[]) => void) | null;
   	notify: ((...messages: any[]) => void) | null;
   }
   ```

4. **Know the log levels** — From least to most severe:

   | Level    | Description                                                          |
   | -------- | -------------------------------------------------------------------- |
   | `trace`  | Highly detailed internal execution tracing.                          |
   | `debug`  | Diagnostic information useful during development.                    |
   | `info`   | General operational events.                                          |
   | `warn`   | Potential issues that don't prevent normal operation.                |
   | `error`  | Errors that affect specific operations.                              |
   | `fatal`  | Critical errors causing process termination.                         |
   | `notify` | Important operational milestones. Always logged regardless of level. |

   The default log level is `warn`. Setting a level includes that level and all more-severe levels.

5. **Enable console capture when porting existing code** — When `logging.console: true` is set, writes via `console.log`, `console.warn`, `console.error`, etc. are appended verbatim to `hdb.log`. Captured lines do **not** pass through `logger`'s level filter. Prefer `logger` directly in production code so that level filtering and tagging apply. Console capture is intended as a convenience for porting existing code and for debugging.

6. **Know where logs are written** — All standard log output goes to `<ROOTPATH>/log/hdb.log` (default: `~/hdb/log/hdb.log`). To also log to `stdout`/`stderr`, set `logging.stdStreams: true`.

#### Examples

##### Basic logging in a resource

```javascript
export class MyResource extends Resource {
	async get(id) {
		logger.debug('Fetching record', { id });
		const record = await super.get(id);
		if (!record) {
			logger.warn('Record not found', { id });
		}
		return record;
	}

	async put(record) {
		logger.info('Updating record', { id: record.id });
		try {
			return await super.put(record);
		} catch (err) {
			logger.error('Failed to update record', err);
			throw err;
		}
	}
}
```

##### Tagged logging with `withTag()`

```javascript
const log = logger.withTag('my-resource');

export class MyResource extends Resource {
	async get(id) {
		log.debug?.('Fetching record', { id });
		const record = await super.get(id);
		if (!record) {
			log.warn?.('Record not found', { id });
		}
		return record;
	}

	async put(record) {
		log.info?.('Updating record', { id: record.id });
		try {
			return await super.put(record);
		} catch (err) {
			log.error?.('Failed to update record', err);
			throw err;
		}
	}
}
```

Tagged entries appear in `hdb.log` with the tag in the header:

```
2023-03-09T14:25:05.269Z [info] [my-resource]: Updating record
```

#### Notes

- All log output is written to `<ROOTPATH>/log/hdb.log`. The `logger` global writes to this file at the configured `logging.external` level.
- Log entry format for `logger`: `<timestamp> [<level>] [<thread>/<id>]: <message>`
- Log entry format for `TaggedLogger`: `<timestamp> [<level>] [<tag>]: <message>`
- `console.log` output is only forwarded to `hdb.log` when `logging.console: true` is explicitly set; it is not forwarded by default.
- When logging to standard streams, run Harper in the foreground (`harper`, not `harper start`).
- `TaggedLogger` is bound to the configured log level at creation time — always use `?.` on its methods.
