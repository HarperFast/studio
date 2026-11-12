# AI Models — design notes

The page reads Harper's `models` block from `get_configuration`, lists it, switches the `/v1` API,
and (on Harper 5.4+) adds, edits and removes entries. Every claim about Harper below was checked
against its source at the tag named, not against the docs.

## What ships in which release

[`models.ts`](../../../../integrations/api/instance/models/models.ts) holds the floors. Each is the
first tag that contains the file or change:

| feature                                     | first tag       | where in harper                                  |
| ------------------------------------------- | --------------- | ------------------------------------------------ |
| the `models` block, `@embed`                | `5.1.0-beta.1`  | `resources/models/bootstrap.ts`, `embedHook.ts`  |
| the `/v1` API (`modelsGateway_enabled`)     | `5.2.1`         | `resources/models/v1/index.ts`                   |
| `models` reloaded from the file, no restart | `5.3.0-alpha.1` | `bootstrap.ts` (`getSharedRootConfigWatcher`)    |
| decision models, `@decide`                  | `5.3.0-beta.4`  | `resources/models/decideHook.ts`                 |
| `set_configuration` takes `models`          | `5.4.0-alpha.1` | `config/configUtils.ts` (HarperFast/harper#3205) |

Two of these differ from what studio#2013 says. `5.2.0` itself shipped without the `/v1` API. And
`set_configuration` refuses `models` on every 5.3 (`Unable to update config, unrecognized config
parameter`), because `CONFIG_PARAM_MAP` has no entry for it, so adding a model from Studio needs
5.4, not 5.3.

The write path was also run against a real Harper 5.4.0-beta.4 from Local Studio: adding, editing
(the stored key and `requestTimeoutMs` came back untouched) and removing an entry, each applied by
Harper within the second and with no restart; `models_generative_default_model` refused as
unrecognized; an unknown entry field refused with `'models.generative.bad.hsot' is not allowed`;
and `/v1/models` answering 404 until an app with no config file was deployed, then 200.

## Keys never reach the page

`get_configuration` returns the config file as it is (`getConfiguration` in `configUtils.ts` is
`configDoc.toJSON()`), so the answer holds every `apiKey` in clear, Fabric's tenant token included.
The page only ever renders [`summarizeModels`](modelEntries.ts), which says where a key comes from
(`Key from ${OPENAI_API_KEY}`, or `Key saved`) and never returns one. The edit form starts with an
empty key input; leaving it empty keeps the stored key, which `buildModelEntry` copies from the
stored entry without it passing through the form. A `user:password@` in a base URL is dropped
before display. A Fabric entry shows nothing but its name, backend and model.

The Overview's raw config editor used to show the block too. It is now a restricted section there
([`configRestrictions.ts`](../overview/configRestrictions.ts)): that editor could never save it
anyway, since it flattens changes to `a_b_c` names and Harper takes `models` only whole.

## Which entries are Fabric's

Nothing in the config file marks an entry as Fabric's, and none can: each built-in backend's schema
is `.unknown(false)` (`validation/configValidator.ts`), so an extra field fails validation. Studio
tells them apart by what Fabric writes:

- central manager's `HDBInstance.modelsConfig` names the entries it routes to a GPU hub
  (`buildEmbedModelsConfig`, central-manager `src/lib/embedRouting.js`). The cluster read returns it
  with each token masked, and only the names are used.
- on a GPU host, host manager writes entries pointing at `host.docker.internal`
  (`buildHarperModelsConfig`, host-manager `src/helpers/vllmPlan.js`), which central manager has no
  record of. So that host name in `baseUrl` also marks an entry as managed.

Off Fabric (Local Studio, a self-managed cluster) nothing is managed. Until the cluster has loaded,
no entry can be told apart, so nothing is offered for change.

## Why adding is off on Fabric

Host manager makes the whole `models` block equal to Fabric's on every setup pass
(`ensureModelsConfigFile`, host-manager `src/helpers/modelsConfigFile.js`), so a customer's entry
is gone at the next one. HarperFast/host-manager#279 changes that. Until it runs on every Fabric
host, `FABRIC_KEEPS_CUSTOMER_MODELS` in `models.ts` stays `false` and the page offers no add, edit
or remove there. Flip it when the fix is deployed; nothing else changes.

## A save is a read-modify-write on each instance

`set_configuration` takes `models` as a complete replacement, not a merge (`config/DESIGN.md` in
harper). So [`saveModelChange`](saveModelChange.ts) reads the instance's configuration again, sets
or removes the one entry in the block it holds at that moment, and writes the block back. Every
other entry and every other setting in the block (`calibration`, say) goes back as it was read.

It does this on each running instance, one at a time, and never with `replicated: true`. Each
instance's block differs: Fabric's entries point at that instance's own GPU hub or host, with its
own token. Fanning one instance's block out would put its Fabric entries on every other instance.

- An instance below 5.4 would refuse the write, so if any target's version reads as older, nothing
  is written anywhere.
- An entry Fabric manages on that instance is never written over, whatever the page thought.
- With one target, the entry must still be what the page loaded, or the save is refused as stale.
  Across a cluster the page read whichever instance answered, so a difference on another instance
  may only mean it was behind; the save brings it level rather than refusing forever.
- A failure after the first instance stops the save and says how far it got. The first failure
  before any write is passed through as it is, so Harper's own refusal is what the form shows.
- An instance that isn't running is skipped and counted in the success message.

Studio's write can hand back a copy of one of Fabric's entries that went stale between the read and
the write (a token rotation, say). Host manager re-asserts its own entries on its next pass, which
is what makes that harmless.

No restart follows: Harper watches the file and reloads `models` from 5.3. One exception Studio
can't see: when `HARPER_DEFAULT_CONFIG` names model settings, Harper turns the watcher off and the
change waits for a restart (`config/DESIGN.md`). And when `HARPER_CONFIG` or `HARPER_SET_CONFIG`
names them, Harper refuses the write with a 409, which the form shows.

## What the form will and won't write

- The name pattern (letters, digits, `-`, `_`, starting with a letter or digit) is Studio's own and
  narrower than Harper's, which takes any key. It keeps `__proto__` out and matches what host
  manager allows for Fabric's names. Stored entries with other names are still listed and editable.
- Anthropic is not offered for an embedding model: Harper's schema accepts it, but the backend has
  no `embed` (`components/anthropic/index.ts`).
- A decision model's only built-in backend is `generative`, which names a generative entry
  (`default` when it names none, `resources/models/generativeDecision.ts`). The form refuses a
  name that doesn't exist, since Harper would accept it and fail at the first decision.
- An edit that keeps the backend writes only the fields that were changed, over the stored entry.
  Changing the backend starts the entry over, because Harper refuses another backend's fields and
  the old key belongs to another provider.
- An entry whose backend is a module path has no form. It can be removed, not edited.

## The `/v1` API

`modelsGateway_enabled` is the one model setting `set_configuration` has always taken, and it needs
a restart, so the switch uses `useRollingConfigUpdate` like the Overview's save. The three
endpoints need a super user (`resources/models/v1/index.ts`).

They are served by REST, and the gateway doesn't start REST itself. REST runs when the root config
has a `rest` section or an app turns it on: by naming `rest` in its config file, or by having no
config file at all, since Harper then loads `components/DEFAULT_CONFIG.ts`, which has `rest: true`.
[`restServed.ts`](restServed.ts) decides it from the root config first and reads app configs only
when that doesn't settle it. It warns only on a definite no: while a config is unread or doesn't
parse, it says nothing.
