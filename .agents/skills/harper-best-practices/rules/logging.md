---
name: logging
description: >-
  Best practices for logging in Harper, including console capture, the granular
  logger interface, and programmatic log retrieval.
metadata:
  mode: generate
  sources:
    - reference/v5/logging/overview.md
    - reference/v5/logging/api.md
  sourceCommit: b7fbddadd42eb4487190b650a9abc4bcfeef5819
  inputHash: 46cd384598304e3b
---

# Harper Logging

Instructions for the agent to follow when implementing logging in Harper applications, including direct logger usage, tagged loggers, and console capture behavior.

## When to Use

Apply this rule when writing any JavaScript component, plugin, or resource that needs to emit structured log entries, filter logs by component, or capture existing `console.log` output into Harper's log system. Use it whenever you need to understand log levels, log entry format, or the `logger` global API.

## How It Works

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

## Examples

### Basic logging in a resource

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

### Tagged logging with `withTag()`

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

## Notes

- All log output is written to `<ROOTPATH>/log/hdb.log`. The `logger` global writes to this file at the configured `logging.external` level.
- Log entry format for `logger`: `<timestamp> [<level>] [<thread>/<id>]: <message>`
- Log entry format for `TaggedLogger`: `<timestamp> [<level>] [<tag>]: <message>`
- `console.log` output is only forwarded to `hdb.log` when `logging.console: true` is explicitly set; it is not forwarded by default.
- When logging to standard streams, run Harper in the foreground (`harper`, not `harper start`).
- `TaggedLogger` is bound to the configured log level at creation time — always use `?.` on its methods.
