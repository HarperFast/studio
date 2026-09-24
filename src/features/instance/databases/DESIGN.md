# Databases browse — design notes

## The grid's `data === undefined` means a list query is in flight

[`TableView`](components/TableView.tsx) shows its spinner for as long as `data` is `undefined`, and
the empty panel only once it's an array. It can't tell "still fetching" from "nothing will ever be
fetched", so [`DatabaseTableView`](components/DatabaseTableView.tsx) owns the other half: whenever
it withholds both list queries (`search_by_value` / `search_by_conditions`), it must hand the grid a
settled array and an `EmptyResultSet` that explains why.

Both queries are gated on the table having a primary key. They page, sort and address records by
it. A table a component created with `ensureTable({ attributes: [] })` describes with none
(`attributes: []`, no `primary_key` / `hash_attribute`). Such tables exist in the field on 4.7, and
until #1748 they spun forever with no request behind the spinner. A new gate on those queries owes
the same settled answer.

`$id` is not a stand-in key. On both 4.7.36 and 5.2.13, `search_by_value` on `$id` with `'*'` lists
the rows, but only unsorted and unfiltered: sorting or matching on `$id` returns 404
`$id is not a defined attribute`. `search_by_id` with `$id` in `get_attributes` returns a
`TypeError` body, `update` is rejected, and a record written with a `$id` field keeps it as data
that shadows the real key in reads. Pinned by
[`DatabaseTableView.noPrimaryKey.test.tsx`](components/DatabaseTableView.noPrimaryKey.test.tsx).
