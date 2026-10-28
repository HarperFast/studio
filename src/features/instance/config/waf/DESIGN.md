# Firewall (WAF) — design notes

## Who may manage it

Every WAF operation is super_user only on the Harper side: each handler in harper-pro
`waf/ruleOperations.ts` calls `requireSuperUser`, which reads the signed-in Harper role, nothing
Fabric-specific. So the page is gated like every other Config tab, on
`useInstanceManagePermission`. Through Fabric Connect the request runs on the instance's
operations socket with full rights, and central manager's `canUpdateCluster` is the real gate.
Any other role gets a 400 `Operation 'listWafRules' not found`, not a 403. That is the camelCase
handler name; the snake_case `Operation 'list_waf_rules' not found` means no handler is
registered at all (Harper without harper-pro, or `waf.enabled: false`), and only that one reads as
"the firewall isn't turned on" ([`waf.ts`](../../../../integrations/api/instance/waf/waf.ts)).

## The mode can be set but not shown

`set_waf_mode` stores the mode and score threshold in a control row of `system.hdb_waf_rules`, and
no operation reads it back: `list_waf_rules` filters it out, and `search_by_id`/`sql` can't see
system tables (harper-pro#1129). So the mode controls start empty and only ever set, and each
sends only its own value, because Harper keeps the stored value of the other. The page states the
node's config fallback from `get_configuration` instead. Once harper-pro#1129 ships, read the
stored values and drop that sentence.

## An edit must not lose what the form can't show

`alter_waf_rule` merges top-level fields over the stored rule, but replaces `match` whole. Harper
also accepts features it doesn't enforce yet (JA4, model and agent matches, rate limits, the
`challenge`/`serve`/`drop` actions — harper-pro#828), and the form deliberately has no inputs for
them. So [`buildWafRule`](wafRuleForm.ts) copies every stored `match` key it doesn't edit into the
new `match`, and a stored deferred action stays selectable. Saving a rule unchanged must send
back exactly what it stores, because a condition that changes shape on the way through can widen
the rule: so stored text is never trimmed (only text the user typed is), a header or query row with
no name is refused rather than dropped, and a list whose text wasn't edited keeps its stored array
(a selector may contain a comma). On top of that, an edit sends only the fields that differ from
saving the rule untouched ([`wafRulePatch`](wafRuleForm.ts)), so a field nobody changed is never
rewritten. A cleared input is sent as `null`, which is how a merge removes a field; a new rule omits
nulls instead.

Every write to an existing rule — an edit, a delete, and the watch-only and enabled toggles —
first re-reads it and refuses if it changed since the page loaded it. A toggle sends one field, but
enforcing a rule whose match another administrator widened meanwhile is the case to stop. A refused
edit offers to load the current rule, because retrying the same copy can never succeed, and the
dialog is keyed by the rule's content so the reload starts the form over. Comparison fills in the
engine's readings first (`enabled !== false`, `shadow === true`, `null` as absent), so only a real
change refuses. An edit that changes nothing writes nothing. Rule ids are normalized to `String(id)`,
which is how Harper keys them, so a numeric id from another client is listed and editable rather
than hidden. A stored rule with no known action, which only malformed or legacy data carries, is
flagged as skipped and opens with no action chosen rather than as Block.
