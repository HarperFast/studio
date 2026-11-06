# Component pages and focused clusters

Harper-maintained components deployed to a cluster add their own pages to Studio, and a cluster can
focus Studio on one job by hiding or tucking away built-in tabs. Both ship apart from Studio: the pages
with their components, the focus with the cluster's config.

## Where it comes from

`get_studio_configuration` (HarperFast/harper#3656, Harper 5.4: any signed-in role, and in the `read_only`,
`standard_user` and `admin_read` groups) returns:

- `navigation`: each built-in tab key (`applications`, `databases`, `apis`, `operations`, `status`,
  `logs`, `config`) or page key (`<component>.<id>`) is `visible`, `tucked` (into the nav's More menu)
  or `hidden`. With HarperFast/harper#4079, apps and the plugins they load set it too: the root config's
  `studio` block beats an app, an app beats its plugins, and between peers the more visible state wins.
  `rootNavigation` is the root config's alone, and `landing` comes only from the root config.
- `pages` from the `studio.pages` of each app's own `config.yaml` and, with harper#4079, of each plugin
  an app loads (shape: `manifest.ts`). A plugin is loaded once per app that uses it, so its page is
  `component: <app>.<plugin>` (nested plugins chain), with `application` and `plugins` naming the parts.
  Two apps using one plugin give two pages.

Harper checks a page's id, name and placement, strips page keys it doesn't know, and never validates or
strips `access` or `content` (harper `config/studioConfiguration.ts`). So every check is Studio's, and a
new marker (`content.requires`, app context, a placement refinement) goes inside `content`, never beside
it. Every signed-in role gets the whole declaration, so it must hold no secrets or option values.

`parseStudioConfiguration` drops a page only when its component, id, name or placement is unusable: the
Studio bundled into Harper reads pages written long after it shipped. Past that, only an action without
a label or operation, a column without an attribute or label, and a stat without a label are left out.
Anything else it can't draw, including whatever `requires` a capability missing from
`STUDIO_CAPABILITIES`, becomes a placeholder that says why; an action is drawn disabled, and a table
loses its editor. Access it can't fully read denies the page to every role, super users included, since
skipping a requirement would open the page to roles it was meant to exclude. An action with keys Studio
doesn't know is kept. A 4xx (an older Harper, or an allowlisted role without the operation) means plain
Studio, not an error, and below `STUDIO_CONFIGURATION_MIN_HARPER_VERSION` Studio doesn't ask.

Hiding is focus, not security: a hidden tab still opens from a link, and the server's permissions are
unchanged.

## Pages

- **Placement**: `tab` (after the built-in tabs, before Config) or `config` (the Config menu, sorted with
  the built-in entries). A lesser role with a Config entry gets Config with just those entries.
- **Identity**: a key may hold `@` and `/` (a plugin's scoped npm name) and is at most 128 characters,
  so a navigation entry can always name it. A link encodes it as one route segment
  (`extensionPagePath`). Pages that would share a name in one placement get their app's name after it,
  or their component's when one app holds both.
- **Access**: `role`, `tables`, `operations`, checked like the built-in pages check. The viewer's role
  must meet all of it to see the page, and it bounds everything the page's sections send. Grants under
  `optional` (`tables`, `operations`) are declared but not required, so readers can see a table that
  only writers edit, or an admin-only action can sit on a page every reader sees; a control that needs one
  appears only for roles that hold it. A page naming one of Harper's own operations (`HARPER_OPERATIONS`,
  `get_studio_configuration` too), or with access Studio can't fully read, is shown to no role,
  with the reason in place of "not available to your role".
- **Body**: always `sections` drawn by Studio (text, stats, CRUD table, settings form, actions), so every
  page looks like Studio and gains whatever Studio's own components gain. No component code runs in
  Studio, and a component that wants its own UI serves it on the application port instead.
- **Requests**: every one goes to the operations API, the same channel and credential as the rest of
  Studio, so isolating the operations port from the application port loses nothing. Every one also goes
  through the page's declaration (`declaredDataSource`): an undeclared read sends nothing and says so,
  and Add, Edit, Delete and Save need their action declared and granted. An action may send table DML on
  a declared table with every grant Harper asks for (`upsert` needs insert and update), or an operation
  its component registered (`server.registerOperation`) and listed in `access.operations`
  (`checkPageRequest`). Every other Harper operation, `sql`, `search` and `put` included, is refused even
  to a super user, and so are envelope keys such as `impersonate` and `replicated`. An action that
  writes, is destructive or has `confirm` asks first, in a dialog showing the literal request. This
  guards against a careless manifest, not a hostile component: whoever can deploy a component already
  runs code with full rights on the cluster.
- **Reads are bounded**: a table section loads at most `EXTENSION_ROW_LIMIT` rows, and says so when there
  are more. It and a settings form ask for the key and the attributes their columns or fields name (`*`
  again if Harper refuses one). A count is `describe_table`'s (Harper's estimate on a large table), or,
  with `where`, a `search_by_conditions` reading primary keys up to the same limit, so its attributes
  should be indexed. An answer that isn't a list of records is an error, as is a `describe_table` answer
  with no `record_count`, which Harper sends when its count fails.
- **Writes say what they mean**: Add inserts, so a taken key fails rather than overwriting that row.
  Edit (table or settings form) updates only the key, shown but locked, and the fields the user
  changed from the record they opened, so attributes the form doesn't show (a server-kept hit count),
  nulls a projected read returned for attributes the record lacks, and another writer's change to a field
  left alone are never written back. Every table and form write is raw DML that Harper runs on the table
  itself (`getTable` in harper `ResourceBridge.ts`), so a Resource the component exports, with its
  validation and `put`/`patch` overrides, doesn't run; a component whose writes need it registers an
  operation and offers it as an action.
- **Writes are proven**: an insert, update or delete succeeds only when Harper's answer lists its key as
  written and skips nothing (harper `dataLayer/insert.ts:283-301`, `ResourceBridge.ts:362-373`), or for
  a keyless insert, whose key Harper makes up (`resources/Resource.ts:297`), any entry. One listing
  nothing written is a plain failure; one Studio can't read, or naming another key, is an
  `UnconfirmedWriteError`, handled like a write with no answer: Studio says it couldn't confirm it, asks
  the user to check before retrying, and refetches. Writes and actions report failures themselves, inline
  or as a toast, never through the global one.
- **A settings form keeps unsaved edits** when a newer read changes what it shows, unless that read holds
  them (their own save read back): a note says the record changed or was removed, with a button to
  discard them and load it.

## Presets (cluster creation)

`src/features/clusters/presets`: the create form offers a job (`CLUSTER_PRESETS`), only in a build
with `VITE_CLUSTER_PRESETS=true` and from Harper 5.4 (`PRESET_MIN_HARPER_VERSION`); without the flag
`findClusterPreset` finds none, so nothing offers, badges or resumes a preset, or reads this browser's
record of one. Once the new cluster's admin signs in, FinishSetup sends them to `/setup`, which deploys
the preset's components, merges its `studio_navigation` and `studio_landing` into the cluster's with
`set_configuration` (replicated; flattened because harper refuses a nested `studio` object, which would
clobber an app deployed under that name; no restart), and lands on `/start`. It merges into
`rootNavigation`, never the merged `navigation`, so it doesn't copy an app's or a plugin's placements into
the root config, where they would outrank that app from then on. Central-manager records the
job as `Cluster.preset` (HarperFast/central-manager#1047), so any browser can offer "Finish setting up"
to a super user, whom every step needs. It outranks this browser's record (`pendingPresetSetup`, one key
per cluster and one `storage` listener per page), which is forgotten when they disagree.

- **Done** (`isPresetApplied`): a landing is set and the components declare the preset's landing page,
  so a landing set by hand isn't enough, and moving it later doesn't offer setup again.
- **Owed** (`owedPreset`): the cluster's loaded config decides. This browser's record counts only while
  the config is unknown or `unavailable`, and is forgotten once the config shows the setup done.
- **Merged, never overwritten**: the configure step reads the settings first, keeps the cluster's own
  tab placements and landing, never writes a null landing, and writes nothing if the read fails or is
  `unavailable`. `/setup` starts by itself only on a loaded, available config holding no landing and no
  placements; otherwise it says what it will change and waits for a click. In a browser without Web
  Locks it doesn't run at all (`PresetSetupUnsupportedError`), since nothing would keep two tabs from
  both deploying.
- **`/start`** lands on the landing when it is a visible or tucked tab, or a Config page the viewer's
  role may open (`config/ext/<key>`, a route of its own); otherwise on the nav's first tab. Never on a
  hidden tab, which would loop back through the index it hides. With nothing to open it says so: a super
  user gets links to Config and Operations, anyone else is told to ask an admin.

Setup never sends a deploy twice by itself, nor beside one still running (applications/DESIGN.md, "A live
deploy is sent once"). `presetDeployMarks`, in this browser's storage, marks each deploy `unconfirmed`
before sending it. Only a 4xx proves Harper never started it and clears the mark; no verdict keeps it,
and any other failure marks it `partial`. A missing component goes out again on Retry when `partial`,
and under `unconfirmed` only on "Install again", which marks it `partial`. A listed one (on a single
instance, only a marked one) is decided by its latest `hdb_deployment` record. A `rolling_out` one's
restart job is followed to its end; one Studio can't follow, like any other still running (outside
harper's `TERMINAL_STATUSES`, `components/deploymentOperations.ts:22`), stops setup, with Retry but no
"Install again". One every node took (`success` or `rolling_out`, no failed peer, any restart job
complete on every node) is skipped, its mark cleared; a failed staging peer, which
`ignore_replication_errors` lets through to `rolling_out` (harper `components/operations.ts:1224-1246`),
is waited out first. With no record, an unmarked one was installed some other way and is left alone.
Anything else goes out again.

A redeploy resends the private-database setting and install command read from `get_configuration`, as a
package deploy rebuilds its root-config entry from the request alone (harper
`components/operations.ts:966-979`); a failed read stops the step, and what Studio's request can't carry
(`urlPath`, `host`, credentials, other `install` options) is dropped. A Web Lock per cluster keeps
tabs' runs from overlapping (and setup refuses to run without one), an abort stops a run before its next request, a failed `get_components` or
deploy-record read stops setup, and a node that refuses the settings fails that step. Another browser
sees neither the lock nor the marks; the deploy record catches its partial and running deploys.

## Open

1. **The server sides are unmerged.** Until central-manager#1047 is deployed, the job lives only in the
   creating browser's localStorage (`pendingPresetSetup.ts`); until harper#3656 ships, every cluster reads
   as plain Studio; until harper#4079 does, only apps declare pages and only the root config sets
   navigation. Studio already reads the answer #4079 adds.
2. **The preset packages are placeholders** (`@harperfast/redirects`, `@harperfast/prerender`), which
   is why `VITE_CLUSTER_PRESETS` is off by default.
3. **Content's shape lives only in `manifest.ts`.** Harper's app schema (`config-app.schema.json`) leaves
   `content` to Studio, so `requires` is how a newer shape reaches an older Studio; a versioned schema
   owned by Harper would let components validate against it.
4. **No Studio UI changes a cluster's preset after creation**, though central-manager allows it.
5. **An unfinished deploy record can block setup.** Harper's boot sweep ends only `rolling_out` ones (harper
   `components/deploymentRecorder.ts:800`), so one a node left mid-install never ends. The stop says so:
   Skip, or redeploy the package from Applications, whose newer record is the one Retry reads.

`prototype/` is dev-server only (inert in tests, absent from builds): demo components on an in-memory
cluster, a simulated role, and focus presets, switched from the panel at the bottom left.
