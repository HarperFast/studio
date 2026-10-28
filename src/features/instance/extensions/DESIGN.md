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

`parseStudioConfiguration` trusts none of it: a malformed page, section, field or request is dropped,
and so is any page whose content is not Studio-drawn sections. A 4xx (an older Harper, or an allowlisted
role without the operation) means plain Studio, not an error.

Hiding is focus, not security: a hidden tab still opens from a link, and the server's permissions are
unchanged.

## Pages

- **Placement**: `tab` (after the built-in tabs, before Config) or `config` (the Config menu, sorted with
  the built-in entries). A lesser role with a Config entry gets Config with just those entries.
- **Access**: `role`, `tables`, `operations`, checked like the built-in pages check. Inside a page, write
  controls follow the viewer's own table grants.
- **Body**: always `sections` drawn by Studio (text, stats, CRUD table, settings form, actions), so every
  page looks like Studio and gains whatever Studio's own components gain. No component code runs in
  Studio, and a component that wants its own UI serves it on the application port instead.
- **Requests**: every one goes to the operations API, the same channel and credential as the rest of
  Studio, so isolating the operations port from the application port loses nothing. A component that
  needs more than table reads and writes registers an operation (`server.registerOperation`; declaring
  `requiresSuperUser` makes it grantable in a role's operations allowlist) and lists it in
  `access.operations`. An action button sends only what its page declared (`checkPageRequest`); the table
  operations it accepts are an explicit list, and neither `sql` nor `search` is on it, since each carries
  a statement that names its own tables.
- **Reads are bounded**: a table section loads at most `EXTENSION_ROW_LIMIT` rows and says so when there
  are more; its search and paging cover only those. A count is `describe_table`'s (Harper's estimate on a
  large table), or, with `where`, a `search_by_conditions` reading primary keys up to the same limit, so
  its attributes should be indexed. Nothing downloads a whole table to count it.
- **Writes say what they mean**: Add inserts, so a taken key fails rather than overwriting that row, and
  Edit updates only the form's fields and the key, so attributes the form doesn't show (a server-kept hit
  count) are never written back stale. Each needs only the grant its button was offered on.

## Presets (cluster creation)

`src/features/clusters/presets`: the create form offers a job (`CLUSTER_PRESETS`), only in a build
with `VITE_CLUSTER_PRESETS=true`; without it `findClusterPreset` finds none, so nothing offers, badges
or resumes a preset. Once the new
cluster's admin signs in, FinishSetup sends them to `/setup`, which deploys the preset's components,
writes its `studio_navigation` and `studio_landing` with `set_configuration` (replicated; flattened
because harper refuses a nested `studio` object, which would clobber an app deployed under that name;
no restart), and lands on `/start` — the configured landing page, or the first tab the viewer's nav
shows. Central-manager records the job as `Cluster.preset` (HarperFast/central-manager#1047), so any
browser can offer "Finish setting up" until the cluster's own config shows the landing page was written.
A cluster that can't answer `get_studio_configuration` (`unavailable`) is never owed a setup, and the
create form offers presets only from Harper 5.4 (`PRESET_MIN_HARPER_VERSION`).

Setup never sends a deploy twice by itself (applications/DESIGN.md, "A live deploy is sent once").
`presetDeployMarks`, in this browser's storage, marks each deploy `unconfirmed` before sending it and
clears it once Harper answers. A component still missing under that mark is waited for, or installed
again only on the user's "Install again". `partial` (a failed or unfollowable rollout, or an unconfirmed
install that has since appeared) is deployed again on Retry, since the node Studio reached listing it
says nothing of the rest. A Web Lock per cluster keeps runs in different tabs from overlapping, a failed
`get_components` read stops setup rather than deploying blind, and a node that refuses the settings
fails that step. Another browser sees neither the lock nor the marks, which is the cost of setting a
cluster up from the browser rather than from central-manager.

## Open

1. **Both server sides are draft PRs.** Until central-manager#1047 is deployed, the job lives only in the
   creating browser's localStorage (`pendingPresetSetup.ts`); until harper#3656 ships, every cluster reads
   as plain Studio.
2. **The preset packages are placeholders** (`@harperfast/redirects`, `@harperfast/prerender`), which
   is why `VITE_CLUSTER_PRESETS` is off by default.
3. **The page schema lives only in `manifest.ts`.** Harper checks a page's id, name and placement and passes
   `access` and `content` through; a versioned schema owned by Harper would let components validate
   against it.
4. **No Studio UI changes a cluster's preset after creation**, though central-manager allows it.

`prototype/` is dev-server only (never a production build or a test run): demo components on an
in-memory cluster, a simulated role, and focus presets, switched from the panel at the bottom left.
