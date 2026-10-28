# Applications — design notes

## Unsaved edits belong to the file, not the path

The editor keeps three things for each path: the file's unsaved edits, in a session-storage buffer
(`EditorFileContent/{entityId}/{path}`, [`editorFileContent`](context/editorFileContent.ts)); its loaded contents, in
the `get_component_file` query; and the text editor's Monaco model, which `keepCurrentModel` keeps after the file is
closed. All three are keyed by path. So anything that changes which file a path names has to update them, or the next
file at that path opens with the last one's text and Save writes it into it (#1934). Every such operation goes through
[`editorPathState`](lib/editorPathState.ts) once the server confirms it:

- **Delete** (the delete modal, the assistant's `dropComponentFile`, the old folder after a folder rename) discards the
  unsaved edits and the cached contents, for the file or for everything under the folder or project. The open file's
  query is emptied rather than removed: its observer would otherwise fetch a file that is gone, into an error toast.
- **Replace** (New File over an existing file, an upload, the destination of a move) discards the unsaved edits, which
  were made to the file that is gone, and resets the cached contents so the old ones aren't handed out while the new
  ones load. New File and uploads do this even when nothing was at the path, which clears edits a delete left behind
  before this was in place.
- **Rename or move** carries the unsaved edits to the new path, as a desktop editor would, and replaces any there. A
  folder rename moves file by file, so the rest of a destination folder keeps its own. The edits are copied once the
  copy at the new path lands, and leave the old path only once its drop is confirmed. An unanswered drop leaves them
  on both paths, so they stay reachable whether or not the old file is gone; a refused one, on the original only.
  Edits typed at the new path while the drop is in flight are newer than the copy, and stay there either way.

All three dispose the Monaco models at the old path, because @monaco-editor/react reuses a path's model as it is and
applies `value` only when it changes. A model still on screen goes a tick after the editor lets go of it, since Monaco
keeps using it while it detaches. They reach Monaco through the loader, so a chunk that deletes files, such as the
assistant's, doesn't pull Monaco in. For the file that is open, `TextEditorView` covers two more gaps:

- It is read-only until the file's contents are known, and while the provider's contents still trail the query after
  a replace. Monaco ignores an undefined `value` and keeps showing the model's last text, and typing into that would
  save it here. The library also keeps an old `onChange` subscribed, and fires it when it writes `value` into a
  read-only editor, so the editor passes one handler for good. That handler reads the open file's setter and the
  read-only state, which are set on commit. The editor subscribes to the query for this, since a reload that brings
  back the text the provider already holds changes nothing else it renders from.
- When its `value` changes to text nobody typed, as when the file is replaced while open or moved edits land on it,
  the library writes it into the model as an undoable edit. The editor then sets the same text with `setValue`, which
  drops the history, so Ctrl+Z can't bring the replaced file back for Save to write. A replacement with the same text
  changes nothing the editor is handed, and its reload can land before the provider even shows the contents missing.
  So `editorPathState` also counts each delete, replace and move away per path (`useReplacementCount`), and the
  editor drops the history once the contents after a counted replacement are loaded, whatever the text. It records
  per model which file and count its history follows, because a model taken back before its disposal keeps its
  history, and the same path on another instance shares the model. Typing, saving, and switching to another file and
  back keep their history; switching instances does not.

Apart from the rename's copy, an operation whose outcome is unknown (an unanswered write) changes nothing, because
discarding edits for a file that may still be there loses work. Call sites run these where an unmount can't skip them:
after an `await`, or in a mutation's own `onSuccess`, which takes the instance from the request because the page can
have moved to another by then. A `mutate()` call's `onSuccess` is dropped once its component unmounts.

Buffers are read and written through the session-storage store (`sessionStorageStore`), which every mounted
`useSessionStorage` on a key renders, so an open editor or the tree's unsaved marker updates at once. Writing to
session storage directly would leave a mounted editor showing the old buffer. The store keeps a write that storage
refuses in memory, so a full storage doesn't lose edits mid-rename. The buffers under a folder are found from what
session storage persisted and from the keys the store holds only in memory (`refusedSessionKeys`).

The assistant's `setComponentFile` tool leaves the buffer alone: it writes to a file the person may be editing, which
is a conflict between two editors rather than a path naming a different file.

## Saving a file

The editor's save settles in the mutation's own `onSuccess`, from the request alone
([`EditorViewProvider`](context/EditorViewProvider.tsx)), so a save that lands after another file was opened, or after
the page is gone, still does it: it puts what was saved in the file's cached contents, and clears the file's buffer if
the buffer still equals what was saved. `set_component_file` reports neither a size nor a time, so the cached size is
the UTF-8 length of what was written and the time stays unknown until the next read. It cancels any read of the file
first, since a read sent before the save landed would answer with the old contents after it. A save that lands after
sign-out cleared the caches settles nothing.

Every whole-file write of an open file is this save: the text and schema editors call `saveFile`, and the `.env` secrets
view calls `writeFile`, which rejects instead of toasting so its dialog reports the outcome. Saves are tracked per file
in the mutation cache, so another file can be edited and saved while one is in flight, and a remounted page still sees a
save it started. A second save of the same file is refused until the first settles, with a toast when it would have
written something newer.

A rename or move reads a file, copies it and its buffer, then drops it, so a save that lands in between writes to the
file being dropped and clears the buffer the copy needs. Within a tab the two never overlap on an instance
([`editorSaveInterlock`](lib/editorSaveInterlock.ts)): `useRenameFiles` refuses while an editor save is in flight, and
the save refuses while a rename is, each saying why. Another tab's saves and renames are not seen (#1964). The Rename
dialog and the toolbar's Rename and Restart are disabled while a save is in flight.

## When a deploy is done

Studio deploys with `restart: 'rolling'`. The node that receives the deploy answers once its own part is done and hands
the other nodes to a `restart_service` job, named in the response's `restartJobId` (Harper 4.6+). The deployment record
does not help: only the receiving node writes it, so it reads `success` while that job runs and after it fails.

So [`deployAndFollowComponent`](../../../integrations/api/instance/applications/deployComponent.ts) follows the job with
`get_job` before the mutation settles ([`restartJob.ts`](../../../integrations/api/instance/applications/restartJob.ts)):

- **A failed job rejects with `DeployRolloutError`.** The release is live on the receiving node; the error and the
  progress panel name each node that did not take it. Its message quotes those nodes' errors, so Datadog withholds it
  like `SSEOperationError`.
- **A job Studio could not follow resolves, as `rollout.state === 'unfollowable'`, and is never reported as success.**
  That covers a job that ended with a result in neither shape below. [`reportDeployOutcome`](modals/reportDeployHealth.ts)
  skips the post-deploy health check for it, because that check reads the one node Studio reaches, which can be healthy
  on the release a rejecting node kept; `reportDeployResult` is the same policy for a caller that does not health-check.
  Any new caller of the deploy mutation reports through one of the two.
- **The job may not be there.** `hdb_job` is a non-replicating system table, so only the receiving node can answer for
  it. Central manager's cluster proxy sends every operation to the first running instance, so over the proxy the deploy
  and its polls reach the same node; a direct connection to a cluster's address can reach another node, which answers
  `[]`. A row missing for 20 seconds counts as `not-found`.
- **Every node's outcome arrives at once.** Harper writes the job's row when it starts and when it ends, never in between.

The job comes in two shapes. Harper 5.4's certified rollout activates the staged release on each other node, and each
certifies it with a canary of its own: `result.activated` on success, `message: { error, activated }` on failure. Older
versions, and a 5.4 deploy whose release was not armed for a canary, run the plain restart: `result.replicated`, where a
node the job could not reach is listed with its error and the job still completes, so that node reads `unconfirmed`.

Canary certification is shown only when the response carries it, which only 5.4+ does. There is no version check on
the deploy path: `registration_info` is denied to a role with an operations allowlist, which is exactly the kind of
role that may be allowed to deploy, so a version gate there would hide the result from it.

## Staging and activation are gated the other way

Stage only (`activate: false`) and Activate (`deployment_id`) are offered only when `registration_info` reads 5.3.0 or
later (`useStagedDeploymentsAvailable`), and an unreadable version offers neither. The difference from certification is
what happens when the guess is wrong: a node older than 5.3.0 accepts `activate: false` as an unknown field and makes
the release live, which is the opposite of what the person asked for. Certification only adds a field to a response.

All three kinds of request are built in one place, [`deployRequestBody`](../../../integrations/api/instance/applications/deployComponent.ts),
because Harper's validator refuses the wrong mix outright: a stage with `restart`, or an activation carrying `package`,
install options or `activate`. A stage succeeds only once every other node confirmed staging it, so a stage restarts
nothing and is reported without a health check. Rollback to a kept release (#1232) is the same activation call.

## Private database copies

Harper 5.3 can run an application on its own copy of some databases (`branchedDatabases`: a list of names, or `true` for
every database except `system`). Harper reads the setting only from the application's root-config entry, and the only
operation that writes it there is a package deploy, through
[`deployRequestBody`](../../../integrations/api/instance/applications/deployComponent.ts). A stage sends it too, but
Harper keeps it with the staged release and writes it to the entry only when that release is activated, so a stage
leaves the cached setting current. Four things follow:

- **A redeploy resends it.** A package deploy replaces the entry whole, so leaving the setting out turns the copy off
  and the application quietly goes back to the shared data. The redeploy form starts from the current setting, read
  from the entry in `get_configuration` ([`useApplicationBranchedDatabases`](hooks/useBranchedDatabases.ts)), and
  when the form doesn't offer the setting it resends the current one as it is. A super user's redeploy waits for a
  current read, since the last answer can be the very setting a redeploy would undo. Opening the dialog re-reads it,
  because another tab, the CLI or a colleague may have changed it; Studio's own imports, deploys, activations and
  drops invalidate the query once they settle, answered or not, cancelling any read already in flight, since one sent
  before the write would otherwise count as current; a failed read invalidates it too; and a read still in flight may
  be about to change the answer. The toolbar label and the delete warning show the setting only while it is current,
  so neither claims a copy that was just turned off. `get_configuration` is super-user only, so for anyone else the
  setting is unknown and a redeploy leaves it out, as before (#2019).
- **Offered from 5.3.2, to super users, on package deploys only.** 5.3.0 and 5.3.1 accept it on a package deploy and
  ignore it at load (HarperFast/harper#3071), and an unreadable version offers nothing, for the same reason staging
  isn't offered on one. An application created from a template, by the assistant, or with `harper deploy` has no
  route on 5.3: `set_configuration` writes only `<app>_package` and `<app>_port` into an entry and refuses any other
  key (harper `config/configUtils.ts`, `COMPONENT_PARAM_SUFFIXES`), and a payload deploy ignores the setting on 5.3.
  Harper's unreleased 5.4 accepts it on a payload deploy (harper#3505), which is the likely route for those. Studio
  still shows such an application's setting when its entry has one.
- **A release carries its own.** Activating a staged or earlier release can't carry the setting (Harper refuses it),
  and brings back the one that release was deployed with. Neither `list_deployments` nor `get_deployment` reports
  it, so the activation dialog says so to everyone it offers activation to, and shows the current one where it can
  read it: to a super user on 5.3.2 or later.
- **Removing an application usually keeps the copy.** Studio drops without `restart`, and Harper deletes the copies
  only after a restart, so the copy stays on disk and is picked up again by a later application of the same name.
  Harper says so in the `drop_component` answer, which the delete toast shows.

## A live deploy is sent once

A live (SSE) deploy that gets no event stream goes out again as the buffered POST only when its status proves Harper
never started it: a 4xx. Harper refuses a request before the operation starts (authentication, permissions,
validation) with a 4xx, and answers one it started with a 200 event stream at once. Everything else can follow a deploy
that is already running: a gateway's 5xx after forwarding, a 2xx that is not a stream, a dropped connection, the idle
watchdog firing before headers. Harper's own request-queue 503 never started anything either, but status alone cannot
tell it from a gateway's. So [`onDeployComponentSubmit`](../../../integrations/api/instance/applications/deployComponent.ts)
turns those into `SSEInconclusiveError`, which every deploy caller already answers by checking rather than resending.
`streamOperation` stays neutral: it puts the `status` on `SSEUnsupportedError` and leaves the decision to the caller,
because a read (`get_deployment`) may fall back on anything.

## Who reports a failed deploy

Every caller of [`useDeployComponentMutation`](../../../integrations/api/instance/applications/deployComponent.ts)
shows its own failure. The mutation opts out of the global error toast and reports the failure to RUM itself, with a
mutation-level `console.error` that still runs after the caller unmounts. A new caller has to render or toast the
rejection, or the person sees nothing.

Callers await `mutateAsync` rather than reporting from `mutate()` callbacks, which React Query drops once the caller
unmounts. Following a rollout keeps a deploy pending for up to 30 minutes, so its outcome often lands after the form
or modal that started it is gone. A failure that lands while its progress panel or import form is still on screen is
shown there only; one that lands later goes to a toast, with the deployment record when the failure named one.

## Type acquisition stops at its budget

The editor's type acquisition (`@typescript/ata`) asks jsDelivr for every declaration file in a package's tree at once,
and it keeps reading the imports of files the extra-lib budget has already turned away. So the budget alone limits what
reaches the language worker, not how much is downloaded: one large dependency graph took ~1,000 requests in two seconds,
and the RUM SDK dropped events once its 20 MiB upload queue filled. Every acquisition request therefore goes through
[`createBudgetedFetcher`](components/TextEditorView/harper-language/typeAcquisition.ts), which keeps at most
`MAX_CDN_REQUESTS_IN_FLIGHT` on the network and answers anything still queued with a 503 once the budget is spent.
A slot covers the response body, not just its headers: `fetch` resolves on headers, and the budget is only charged
once ata has read the body, so releasing earlier lets a slow link download far past it. The slots live for the whole
tab, so each request also times out, and a failed one becomes a non-OK response that loses only that file instead of
rejecting ata's whole pass. A replacement for ata's fetch path has to keep all of these.
