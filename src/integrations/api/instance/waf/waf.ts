/**
 * The harper-pro web application firewall operations. Who may call them, why the mode is set-only, and
 * what an edit must preserve: src/features/instance/config/waf/DESIGN.md.
 */
import { InstanceClientConfig, InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { stableJson } from '@/lib/stableJson';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { queryOptions, useMutation } from '@tanstack/react-query';

/** The first tagged harper-pro build with the WAF operations. */
const WAF_MIN_VERSION = '5.2.0-beta.3';

export function supportsWaf(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(WAF_MIN_VERSION, version);
}

export type WafStringOp = 'equals' | 'contains' | 'prefix' | 'regex' | 'exists';

export const WAF_STRING_OPS: readonly WafStringOp[] = ['equals', 'contains', 'prefix', 'regex', 'exists'];

/** A header or query-parameter condition. Header names match case-insensitively. */
export interface WafNamedValueMatch {
	name: string;
	op: WafStringOp;
	/** Required for every op but `exists`. */
	value?: string;
}

/** Every field present must match. */
interface WafPathMatch {
	prefix?: string;
	exact?: string;
	regex?: string;
}

/** Every present condition must match. */
export interface WafRuleMatch {
	/** Addresses or CIDR ranges, IPv4 or IPv6. */
	ip?: string | string[];
	method?: string[];
	path?: WafPathMatch;
	headers?: WafNamedValueMatch[];
	query?: WafNamedValueMatch[];
	// Stored but not enforced: see wafRuleDeferrals.
	ja4?: unknown;
	ja4h?: unknown;
	model?: unknown;
	agent?: unknown;
}

/** The actions the engine enforces. `challenge`, `serve` and `drop` are stored but never applied. */
type WafEnforcedAction = 'block' | 'log' | 'score';

export type WafAction = WafEnforcedAction | 'challenge' | 'serve' | 'drop';

/** The nodes a rule runs on: each present selector must match. Absent, it runs everywhere. */
interface WafActivation {
	nodes?: string[];
	regions?: string[];
	tags?: string[];
}

interface WafProvenance {
	origin?: 'human' | 'managed-feed' | 'agent-proposed' | string;
	approver?: string;
	source?: string;
}

/** One `list_waf_rules` row, as stored: Harper returns the document it validated on write. */
export interface WafRule {
	id: string;
	/** Absent means enabled: the engine skips only `enabled === false`. */
	enabled?: boolean;
	/** Lower runs first. Absent means 0. */
	priority?: number | null;
	/** Only `request` is evaluated; `requestBody` rules are skipped. */
	phase?: 'request' | 'requestBody';
	description?: string | null;
	match?: WafRuleMatch;
	action?: WafAction;
	score?: number | null;
	/** The status a `block` rule answers with. Absent means 403. */
	blockStatus?: number | null;
	/** Watch-only: a match is logged as a would-block and never enforced. */
	shadow?: boolean | null;
	activation?: WafActivation | null;
	scope?: unknown;
	provenance?: WafProvenance | null;
	rateLimit?: unknown;
}

export type WafMode = 'enforce' | 'monitor' | 'off';

/** The threshold the engine uses until `set_waf_mode` stores another (harper-pro `waf/waf.ts`). */
export const DEFAULT_WAF_SCORE_THRESHOLD = 10;

/** A WAF operation Harper rejected. Datadog withholds its message by this `name`. */
export class WafOperationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'WafOperationError';
	}
}

/** The rule changed or vanished since the page loaded it. Keeps its parent's name, so Datadog still withholds it. */
export class WafRuleChangedError extends WafOperationError {}

/**
 * Harper's message from the response body, which quotes rule ids and patterns, rather than the Axios
 * noise. A failure without one (the network, a bug) stays as thrown, and so does a write that got no
 * verdict, which downstream must still be able to tell apart.
 */
function wafOperationError(error: unknown): unknown {
	if (isUnansweredWrite(error)) {
		return error;
	}
	const body = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
	const message = typeof body?.error === 'string' ? body.error : body?.message;
	return typeof message === 'string' ? new WafOperationError(message) : error;
}

/**
 * Harper's answer to an operation nobody registered: the WAF component is not in this build (Harper
 * without harper-pro) or is switched off in its config (`waf.enabled: false`).
 */
const UNREGISTERED = /^Operation 'list_waf_rules' not found$/;

function isUnregistered(error: unknown): boolean {
	return error instanceof WafOperationError && UNREGISTERED.test(error.message);
}

export type WafRuleList = { available: true; rules: WafRule[] } | { available: false };

/** Harper accepts any non-null id and keys the rule by `String(id)`, so a numeric id is a real, enforced rule. */
function asRuleRow(row: unknown): WafRule[] {
	const id = (row as { id?: unknown } | null)?.id;
	return row && typeof row === 'object' && id != null ? [{ ...(row as WafRule), id: String(id) }] : [];
}

async function listWafRules({ instanceClient }: InstanceClientConfig): Promise<WafRule[]> {
	try {
		const { data } = await instanceClient.post<unknown>('/', { operation: 'list_waf_rules' });
		return Array.isArray(data) ? data.flatMap(asRuleRow) : [];
	} catch (error) {
		throw wafOperationError(error);
	}
}

/** Resolves rather than throws when the firewall is absent: that is a state of the cluster, not a failure. */
async function listWafRuleState(params: InstanceClientConfig): Promise<WafRuleList> {
	try {
		return { available: true, rules: await listWafRules(params) };
	} catch (error) {
		if (isUnregistered(error)) {
			return { available: false };
		}
		throw error;
	}
}

export function listWafRulesQueryOptions(params: InstanceClientIdConfig & { enabled?: boolean }) {
	return queryOptions({
		queryKey: [params.entityId, 'list_waf_rules'] as const,
		queryFn: () => listWafRuleState(params),
		enabled: params.enabled,
	});
}

export function isFabricStarterRule(rule: WafRule): boolean {
	return rule.provenance?.origin === 'managed-feed' && rule.id.startsWith('fabric-baseline-');
}

const DEFERRED_ACTIONS: ReadonlySet<string> = new Set(['challenge', 'serve', 'drop']);

const KNOWN_ACTIONS: ReadonlySet<string> = new Set(['block', 'log', 'score', ...DEFERRED_ACTIONS]);

/**
 * Why the engine skips this rule entirely: harper-pro `deferralReasons`, plus the phase and action
 * checks its validator runs ahead of it. Harper answers "Added WAF rule" for a deferred feature
 * (harper-pro#828), and only malformed or legacy data lacks a known action, so these must be said out loud.
 */
export function wafRuleDeferrals(rule: WafRule): string[] {
	const reasons: string[] = [];
	if (rule.action === undefined || !KNOWN_ACTIONS.has(rule.action)) {
		reasons.push(
			rule.action === undefined
				? 'It has no action, so Harper skips it.'
				: `Its action "${String(rule.action)}" is not one Harper knows, so Harper skips it.`,
		);
	}
	if (rule.phase !== undefined && rule.phase !== 'request') {
		reasons.push('Request-body rules are not evaluated yet.');
	}
	if (rule.action !== undefined && DEFERRED_ACTIONS.has(rule.action)) {
		reasons.push(`The ${rule.action} action is not enforced yet.`);
	}
	const match = rule.match;
	if (match?.ja4 != null || match?.ja4h != null) {
		reasons.push('TLS fingerprint (JA4) matching is not enforced yet.');
	}
	if (match?.model != null) {
		reasons.push('Model matching is not enforced yet.');
	}
	if (match?.agent != null) {
		reasons.push('Bot (agent) matching is not enforced yet.');
	}
	if (rule.rateLimit != null) {
		reasons.push('Rate limiting is not enforced yet.');
	}
	return reasons;
}

/** Whether watch-only means anything for this rule: a `log` rule never enforces either way. */
export function canBeWatchOnly(rule: WafRule): boolean {
	return rule.action === 'block' || rule.action === 'score';
}

/**
 * The fields a rule edit sends. `alter_waf_rule` merges these over the stored rule, so a field left
 * out keeps its value and `null` clears it. `match` is replaced whole.
 */
export type WafRulePatch = Partial<Omit<WafRule, 'id'>>;

async function postWafOperation(instanceClient: InstanceClientConfig['instanceClient'], body: object) {
	try {
		const { data } = await instanceClient.post<{ message: string }>('/', body);
		return data;
	} catch (error) {
		throw wafOperationError(error);
	}
}

interface AddWafRuleArgs extends InstanceClientConfig {
	rule: WafRule;
}

function addWafRule({ instanceClient, rule }: AddWafRuleArgs) {
	return postWafOperation(instanceClient, { operation: 'add_waf_rule', rule });
}

export function useAddWafRule() {
	return useMutation({ mutationFn: addWafRule, meta: { skipGlobalErrorToast: true }, onError: reportFormFailure });
}

interface AlterWafRuleArgs extends InstanceClientConfig {
	id: string;
	patch: WafRulePatch;
}

/** One merge: what it leaves out, including another administrator's change to other fields, stays. */
export function alterWafRule({ instanceClient, id, patch }: AlterWafRuleArgs) {
	return postWafOperation(instanceClient, { ...patch, operation: 'alter_waf_rule', id });
}

interface WafRuleWriteArgs extends InstanceClientConfig {
	loaded: WafRule;
}

/**
 * Refused if the stored rule differs from `loaded`. An edit built from a stale copy would undo another
 * administrator's change to what it sends (`match` goes whole), a toggle would enforce a rule whose
 * match was widened since, and a delete would remove a rule the reader never saw. A change landing
 * within this one round trip still wins the race.
 */
async function rereadUnchanged(instanceClient: InstanceClientConfig['instanceClient'], loaded: WafRule) {
	const current = (await listWafRules({ instanceClient })).find((rule) => rule.id === loaded.id);
	if (!current) {
		throw new WafRuleChangedError(`WAF rule ${loaded.id} no longer exists.`);
	}
	if (stableJson(comparable(current)) !== stableJson(comparable(loaded))) {
		throw new WafRuleChangedError(`WAF rule ${loaded.id} changed since this page loaded it. Review it and try again.`);
	}
}

/** Harper reads `null` and absent alike, and an edit stores `null` for a cleared field. */
function withoutNulls(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(withoutNulls);
	}
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).filter(([, entry]) => entry != null).map(([key, entry]) => [key, withoutNulls(entry)]),
		);
	}
	return value;
}

/** The engine skips a rule only on `enabled === false` and watches only on `shadow === true`. */
function comparable(rule: WafRule): unknown {
	return withoutNulls({ ...rule, enabled: rule.enabled !== false, shadow: rule.shadow === true });
}

export async function editWafRule({ instanceClient, loaded, patch }: WafRuleWriteArgs & { patch: WafRulePatch }) {
	await rereadUnchanged(instanceClient, loaded);
	return alterWafRule({ instanceClient, id: loaded.id, patch });
}

export function useEditWafRule() {
	return useMutation({ mutationFn: editWafRule, meta: { skipGlobalErrorToast: true }, onError: reportFormFailure });
}

/** A card has nowhere inline to show a failure, so unlike the form's edit this one toasts it. */
export function useToggleWafRule() {
	return useMutation({ mutationFn: editWafRule });
}

export async function dropWafRule({ instanceClient, loaded }: WafRuleWriteArgs) {
	await rereadUnchanged(instanceClient, loaded);
	return postWafOperation(instanceClient, { operation: 'drop_waf_rule', id: loaded.id });
}

export function useDropWafRule() {
	return useMutation({ mutationFn: dropWafRule });
}

interface SetWafModeArgs extends InstanceClientConfig {
	mode?: WafMode;
	scoreThreshold?: number;
}

/** Sends only what was given: Harper keeps the stored value of whichever is left out. */
export function setWafMode({ instanceClient, mode, scoreThreshold }: SetWafModeArgs) {
	return postWafOperation(instanceClient, {
		operation: 'set_waf_mode',
		...(mode !== undefined ? { mode } : {}),
		...(scoreThreshold !== undefined ? { scoreThreshold } : {}),
	});
}

export function useSetWafMode() {
	return useMutation({ mutationFn: setWafMode });
}

/**
 * The rule form shows its own failure inline, so its mutations skip the global toast, and with it the
 * `console.error` that is how a failed mutation reaches RUM. This keeps that report.
 */
function reportFormFailure(error: unknown) {
	console.error(error);
}
