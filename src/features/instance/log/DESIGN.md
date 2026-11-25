# Logs — design notes

[`MAP.md`](MAP.md) indexes the code. This file is the contract for the bookmark URL: an inbound link that opens the
explorer on one log entry and the minute around it. The bare `/logs` path, with no bookmark, opens the default view.

## The bookmark URL

```
/#/{organizationId}/{clusterId}/logs?log=<json>                         a Fabric cluster
/#/{organizationId}/{clusterId}/instance/{instanceId}/logs?log=<json>   one instance in it
/#/logs?log=<json>                                                       the Studio a Harper serves
```

`<json>` is a URL-encoded JSON object, and all five keys are required:

```json
{
	"timestamp": "2026-11-19T21:45:00.123Z",
	"node": "node-a",
	"thread": "http/2",
	"fingerprint": "hutvc5",
	"source": "hdb.log"
}
```

- **`timestamp`**: the entry's `timestamp`, verbatim. A string of at most 64 characters that starts `YYYY-MM-DDT`,
  that `Date.parse` reads, and that falls in [1970-01-01T00:00:30Z, 9998-12-31T00:00:00Z). That range keeps
  `timestamp ± 30 s` a valid date, after the epoch, and inside four-digit years for the date inputs in every time
  zone. Harper writes UTC with a `Z`; without an offset, `Date.parse` reads the string as local time.
- **`node`**: the entry's `node`, or `''` when it has none. At most 512 characters.
- **`thread`**: the entry's `thread`, or `''` when it has none. At most 256 characters.
- **`fingerprint`**: 32-bit FNV-1a over the UTF-16 code units of `JSON.stringify([level, message])`, unsigned, in base
  36, from the entry's raw `level` and `message` (before any masking or truncation). At most 32 characters.
- **`source`**: the log file the entry was read from, `'hdb.log'` or `'system.log'`. It becomes `read_log`'s
  `log_name`.

The route's `validateSearch` ([`routes.ts`](routes.ts)) is `validateLogSearch` → `parseLogTarget` in
[`logView.ts`](logView.ts):

- **A `log` that fails is dropped whole.** The page opens as if the link had none (last 15 minutes, nothing selected)
  and says nothing about it.
- The router's default `parseSearch` JSON-parses the value before `validateSearch` sees it
  (`defaultParseSearch` in `@tanstack/router-core`'s `searchParams.js`), so it usually arrives as an object; a JSON
  string is accepted too. A string longer than 2,048 characters, or one that isn't JSON, fails before the schema. A
  repeated `log` arrives as an array and fails.
- Keys the schema doesn't name are stripped, not rejected. They were still in the URL, though: see the last section.
- **`log` is the route's only search parameter.** There is no filter, level, range or limit parameter, and anything
  else in the query is ignored. A link to Logs filtered to a component (#2036) needs a new parameter, not this one.

`logView.test.ts` pins every accepted and rejected case above.

## What a valid bookmark opens

- **Its own explorer.** `Logs` keys `LogsExplorer` on the entity and the parsed target, so another link starts over.
- **A fixed window.** `surroundingFilters`: the file from `source`, every level, no text filter, limit 1,000, and a
  custom range from 30 s before `timestamp` to 30 s after it. The Node facet starts on `node`; Thread stays on All.
- **No tailing.** `useInstanceLogs` neither streams nor polls while it has a `contextTimestamp`, and the query never
  retries or refetches on focus or reconnect. The Live switch is disabled because the range has an end, and the
  summary says "Fixed time range (Live unavailable)". Refresh repeats the same read.
- **A bounded read** (`getContextLogs` in
  [`getReadLog.ts`](../../../integrations/api/instance/status/getReadLog.ts)). The limit of 1,000 splits into 500
  before and 500 after.
  - Before: `read_log` in ascending order over [t − 30 s, t], in pages of 500 (`start` 0, 500, …), keeping the 500
    nearest t and stopping at the first page that comes back short. It pages because Harper scans a bounded read
    forward from the start of the file and stops at `start + limit` matches (harper
    `utility/logging/readLog.ts:61`, `:83-85` and `:218-223` at `9e6cc451e`), so one ascending read returns the
    oldest matches, not the nearest. After eight full pages (4,000 entries in 30 s) it gives up with
    `LogContextLimitError`: the alert says "Too many logs in this context window. Use Filters to choose a smaller
    time range." and has a button that opens Filters.
  - After: one ascending read over [t + 1 ms, t + 30 s], limit 500.
  - On a cluster each read is `replicated`, so Harper sends it to every node (`readLog.ts:40`).
- **Cancellable.** The query's abort signal and an internal controller are merged (`anySignal`). Each page checks it
  before it starts, and a failure on either side aborts the other side's request in flight. Leaving the page or
  opening another link cancels the query.
- **One selected entry.** An entry matches when `Date.parse(timestamp)`, `node`, `thread` and the fingerprint all
  agree (`logMatchesTarget`). A single match is expanded and scrolled into view once, takes focus if nothing else
  has it, and the view holds its place there.
- **Until the user moves on.** Apply Filters, Search, a time range or Reset drops the target, and reads are normal
  from then on. The URL is not rewritten, so a reload opens the bookmark again.

## When the entry isn't there

- More than one match: "Multiple logs match this link. Expand an entry to inspect it." Nothing is expanded.
- No match once the window has loaded, for example because the file rotated or the limit left the entry out: "The
  linked log was not found in this loaded window. It may have expired or been excluded by the result limit." The
  window's rows still load, under the Node facet the link set.
- `source` names a file the instance doesn't have: Harper refuses the read (`'log_name' '…' does not exist.`, harper
  `validation/readLogValidator.ts:62`), and the page shows "Could not load logs." with Retry.

## Who builds these links

Nobody yet. Checked on 2026-11-25:

- **Studio has no production builder.** The only one is the test fixture [`test/logLinks.ts`](test/logLinks.ts),
  used by `logView.test.ts` and `Logs.test.tsx`; `e2e/tests/logs.anon.spec.ts` writes two by hand. Studio's own
  links to the page (the nav in `useInstanceNavLinks.tsx`, a README's `./logs`) carry no `log`.
- **No Studio build ever made one.** A Copy link control existed only on #2136's branch: added in `799b869b8`,
  removed in `1cc0afabc` before the merge. The reader and its tests were kept on purpose, and #2135 asked for this
  note.
- **central-manager** `main` (`f0b44a2b0`) links nowhere into Logs. The draft MCP connector (central-manager#1206,
  `clusterRuntimeLinks` in `src/lib/studioLinks.js`) links its log-reading tool's result to the bare
  `/{organizationId}/{clusterId}/logs`, which is why that path is in
  [`stableRoutes.ts`](../../../router/stableRoutes.ts). That tool already holds the raw entries a bookmark is built
  from, so it is the nearest candidate producer. It would have to fingerprint a message before masking it.
- **harper** `main` (`9e6cc451e`) has no link to the route, and neither do local checkouts of host-manager,
  documentation, harper-pro, skills and skills-internal. GitHub code search across HarperFast for `logs?log=` finds
  only the e2e spec.

Anything that holds a `read_log` entry exactly as Harper returned it, and knows the file it came from, can build one.
Build it the way `buildLogLink` does, in JavaScript: the fingerprint hashes JavaScript's `JSON.stringify` output by
UTF-16 code unit, which another language would have to reproduce exactly.

Changing the format:

- **The five keys, what they mean, and the fingerprint are the format.** Changing any of them breaks every link
  already built. `test/logLinks.ts` copies `fingerprint` from `logView.ts` because production exports no builder,
  and the round trip in `logView.test.ts` fails if the two drift. A production producer should share one
  implementation rather than add a third copy.
- `stableRoutes.ts` pins the bare path, not the `log` parameter, because no system outside Studio sends it. When one
  does, pin that producer's output with a test the way `stableRoutes.test.ts` pins the paths.

## No address or credential in the URL

AGENTS.md's "Never put an address or a credential in a URL" applies here: Datadog RUM and every third-party pixel read
the page URL, and `redactSensitiveParams` leaves `log` alone. The contract complies. It holds no e-mail address, no
credential, no message text and no search text: `buildLogLink` deletes `filter`, and `logView.test.ts` asserts that
neither reaches the link. What it does hand those parties:

- `node`, the Harper node's hostname on a cluster read (harper `readLog.ts:294`) and empty otherwise. That names
  infrastructure, not a person.
- `thread`, `timestamp` and `source`, which are Harper's own identifiers.
- `fingerprint`, 32 bits for matching and not a cryptographic hash: anyone who can guess a message can check the
  guess against it.

A producer must not add keys. Studio strips unknown keys only after the URL has been read, so they reach RUM and the
pixels anyway.
