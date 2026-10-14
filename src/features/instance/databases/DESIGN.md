# Databases browse — design notes

## The grid's `data === undefined` means a list query is in flight

[`TableView`](components/TableView.tsx) shows its spinner for as long as `data` is `undefined`, and
the empty panel only once it's an array. It can't tell "still fetching" from "nothing will ever be
fetched", so [`DatabaseTableView`](components/DatabaseTableView.tsx) owns the other half. While the
schema is still loading, both list queries (`search_by_value` / `search_by_conditions`) are held
back and the spinner is correct. Once the schema has arrived, any gate that still withholds both
must hand the grid a settled array and an `EmptyResultSet` that explains why.

Both queries are gated on the table having a primary key. They page, sort and address records by
it. A table a component created with `ensureTable({ attributes: [] })` describes with none
(`attributes: []`, no `primary_key` / `hash_attribute`). Such tables exist in the field on 4.7, and
until #1748 they spun forever with no request behind the spinner. A new gate on those queries owes
the same settled answer. Pinned by
[`DatabaseTableView.noPrimaryKey.test.tsx`](components/DatabaseTableView.noPrimaryKey.test.tsx),
which keeps the grid and React Query real.

Adding a key later is no remedy. 4.x keeps the table's original nameless key, and 5.x refuses the
change once the table holds records (HarperFast/harper#2480). Dropping and recreating the table
deletes the records, and this view disables Export for it. So the panel's only advice is to copy the
records into a new table that has a primary key.

The grid's `hasPrimaryKey` reads true until a describe arrives, so that the spinner covers the
schema load. Add Records, Import and Export CSV need the key itself, so they wait for a describe
that names one (`hasKnownPrimaryKey`, in the toolbar and in
[`TableContextMenuItems`](components/TableContextMenuItems.tsx), the tree and overview menus). A
table nothing has described yet gets the same answer as one without a key, rather than an Export
that then reports "no primary key found" (#1941).

`$id` is not a stand-in key. These are live-probe observations on `harperdb:4.7.36` and
`harper-pro:5.2.13` (2026-09), not covered by a test here:

- `search_by_value` on `$id` with `'*'` lists the rows, but only unsorted and unfiltered.
- Sorting or matching on `$id` returns 404 `$id is not a defined attribute`.
- `search_by_id` with `$id` in `get_attributes` returns a `TypeError` body.
- `update` is rejected.
- A record written with a `$id` field keeps it as ordinary data, which shadows the real key in
  reads.

## A filtered result set has no count

`search_by_conditions` answers with a bare array -- nothing says how many records the filter matched
-- and the table's own count (`describe_table`, or the exact count) describes the whole table. So
the footer must never page a filtered list by that count: under a filter it read "Page 1 of 3" for
15 matches and offered empty pages (#1253). Instead the filtered query asks for one record past the
page ([`getSearchByConditionsPage`](../../../integrations/api/instance/database/getSearchByConditions.ts))
and [`TablePagination`](components/TablePagination.tsx) pages by whether it came back. The total is
stated only once the page that ends the result set is on screen (`uncountedTotal`). The unfiltered
list keeps paging by the table count.

Past the last record of a full unfiltered page, the row editor's Next doesn't go by that count. It
probes the next page, and an empty answer proves the page it came from is the last (`knownLastPage`
in [`DatabaseTableView`](components/DatabaseTableView.tsx)). The proof is about how many records the
table holds, so it carries the count the step set out with and holds only while the count is the
same (#1940). A window-focus refetch or an import's refresh reads the count again, and Refresh
retires the proof outright. Reading a page doesn't, so the read on the way back from the probe keeps
it, however slow the probe; and a count that moves while the probe is out voids the answer it brings.
A step that turns the page first drops the table's cached pages that aren't on screen, so it reads
the next page afresh rather than trust a copy, or join a read, older than the page on screen (the
probe's empty answer among them). Where `describe_table` only estimates the count, growth that leaves
the estimate unchanged keeps the proof until Refresh, and a count that first arrives, or shrinks,
costs one more probe.

## Export CSV writes the file itself, from JSON

The export reads every matching record as JSON in one request, with the grid's select minus its
relationships ([`buildExportGetAttributes`](functions/tableCsv.ts): each `@computed` name, then
`'*'`), and writes the CSV in the browser ([`tableCsvColumns`](functions/tableCsv.ts),
[`tableCsvBlob`](functions/tableCsv.ts)). The columns are what describe lists, in describe order,
minus relationships, then every property an exported record carries that describe doesn't list,
most common first as the grid orders its extra columns. They are counted over the whole result, not
the loaded page, and not capped at `MAX_EXTRA_COLUMNS`: a column left out of a file is data lost
from it. A `@sealed` table refuses undeclared properties, so its file is its described attributes.
Cells are written as harper 5.3.2's own CSV writer writes them (`escapeCsvRow`), except that a `Date`
holds its ISO text, where 5.3.2 put a second pair of quotes around it (#1932). 4.7.40's writer left
booleans unquoted, which Import reads the same: Harper's CSV load parses every cell as text and casts
it afterwards (`dataLayer/bulkLoad.ts:62-67`, `590-594`).

Harper's own `text/csv` answer can't carry undeclared properties, whatever the select. Its writer
takes the header from the result's `getColumns()`, or failing that from the first record's keys,
and fixes it before the first row (harper `v5.3.2`, `server/serverHelpers/contentTypes.ts:106-116`
and `858-868`). `search_by_conditions` keeps `getColumns`, which lists only declared attributes and
expands a `'*'` in the select to all of them, so a name ahead of the `'*'` shows up twice
(`resources/Table.ts:5531-5544`). `search_by_value` collects its results into a plain array first
(`dataLayer/search.ts:21-31`), so its header is the first record's keys: a property that record
lacks, declared or not, is no column. With `Thing` records `a1 {tags, color, owners, size}`,
`a2 {note, color}` and `a3 {weight}`, every form of the request lost columns on 5.3.2 (and the same
ones, in another order, on harperdb 4.7.40):

| Request (`Accept: text/csv`)                  | Header                                                   |
| --------------------------------------------- | -------------------------------------------------------- |
| `search_by_value`, `['*']`                    | `id, price, taxRate, tags, color, owners, size`          |
| `search_by_value`, the declared names (#1836) | `id, note, price, tags, taxRate, totalPrice`             |
| `search_by_conditions`, `['*']`               | `id, note, price, tags, taxRate`                         |
| `search_by_conditions`, `['totalPrice', '*']` | `totalPrice, id, note, price, tags, taxRate, totalPrice` |

Naming the undeclared properties doesn't help either: 5.3.2 refuses an undeclared name in
`get_attributes` (`unknown attribute 'bigs'`).

The JSON answer to the grid's select carries everything: Harper resolves each name, then copies
every key of the stored record for the `'*'` (`resources/Table.ts:6569-6583`). The computed names
go first because a select that starts with `'*'` is dropped on a schema-defined table
(`dataLayer/harperBridge/ResourceBridge.ts:735-750`). On both versions it returned `note`, `color`,
`owners`, `size` and `weight` with `totalPrice`, and the export wrote them all.

The JSON is read as text and parsed with [`parseJsonKeepingLargeIntegers`](functions/tableCsv.ts).
Harper writes a `BigInt` as bare digits, which `JSON.parse` rounds and Harper's CSV didn't. So before
the parse, each integer literal outside a string whose digits a double would change is quoted, and
it reads as a string of its digits. Its cell is then quoted, as 5.3.2's writer quotes a `BigInt`. A
double Harper wrote as integer digits (`1e17` as `100000000000000000`) parses back to the same digits,
so it stays a number. Inside an array or object cell a quoted integer is a JSON string. Import can't
do better with bare digits there: it reads such a cell with `JSON.parse` (`autoCastJSON`,
`utility/common_utils.ts:190-203`), which would round them. This needs nothing of the browser, unlike
a `JSON.parse` reviver reading the source text.

The export costs more memory than the `text/csv` answer did, which was one string the size of the
file. The header can't be written until every record has been read, so the whole result is parsed at
once: one request of up to 1,000,000 records. The response text is dropped once parsed (a body with
such an integer is copied once more to quote it), and the file is written into `Blob` parts of
10,000 rows, or fewer once a part passes 16M characters, each part's records let go as it's
written. So the peak is the JSON text plus the parsed records. For 500,000 records of `Thing`'s
ten columns that was about 355MB of heap (78M characters of JSON, 277MB of records), for a 46MB file,
in Node 24. The JSON text is also one string, and longer than the CSV was, so the largest result that
can be exported is smaller than before. Paging the read would bound both, at the cost of two reads
(one for the columns, one for the rows) that no longer see one snapshot.

## Columns for undeclared properties come from the rows on screen

`describe_table` lists only what a schema declares, and a table that isn't `@sealed` stores whatever
else a record brings. So [`DatabaseTableView`](components/DatabaseTableView.tsx) adds a column for
each property the loaded page carries that no column covers
([`extraRecordAttributes`](functions/extraRecordAttributes.ts)), most common first and capped at
`MAX_EXTRA_COLUMNS` (#1314). Those columns only display. On harperdb 4.7.40, Harper refuses an
undeclared attribute in a condition (`unknown attribute 'color'`) and in a sort
(`color is not a defined attribute`), so they offer neither a filter nor a sort.

They describe one page, so they can change when the page does. Neither list query keeps the previous
page's rows, so while the next page loads, the view keeps the last page's extra columns instead of
dropping them from the header and putting them back.

## A filter no index can answer runs only after the user agrees

Every described column takes a filter, indexed or not (except binary ones). Harper's operations API
answers a condition on an unindexed attribute by reading every record. It needs no flag for that:
Harper 5's `ResourceBridge` passes `allowFullScan: true` itself, and 4.7.40 runs it unasked. So the
safeguard is Studio's. [`fullScanAttributes`](functions/fullScanFilter.ts) decides whether a filter
needs a scan of the whole table: it does when no condition can be served by an index. Harper runs an
`and` search from its narrowest condition and filters the rest (`resources/Table.ts`
`orderConditions`), so one indexed condition is enough. `ne`, and the `*hn` (ends with) and `*oh*`
(contains) wildcards (#1549), scan even on an indexed attribute (`resources/search.ts`
`searchByIndex`). A relationship filter is a join that Harper answers by searching the related table,
so it is judged by that table's attribute. Typed filters and deep-linked ones both reach the server only through `applySearchConditions` in
[`DatabaseTableView`](components/DatabaseTableView.tsx), which asks first (#1285). The request then
carries `allowFullScan: true`, and so does a CSV export of that filter. A new way to apply a filter
has to go through that function.

## Browse asks in a Studio dialog, and a question belongs to where it was asked

The full-scan question, Cleanup Orphan Blobs, Delete Selected and the row editor's discard all ask in
an `AlertDialog`, not `window.confirm()` (#1924). Nothing blocks while it is open, so each question
is a pending request that carries what it would act on: the filter's conditions, the selected keys.
`DatabaseTableView` stays mounted when the route moves to another table, so its request also carries
the view's context (instance, database, table, deep-link filters) and is cleared, not answered, once
that changes. The editor's discard question is cleared once its draft is gone. A filter an index can
answer never asks and applies at once, as before.

## An import refreshes Browse from the mutation, not from the modal

Every Browse read has a 60s `staleTime`, so an import into the open table shows nothing new until
something invalidates `[entityId, database, table]`. Navigating to a table that is already on screen
doesn't invalidate it. That refresh lives in `useImportDataMutation`'s own `onSettled`
([`importData.ts`](../../../integrations/api/instance/database/importData.ts)), because React Query
skips a `mutate` call's callbacks once the component that made it has unmounted. It used to live in
the table view, and #1471 lost it when the modal moved into `DatabaseActionModals`.

It is not awaited. The import settles at the job's verdict, and the modal closes then. The modal's
`onImported` waits for the `describe_all` refetch before it navigates
(`awaitDatabaseMapRefresh`, which joins the refetch rather than starting another), or
`resolveDatabasesRedirect` would send a table the import just created back to the overview. If that
refetch fails, the old map stays and the redirect still happens, as it did before.

A failed import refreshes too, because any outcome can have written. `csv_url_load` inserts chunk by
chunk (harper `dataLayer/bulkLoad.ts`, `insertChunk`), so a load that fails partway keeps its earlier
chunks, and a refused load can follow the `create_table` that made its table. A submission with no
verdict is the strongest case: its toast says "Outcome unknown" and asks the user to check whether the
import took effect (`isUnansweredWrite`). A central-manager 504 on a long insert that Harper went on to apply is one
example, and only a re-read shows the answer. When the instance is really down, the re-reads fail
too and add their own error toasts. That noise is cheaper than a stale grid inviting a retry that
duplicates every record without an id.

## An import job Studio stopped following is not a failed import

Once Harper accepts a CSV load, which answers with a `job_id`, only an `ERROR` Studio reads from the job is a
failure (`ImportJobError`). [`waitForJob`](../../../integrations/api/instance/database/getJob.ts) also stops
after five failed `get_job` polls in a row, after `get_job` has answered `[]` for 20 seconds straight, and at its
10-minute deadline whatever the last poll read. All three reject with `ImportJobUnconfirmedError`, which
`describeError` shows as "Outcome unknown": the load may still be running or may have finished, so check the
table (and, for a role that can list jobs, the job on a Jobs tab). That holds even for a job that failed after the
last poll Studio could read: Studio can't report an outcome it never observed. A retry is the thing to avoid: a
CSV row with no primary key gets a new id on every load (harper `resources/Table.ts`, `getNewId`), so a second
load duplicates it. Any new way to stop following rejects the same way.

The `[]` case is a cluster reached through its own address, which can send a poll to a node other than the one
that ran the job. Studio can't poll the right node, because nothing names it: the load answers only `message` and
`job_id` (harper v5.3.2 `server/serverHelpers/serverUtilities.ts:581-584`), the job row records no node
(`server/jobs/JobObject.ts:10-19`), `get_job` reads only the local `hdb_job` (`server/jobs/jobs.ts:38-54`, `:280-290`),
and `hdb_job` does not replicate (`resources/databases.ts:330-339`). Central manager's proxy sends every request
to the first running instance (central-manager `src/resources/cluster/Cluster.js:375-380`), so it reaches the same
node unless instance states change. The 20-second grace (`JOB_NOT_FOUND_GRACE_MS`) is the one the rolling-deploy
follower uses for the same reason.
