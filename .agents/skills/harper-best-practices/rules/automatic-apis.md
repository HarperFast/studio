---
name: automatic-apis
description: How to use Harper's automatically generated REST and WebSocket APIs.
metadata:
  mode: generate
  sources:
    - reference/v5/rest/overview.md
    - reference/v5/rest/websockets.md
  sourceCommit: b7fbddadd42eb4487190b650a9abc4bcfeef5819
  inputHash: 8fcf0cfe190e013e
---

# Automatic APIs

Instructions for the agent to follow when enabling and using Harper's automatically generated REST and WebSocket APIs.

## When to Use

Apply this rule when adding REST or WebSocket API access to Harper tables or custom resources. Use it when configuring `config.yaml` to expose endpoints, mapping HTTP methods to resource operations, or implementing real-time WebSocket connections on a resource class.

## How It Works

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

## Examples

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

## Notes

- Tables must be explicitly exported using `@export` in the schema — they are not exposed by default.
- `rest: true` is the minimal configuration to enable both REST and WebSocket support. See [real-time-apps.md](real-time-apps.md) for patterns around real-time WebSocket usage.
- For full query syntax on `GET` and `DELETE` with query parameters, see [querying-rest-apis.md](querying-rest-apis.md).
- The default `connect()` returns an iterable with a `send(message)` method and a `close` event for cleanup on disconnect.
- For MQTT over WebSockets, set the sub-protocol header `Sec-WebSocket-Protocol: mqtt`.
- In distributed environments, non-retained messages are delivered in the order received per node; retained messages (PUT/updated records) keep only the latest-timestamp version as the winning record across the cluster.
- Use the `Content-Type` request header to specify body format and the `Accept` header to request a specific response format.
