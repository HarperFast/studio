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

## A CSV export's `get_attributes` never contains `'*'` after a name

The grid resolves `@computed` attributes by naming them ahead of a trailing `'*'`
(`buildSyntheticGetAttributes`). The CSV export must not copy that. Harper builds a CSV's header
from the select, with the `'*'` expanded to every attribute, so each name ahead of it shows up twice.
On harperdb 4.7.40, `search_by_conditions` with `['totalPrice', '*']` answers with the header
`"totalPrice","id","price","taxRate","totalPrice"`. Harper 5's `Table.search` `getColumns` expands
it the same way for both search operations (`resources/Table.ts:5638-5650`, traced in source, not
run). So a table with a computed attribute
exports with an explicit list of what describe reports, relationships left out
([`buildExportGetAttributes`](functions/relationshipAttributes.ts)), and any other table keeps
`['*']` (#1820).

The cost is limited to tables with a computed attribute. An undeclared property that the first
exported record carries is no longer a column of an unfiltered 4.7 export. A filtered 4.7 export
already left such properties out, because its `['*']` header lists only declared attributes, and so
does a Harper 5 export of a schema-defined table (the same `getColumns`, with no select).

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
