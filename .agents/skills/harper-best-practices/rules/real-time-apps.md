---
name: real-time-apps
description: How to build real-time features in Harper using WebSockets and Pub/Sub.
metadata:
  mode: generate
  sources:
    - reference/v5/rest/websockets.md
  sourceCommit: b7fbddadd42eb4487190b650a9abc4bcfeef5819
  inputHash: a8afd4d3a52f77ba
---

# Real-Time Apps with WebSockets and Pub/Sub

Instructions for the agent to follow when building real-time features in Harper using WebSockets and Pub/Sub.

## When to Use

Apply this rule when implementing any feature that requires real-time bidirectional communication, live data streaming, or push-based updates in a Harper application. This includes chat, live dashboards, sensor feeds, and any scenario where clients must receive resource changes as they happen.

## How It Works

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

## Examples

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

## Notes

- WebSocket connections target a resource URL path. By default, connecting to a resource subscribes to changes for that resource.
- The `connect(incomingMessages)` method **must** return an async iterable or generator; returning a plain value will not work.
- `super.connect()` returns a streaming iterable with `send(message)` and a `close` event — use this when you need to push messages outside of the incoming message loop.
- For one-way real-time streaming without bidirectional communication, consider Server-Sent Events instead.
- For full pub/sub capabilities, Harper also supports MQTT; set `Sec-WebSocket-Protocol: mqtt` to use MQTT over WebSockets.
