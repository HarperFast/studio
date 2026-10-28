import { QueryClient } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders, type AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
	alterWafRule,
	dropWafRule,
	editWafRule,
	isFabricStarterRule,
	listWafRulesQueryOptions,
	setWafMode,
	supportsWaf,
	WafOperationError,
	WafRule,
	WafRuleChangedError,
	wafRuleDeferrals,
} from './waf';

/** One of the starter rules central manager installs (`installWafBaseline.js`), as `list_waf_rules` returns it. */
function starterRule(overrides: Partial<WafRule> = {}): WafRule {
	return {
		id: 'fabric-baseline-v1-trace-track-methods',
		enabled: true,
		priority: 130,
		phase: 'request',
		description: 'Observe HTTP TRACE and TRACK requests',
		match: { method: ['TRACE', 'TRACK'] },
		action: 'block',
		blockStatus: 403,
		shadow: true,
		scope: { clusters: ['clu-1'] },
		provenance: { origin: 'managed-feed', source: 'fabric-baseline-v1' },
		...overrides,
	};
}

function harperError(status: number, error: string, operation = 'list_waf_rules') {
	const config = { method: 'post', data: JSON.stringify({ operation }), headers: new AxiosHeaders() };
	return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, undefined, {
		status,
		statusText: '',
		data: { error },
		headers: {},
		config,
	});
}

function client(respond: (body: { operation: string }) => unknown) {
	const post = vi.fn(async (_url: string, body: { operation: string }) => ({ data: await respond(body) }));
	return { post, instanceClient: { post } as unknown as AxiosInstance };
}

async function list(respond: (body: { operation: string }) => unknown) {
	const { instanceClient } = client(respond);
	return new QueryClient().fetchQuery(listWafRulesQueryOptions({ instanceClient, entityId: 'clu-1' }));
}

describe('supportsWaf', () => {
	it('starts at the first harper-pro tag carrying the firewall operations', () => {
		expect(supportsWaf(undefined)).toBe(false);
		expect(supportsWaf('5.1.9')).toBe(false);
		expect(supportsWaf('5.2.0-beta.2')).toBe(false);
		expect(supportsWaf('5.2.0-beta.3')).toBe(true);
		expect(supportsWaf('5.3.4')).toBe(true);
	});
});

describe('listWafRulesQueryOptions', () => {
	it('lists the rows that carry an id', async () => {
		await expect(list(() => [starterRule(), { description: 'no id' }, null])).resolves.toEqual({
			available: true,
			rules: [starterRule()],
		});
	});

	it('keeps a rule with a numeric id, which Harper stores and enforces under String(id)', async () => {
		await expect(list(() => [starterRule({ id: 42 as unknown as string })])).resolves.toEqual({
			available: true,
			rules: [starterRule({ id: '42' })],
		});
	});

	it('reads a Harper without the firewall component as a state, not a failure', async () => {
		await expect(
			list(() => {
				throw harperError(400, "Operation 'list_waf_rules' not found");
			}),
		).resolves.toEqual({ available: false });
	});

	it("still fails for a role Harper won't let run it, which names the handler instead", async () => {
		const failure = list(() => {
			throw harperError(400, "Operation 'listWafRules' not found");
		});
		await expect(failure).rejects.toBeInstanceOf(WafOperationError);
		await expect(failure).rejects.toThrow("Operation 'listWafRules' not found");
	});
});

describe('isFabricStarterRule', () => {
	it('needs both the managed-feed origin and the baseline id', () => {
		expect(isFabricStarterRule(starterRule())).toBe(true);
		expect(isFabricStarterRule(starterRule({ provenance: { origin: 'human', approver: 'admin' } }))).toBe(false);
		expect(isFabricStarterRule(starterRule({ id: 'block-trace' }))).toBe(false);
		expect(isFabricStarterRule(starterRule({ provenance: null }))).toBe(false);
	});
});

describe('wafRuleDeferrals', () => {
	it('has nothing to say about a rule the engine enforces', () => {
		expect(wafRuleDeferrals(starterRule())).toEqual([]);
	});

	it('treats a missing or unknown action, which only malformed data carries, as a rule Harper skips', () => {
		expect(wafRuleDeferrals(starterRule({ action: undefined }))).toEqual(['It has no action, so Harper skips it.']);
		expect(wafRuleDeferrals(starterRule({ action: 'allow' as WafRule['action'] }))).toEqual([
			'Its action "allow" is not one Harper knows, so Harper skips it.',
		]);
	});

	it('names each stored feature the engine skips the whole rule for (harper-pro#828)', () => {
		expect(
			wafRuleDeferrals(starterRule({
				phase: 'requestBody',
				action: 'challenge',
				match: { ja4: 't13d', model: { name: 'bots' }, agent: { webBotAuth: 'verified' } },
				rateLimit: { limit: 10 },
			})),
		).toEqual([
			'Request-body rules are not evaluated yet.',
			'The challenge action is not enforced yet.',
			'TLS fingerprint (JA4) matching is not enforced yet.',
			'Model matching is not enforced yet.',
			'Bot (agent) matching is not enforced yet.',
			'Rate limiting is not enforced yet.',
		]);
	});
});

describe('alterWafRule', () => {
	it('sends only the patch, so every other stored field keeps its value', async () => {
		const { post, instanceClient } = client(() => ({ message: 'Updated WAF rule x' }));
		await alterWafRule({ instanceClient, id: 'fabric-baseline-v1-trace-track-methods', patch: { shadow: false } });
		expect(post).toHaveBeenCalledWith('/', {
			operation: 'alter_waf_rule',
			id: 'fabric-baseline-v1-trace-track-methods',
			shadow: false,
		});
	});

	it("surfaces Harper's validation message rather than the Axios one", async () => {
		const { instanceClient } = client(() => {
			throw harperError(400, 'Invalid WAF rule: match must specify at least one condition', 'alter_waf_rule');
		});
		await expect(alterWafRule({ instanceClient, id: 'x', patch: { match: {} } })).rejects.toThrow(
			new WafOperationError('Invalid WAF rule: match must specify at least one condition'),
		);
	});

	it('rethrows a write that got no verdict untouched, so it still reads as unconfirmed', async () => {
		const gateway = harperError(504, 'Gateway Timeout', 'alter_waf_rule');
		const { instanceClient } = client(() => {
			throw gateway;
		});
		await expect(alterWafRule({ instanceClient, id: 'x', patch: { shadow: false } })).rejects.toBe(gateway);
	});
});

describe('editWafRule', () => {
	it('reads a stored null and an absent field as the same, as Harper does', async () => {
		const { post, instanceClient } = client((body) =>
			body.operation === 'list_waf_rules' ? [starterRule({ score: null, activation: null })] : { message: 'ok' }
		);
		await editWafRule({ instanceClient, loaded: starterRule(), patch: { priority: 5 } });
		expect(post).toHaveBeenLastCalledWith('/', expect.objectContaining({ operation: 'alter_waf_rule' }));
	});

	it('reads an absent priority or block status as its default, as the engine does', async () => {
		const loaded = starterRule({ priority: undefined, blockStatus: undefined });
		const { post, instanceClient } = client((body) =>
			body.operation === 'list_waf_rules' ? [starterRule({ priority: 0, blockStatus: 403 })] : { message: 'ok' }
		);
		await editWafRule({ instanceClient, loaded, patch: { description: 'x' } });
		expect(post).toHaveBeenLastCalledWith('/', expect.objectContaining({ operation: 'alter_waf_rule' }));
	});

	it('reads an absent enabled or shadow flag as its default, as the engine does', async () => {
		const loaded = starterRule({ enabled: undefined, shadow: undefined });
		const { post, instanceClient } = client((body) =>
			body.operation === 'list_waf_rules' ? [starterRule({ enabled: true, shadow: false })] : { message: 'ok' }
		);
		await editWafRule({ instanceClient, loaded, patch: { priority: 5 } });
		expect(post).toHaveBeenLastCalledWith('/', expect.objectContaining({ operation: 'alter_waf_rule' }));
	});

	it('still refuses when a flag really changed', async () => {
		const loaded = starterRule({ enabled: undefined });
		const { post, instanceClient } = client((body) =>
			body.operation === 'list_waf_rules' ? [starterRule({ enabled: false })] : { message: 'ok' }
		);
		await expect(editWafRule({ instanceClient, loaded, patch: { priority: 5 } })).rejects.toThrow(
			/changed since this page loaded it/,
		);
		expect(post).toHaveBeenCalledTimes(1);
	});

	it('writes once the stored rule still matches what the page showed', async () => {
		const { post, instanceClient } = client((body) =>
			body.operation === 'list_waf_rules' ? [starterRule()] : { message: 'ok' }
		);
		await editWafRule({ instanceClient, loaded: starterRule(), patch: { priority: 5 } });
		expect(post).toHaveBeenLastCalledWith('/', {
			operation: 'alter_waf_rule',
			id: 'fabric-baseline-v1-trace-track-methods',
			priority: 5,
		});
	});

	it("refuses to send a stale form over another administrator's change", async () => {
		const { post, instanceClient } = client((body) =>
			body.operation === 'list_waf_rules' ? [starterRule({ shadow: false })] : { message: 'ok' }
		);
		const refusal = editWafRule({ instanceClient, loaded: starterRule(), patch: { priority: 5 } });
		await expect(refusal).rejects.toThrow(/changed since this page loaded it/);
		// Its own class, so the dialog can offer a reload, under the name Datadog withholds.
		await expect(refusal).rejects.toBeInstanceOf(WafRuleChangedError);
		await expect(refusal).rejects.toMatchObject({ name: 'WafOperationError' });
		expect(post.mock.calls.map(([, body]) => body.operation)).toEqual(['list_waf_rules']);
	});
});

describe('dropWafRule', () => {
	it('says the rule is already gone instead of dropping nothing', async () => {
		const { post, instanceClient } = client((body) => (body.operation === 'list_waf_rules' ? [] : { message: 'ok' }));
		await expect(dropWafRule({ instanceClient, loaded: starterRule() })).rejects.toThrow(/no longer exists/);
		expect(post).toHaveBeenCalledTimes(1);
	});

	it('drops by id once the rule is unchanged', async () => {
		const { post, instanceClient } = client((body) =>
			body.operation === 'list_waf_rules' ? [starterRule()] : { message: 'ok' }
		);
		await dropWafRule({ instanceClient, loaded: starterRule() });
		expect(post).toHaveBeenLastCalledWith('/', {
			operation: 'drop_waf_rule',
			id: 'fabric-baseline-v1-trace-track-methods',
		});
	});
});

describe('setWafMode', () => {
	it('sends only the knob being set, since Harper keeps the stored value of the other', async () => {
		const { post, instanceClient } = client(() => ({ message: 'ok' }));
		await setWafMode({ instanceClient, mode: 'monitor' });
		await setWafMode({ instanceClient, scoreThreshold: 15 });
		expect(post.mock.calls.map(([, body]) => body)).toEqual([
			{ operation: 'set_waf_mode', mode: 'monitor' },
			{ operation: 'set_waf_mode', scoreThreshold: 15 },
		]);
	});
});
