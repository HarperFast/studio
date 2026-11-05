# Component pages and focused clusters

Harper-maintained components deployed to a cluster add their own pages to Studio, and a cluster can
focus Studio on one job by hiding or tucking away built-in tabs. Both ship apart from Studio: the pages
with their components, the focus with the cluster's config.

## Where it comes from

`get_studio_configuration` (HarperFast/harper#3656, Harper 5.4: any signed-in role, and in the `read_only`,
`standard_user` and `admin_read` groups) returns:

- `navigation` and `landing` from the root config's `studio` block. Each built-in tab key
  (`applications`, `databases`, `apis`, `operations`, `status`, `logs`, `config`) or page key
  (`<component>.<id>`) is `visible`, `tucked` (into the nav's More menu) or `hidden`.
- `pages` from the `studio.pages` of each component's own `config.yaml` (shape: `manifest.ts`).

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
- **Access**: `role`, `tables`, `operations`, checked like the built-in pages check. The viewer's role
  must meet all of it to see the page, and it bounds everything the page's sections send. Grants under
  `optional` (`tables`, `operations`) are declared but not required, so readers can see a table that
  only writers edit, or an admin-only action can sit on a page every reader sees; a control that needs one
  appears only for roles that hold it. A page naming one of Harper's own operations, or with access
  Studio can't fully read, is shown to no role, with the reason in place of "not available to your role".
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
  are more; it asks for its key and the attributes its columns and fields name (`*` again if Harper
  refuses one). A count is `describe_table`'s (Harper's estimate on a large table), or, with `where`, a
  `search_by_conditions` reading primary keys up to the same limit, so its attributes should be indexed.
- **Writes say what they mean**: Add inserts, so a taken key fails rather than overwriting that row, and
  Edit updates only the key and the fields the user changed, so attributes the form doesn't show (a
  server-kept hit count), and ones a projected read returned as null because the record lacks them, are
  never written back. Every table and form write is raw DML that Harper runs on the
  table itself (`getTable` in harper `ResourceBridge.ts`), so a Resource the component exports, with its
  validation and `put`/`patch` overrides, doesn't run; a component whose writes need it registers an
  operation and offers it as an action.

## Presets (cluster creation)

`src/features/clusters/presets`: the create form offers a job (`CLUSTER_PRESETS`), only in a build
with `VITE_CLUSTER_PRESETS=true` and from Harper 5.4 (`PRESET_MIN_HARPER_VERSION`); without the flag
`findClusterPreset` finds none, so nothing offers, badges or resumes a preset. Once the new cluster's
admin signs in, FinishSetup sends them to `/setup`, which deploys the preset's components, merges its
`studio_navigation` and `studio_landing` into the cluster's with `set_configuration` (replicated;
flattened because harper refuses a nested `studio` object, which would clobber an app deployed under
that name; no restart), and lands on `/start`. Central-manager records the job as `Cluster.preset`
(HarperFast/central-manager#1047), so any browser can offer "Finish setting up".

- **Done** (`isPresetApplied`): a landing is set and the components declare the preset's landing page,
  so a landing set by hand isn't enough, and moving it later doesn't offer setup again.
- **Owed** (`owedPreset`): the cluster's loaded config decides. This browser's record
  (`pendingPresetSetup`) counts only while the config is unknown or `unavailable`, and is forgotten once
  the config shows the setup done.
- **Merged, never overwritten**: the configure step reads the settings first, keeps the cluster's own
  tab placements and landing, never writes a null landing, and writes nothing if the read fails or is
  `unavailable`. `/setup` starts by itself only when the config has loaded, is available and holds no
  landing and no placements; otherwise it says what it will change and waits for a click.
- **`/start`** lands on the landing when it is a visible or tucked tab, or a Config page the viewer's
  role may open (`config/ext/<key>`, a route of its own); otherwise on the nav's first tab. Never on a
  hidden tab, which would loop back through the index it hides.

Setup never sends a deploy twice by itself (applications/DESIGN.md, "A live deploy is sent once").
`presetDeployMarks`, in this browser's storage, marks each deploy `unconfirmed` before sending it. Only
a 4xx proves Harper never started it and clears the mark; no verdict keeps it, and any other failure
marks it `partial`. A component still missing under `unconfirmed` is installed again only on "Install
again". `partial` (or an unconfirmed install that has since appeared) is deployed again on Retry, since
the node Studio reached listing it says nothing of the rest. On a cluster, a listed component with no
mark is skipped only when its latest `hdb_deployment` record says every node took it (`success`, or
`rolling_out` under a restart job; no failed peer; any restart job complete on every node). One still in
flight stops setup, and one with no record was installed some other way and is left alone. A Web Lock
per cluster keeps runs in different tabs from overlapping, a failed `get_components` or deploy-record
read stops setup, and a node that refuses the settings fails that step. Another browser sees neither the
lock nor the marks, though the deploy record catches its partial rollouts.

## Open

1. **Both server sides are unmerged PRs.** Until central-manager#1047 is deployed, the job lives only in the
   creating browser's localStorage (`pendingPresetSetup.ts`); until harper#3656 ships, every cluster reads
   as plain Studio.
2. **The preset packages are placeholders** (`@harperfast/redirects`, `@harperfast/prerender`), which
   is why `VITE_CLUSTER_PRESETS` is off by default.
3. **Content's shape lives only in `manifest.ts`.** Harper's app schema (`config-app.schema.json`) leaves
   `content` to Studio, so `requires` is how a newer shape reaches an older Studio; a versioned schema
   owned by Harper would let components validate against it.
4. **No Studio UI changes a cluster's preset after creation**, though central-manager allows it.

`prototype/` is dev-server only (never a production build or a test run): demo components on an
in-memory cluster, a simulated role, and focus presets, switched from the panel at the bottom left.
