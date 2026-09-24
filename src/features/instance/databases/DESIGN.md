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
change once the table holds records (HarperFast/harper#2480). That's why the panel says to recreate
the table or move the records instead.

`$id` is not a stand-in key. These are live-probe observations on `harperdb:4.7.36` and
`harper-pro:5.2.13` (2026-09), not covered by a test here:

- `search_by_value` on `$id` with `'*'` lists the rows, but only unsorted and unfiltered.
- Sorting or matching on `$id` returns 404 `$id is not a defined attribute`.
- `search_by_id` with `$id` in `get_attributes` returns a `TypeError` body.
- `update` is rejected.
- A record written with a `$id` field keeps it as ordinary data, which shadows the real key in
  reads.
