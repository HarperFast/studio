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

`parseStudioConfiguration` trusts none of it: a malformed page, section or field is dropped, frame and
REST paths must stay on the cluster's origin, and `srcdoc` is never taken from a cluster. A 4xx (an older
Harper, or an allowlisted role without the operation) means plain Studio, not an error.

Hiding is focus, not security: a hidden tab still opens from a link, and the server's permissions are
unchanged.

## Pages

- **Placement**: `tab` (after the built-in tabs, before Config) or `config` (the Config menu, sorted with
  the built-in entries). A lesser role with a Config entry gets Config with just those entries.
- **Access**: `role`, `tables`, `operations`, `endpoints`, checked like the built-in pages check. Inside a
  page, write controls follow the viewer's own table grants.
- **Body**: `sections` drawn by Studio (text, stats, CRUD table, settings form, actions), or `frame`, a
  page the component serves, sandboxed without `allow-same-origin` and reaching the cluster only through
  Studio's postMessage bridge. Frames and action buttons alike can send only what the page declared
  (`checkPageRequest`). No component code ever runs in Studio's own origin.

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

## Open

1. **Both server sides are draft PRs.** Until central-manager#1047 is deployed, the job lives only in the
   creating browser's localStorage (`pendingPresetSetup.ts`); until harper#3656 ships, every cluster reads
   as plain Studio.
2. **The preset packages are placeholders** (`@harperfast/redirects`, `@harperfast/prerender`), which
   is why `VITE_CLUSTER_PRESETS` is off by default.
3. **REST requests and frames reach the application port.** Everything else (the config read, table
   CRUD, declared operations) uses the operations API, as the rest of Studio does. A page's `rest`
   requests carry the operations credential to the application URL, and a frame loads from it, so a
   cluster whose operations API is network-isolated loses them. Components can register their own
   operations (`server.registerOperation`, grantable to a role's operations allowlist), which would keep
   every page on the operations API.
4. **No Studio UI changes a cluster's preset after creation**, though central-manager allows it.

`prototype/` is dev-server only (never a production build or a test run): demo components on an
in-memory cluster, a simulated role, and focus presets, switched from the panel at the bottom left.
