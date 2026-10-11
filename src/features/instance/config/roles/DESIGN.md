# Instance roles — design notes

## The role editor's JSON text is the only source of truth

Both role modals edit a draft whose text is the role's `permission` JSON
([`useRolePermissionDraft`](editor/useRolePermissionDraft.ts)). The visual editor
([`RoleVisualEditor`](editor/RoleVisualEditor.tsx)) is a lens over that text, not a model of its
own. It reads the parsed document, and every edit is a copy-on-write patch from
[`rolePermissionModel`](editor/rolePermissionModel.ts) that changes only the keys it touches. A key
the GUI does not model therefore survives a round-trip without the GUI knowing it exists. Examples
are a database record's `describe`, which Harper's permission translator honours, and an attribute
entry's `delete`, which role validation tolerates.

Never serialize the role from a schema-derived template or from a typed model. The editor used to
seed its JSON from `calculateDefaultPermissions`, and that template rewrote what it did not model.
Its global "Pick Attributes" flag expanded or emptied every table's attribute list at once. When it
expanded one, it wrote the primary key as an explicit `false` row, and that revokes the key Harper
otherwise derives from the other attributes. Tables the role doesn't mention are left out of the
JSON. The GUI renders them as no access, which is how Harper reads an absent table, and creates an
entry only when one is first granted.

Two kinds of content the GUI does not render are handled differently:

- `getVisualEditorBlockers` lists shapes the GUI could only render by guessing. Examples are a
  non-boolean CRUD flag, a non-array `attribute_permissions`, and an unusable `operations` value.
  While the list is non-empty, the JSON view stays in charge and shows the list. Most of these are
  shapes Harper's role validation rejects anyway.
- `getPreservedEntries` lists content that is well-formed but not shown, and the GUI carries it
  through unchanged. Databases and tables missing from describe_all are listed separately. Harper
  rejects a role that names them (`SCHEMA_NOT_FOUND` / `TABLE_NOT_FOUND`), so the GUI offers to
  remove them, but it never removes them on its own. An attribute entry missing from describe_all is
  only "not shown", because describe_all omits `@computed` attributes unless asked.

Save is the one place that changes the document on purpose. `preparePermissionForSave` writes a
`null` `attribute_permissions` as `[]` (HarperFast/harper#3143). It also removes what Harper refuses
beside `super_user` / `cluster_user`, which is everything, `structure_user` included. For
`structure_user: true` it removes the per-table permissions, which no longer apply. Switching a role
type in the GUI keeps everything else in the draft until then, so switching back within a session
loses nothing.

A visual edit keeps the object it produced instead of re-parsing its own text. That keeps object
identity for every untouched database and table, so the memoized `DatabaseSection` / `TableRows`
re-render only what changed, which matters on a schema with hundreds of tables.

The Harper semantics the editor shows are written down where they are encoded. The effective
attribute access, including the derived primary key and timestamps being read-only, is in
`getAttributeViews`. What `structure_user` grants is in `StructureUserSection`'s copy. Each was
traced to Harper 5.3.1 source and checked against its `role_validation` / `permissionsTranslator`
before it reached UI copy. Re-check those before changing the copy.
