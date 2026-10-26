import type { WafRule } from '@/integrations/api/instance/waf/waf';
import { describe, expect, it } from 'vitest';
import {
	buildWafRule,
	emptyWafRuleForm,
	newWafRule,
	WafRuleFormValues,
	wafRuleFormValues,
	wafRuleIdError,
	wafRulePatch,
} from './wafRuleForm';

/** Central manager's scanner starter rule (`installWafBaseline.js`), as stored. */
const SCANNER_RULE: WafRule = {
	id: 'fabric-baseline-v1-common-scanner-user-agent',
	priority: 100,
	description: 'Observe requests from common automated vulnerability scanners',
	match: {
		headers: [{ name: 'user-agent', op: 'regex', value: '\\b(?:[sS][qQ][lL][mM][aA][pP])\\b' }],
	},
	enabled: true,
	phase: 'request',
	action: 'block',
	blockStatus: 403,
	shadow: true,
	scope: { clusters: ['clu-1'] },
	provenance: { origin: 'managed-feed', source: 'fabric-baseline-v1' },
};

function form(overrides: Partial<WafRuleFormValues>): WafRuleFormValues {
	return { ...emptyWafRuleForm(), ...overrides };
}

function fieldsOf(result: ReturnType<typeof buildWafRule>) {
	if (!result.ok) {
		throw new Error(`expected a rule, got ${JSON.stringify(result.errors)}`);
	}
	return result.fields;
}

function errorsOf(result: ReturnType<typeof buildWafRule>) {
	if (result.ok) {
		throw new Error('expected errors');
	}
	return result.errors;
}

describe('buildWafRule', () => {
	it('gives back an unedited rule as it was stored', () => {
		const fields = fieldsOf(buildWafRule(wafRuleFormValues(SCANNER_RULE), SCANNER_RULE));
		expect(fields).toEqual({
			description: SCANNER_RULE.description,
			enabled: true,
			priority: 100,
			action: 'block',
			blockStatus: 403,
			score: null,
			shadow: true,
			match: SCANNER_RULE.match,
			activation: null,
		});
	});

	it("carries over stored match keys the form can't edit, since alter_waf_rule replaces match whole", () => {
		const rule: WafRule = { ...SCANNER_RULE, action: 'challenge', match: { ja4: ['t13d'], method: ['GET'] } };
		const fields = fieldsOf(buildWafRule({ ...wafRuleFormValues(rule), methods: 'post' }, rule));
		expect(fields.match).toEqual({ ja4: ['t13d'], method: ['POST'] });
		expect(fields.action).toBe('challenge');
	});

	it('sends null for what was cleared, so the edit removes it instead of keeping the stored value', () => {
		const rule: WafRule = { ...SCANNER_RULE, activation: { regions: ['us-east'] } };
		const fields = fieldsOf(
			buildWafRule({ ...wafRuleFormValues(rule), description: '  ', priority: '', regions: '' }, rule),
		);
		expect(fields.description).toBeNull();
		expect(fields.priority).toBeNull();
		expect(fields.activation).toBeNull();
	});

	it('clears the other action’s setting when the action changes', () => {
		const fields = fieldsOf(buildWafRule({ ...wafRuleFormValues(SCANNER_RULE), action: 'score', score: '4' }));
		expect(fields).toMatchObject({ action: 'score', score: 4, blockStatus: null });
	});

	it('clears watch-only on a log rule, where it means nothing and would resurface as a block rule', () => {
		const fields = fieldsOf(buildWafRule({ ...wafRuleFormValues(SCANNER_RULE), action: 'log' }, SCANNER_RULE));
		expect(fields.shadow).toBeNull();
	});

	it('keeps watch-only on a deferred action, since that is what it will do once Harper enforces it', () => {
		const rule: WafRule = { ...SCANNER_RULE, action: 'challenge' };
		expect(fieldsOf(buildWafRule(wafRuleFormValues(rule), rule)).shadow).toBe(true);
	});

	it('splits addresses and methods on lines or commas, and upper-cases methods', () => {
		const fields = fieldsOf(
			buildWafRule(form({ ip: '10.0.0.0/8\n192.0.2.1, 2001:db8::/32', methods: 'trace, track' })),
		);
		expect(fields.match).toEqual({ ip: ['10.0.0.0/8', '192.0.2.1', '2001:db8::/32'], method: ['TRACE', 'TRACK'] });
	});

	it('keeps every path field filled in, and trims what was typed, since a stray space never matches', () => {
		const fields = fieldsOf(buildWafRule(form({ pathPrefix: ' /admin/ ', pathExact: '', pathRegex: '\\.php$ ' })));
		expect(fields.match).toEqual({ path: { prefix: '/admin/', regex: '\\.php$' } });
	});

	it('keeps a stored name when only the value changed, or when another row was removed', () => {
		const rule: WafRule = {
			...SCANNER_RULE,
			match: {
				query: [{ name: 'a', op: 'exists' }, { name: ' q ', op: 'equals', value: 'old' }],
			},
		};
		const values = wafRuleFormValues(rule);
		const edited = { ...values, query: [values.query[0], { ...values.query[1], value: 'new' }] };
		expect(fieldsOf(buildWafRule(edited, rule)).match.query).toEqual([
			{ name: 'a', op: 'exists' },
			{ name: ' q ', op: 'equals', value: 'new' },
		]);

		const removed = { ...values, query: [values.query[1]] };
		expect(fieldsOf(buildWafRule(removed, rule)).match.query).toEqual([{ name: ' q ', op: 'equals', value: 'old' }]);
	});

	it('trims a typed row even when its name matches a stored one exactly', () => {
		const rule: WafRule = { ...SCANNER_RULE, match: { query: [{ name: ' q ', op: 'exists' }] } };
		const values = wafRuleFormValues(rule);
		const typed = { ...values, query: [...values.query, { name: ' q ', op: 'equals' as const, value: 'x' }] };
		expect(fieldsOf(buildWafRule(typed, rule)).match.query).toEqual([
			{ name: ' q ', op: 'exists' },
			{ name: 'q', op: 'equals', value: 'x' },
		]);
	});

	it('trims a typed header name, and keeps an untouched stored row exactly as stored', () => {
		const rule: WafRule = { ...SCANNER_RULE, match: { headers: [{ name: ' x-odd', op: 'exists' }] } };
		const values = wafRuleFormValues(rule);
		expect(fieldsOf(buildWafRule(values, rule)).match).toEqual(rule.match);

		const typed = { ...values, headers: [...values.headers, { name: ' x-debug ', op: 'exists' as const, value: '' }] };
		expect(fieldsOf(buildWafRule(typed, rule)).match.headers).toEqual([
			{ name: ' x-odd', op: 'exists' },
			{ name: 'x-debug', op: 'exists' },
		]);
	});

	it('saves a rule with whitespace in its paths unchanged, rather than dropping or trimming a condition', () => {
		const rule: WafRule = { ...SCANNER_RULE, match: { method: ['GET'], path: { regex: ' ', exact: '/admin ' } } };
		expect(fieldsOf(buildWafRule(wafRuleFormValues(rule), rule)).match).toEqual(rule.match);
	});

	it('keeps a stored list whose text was not edited, so a selector containing a comma survives', () => {
		const rule: WafRule = {
			...SCANNER_RULE,
			match: { ip: '203.0.113.0/24', method: ['get'] },
			activation: { tags: ['blue,green'], regions: ['us-east'] },
		};
		const fields = fieldsOf(buildWafRule(wafRuleFormValues(rule), rule));
		expect(fields.match).toEqual(rule.match);
		expect(fields.activation).toEqual({ regions: ['us-east'], tags: ['blue,green'] });
	});

	it('splits a list again once its text was edited', () => {
		const rule: WafRule = { ...SCANNER_RULE, activation: { tags: ['blue,green'] } };
		const fields = fieldsOf(buildWafRule({ ...wafRuleFormValues(rule), tags: 'blue, red' }, rule));
		expect(fields.activation).toEqual({ tags: ['blue', 'red'] });
	});

	it('sends no value for a presence check', () => {
		const fields = fieldsOf(buildWafRule(form({ headers: [{ name: 'x-debug', op: 'exists', value: 'leftover' }] })));
		expect(fields.match).toEqual({ headers: [{ name: 'x-debug', op: 'exists' }] });
	});

	it('refuses a condition row with no name rather than dropping it, which would widen the rule', () => {
		for (const row of [{ name: ' ', op: 'exists', value: '' }, { name: '', op: 'equals', value: '' }] as const) {
			expect(errorsOf(buildWafRule(form({ pathPrefix: '/api', headers: [row] })))).toEqual({
				headers: 'Every header condition needs a name.',
			});
		}
	});

	it('builds activation from only the selectors filled in, since Harper rejects an empty one', () => {
		const fields = fieldsOf(buildWafRule(form({ methods: 'GET', regions: 'us-east, eu-west', tags: ' ' })));
		expect(fields.activation).toEqual({ regions: ['us-east', 'eu-west'] });
	});

	it('names what the form can tell is wrong, beside the input it belongs to', () => {
		expect(errorsOf(buildWafRule(form({})))).toEqual({
			match: 'Add at least one condition: an IP address, method, path, header or query parameter.',
		});
		expect(
			errorsOf(buildWafRule(form({
				methods: 'GET',
				priority: 'first',
				blockStatus: '200',
				headers: [{ name: '', op: 'equals', value: 'x' }],
				query: [{ name: 'q', op: 'contains', value: '' }],
			}))),
		).toEqual({
			priority: 'Priority must be a number.',
			blockStatus: 'Use a 4xx or 5xx status, such as 403.',
			headers: 'Every header condition needs a name.',
			query: 'Give the query parameter "q" a value to compare, or check only that it is present.',
		});
		expect(errorsOf(buildWafRule(form({ methods: 'GET', action: 'score' })))).toEqual({
			score: 'A score rule needs a number to add to the request’s score.',
		});
	});

	it('ignores the block status of a rule that no longer blocks', () => {
		expect(buildWafRule(form({ methods: 'GET', action: 'log', blockStatus: 'nonsense' })).ok).toBe(true);
	});
});

describe('wafRulePatch', () => {
	it('sends nothing for a rule saved untouched', () => {
		const fields = fieldsOf(buildWafRule(wafRuleFormValues(SCANNER_RULE), SCANNER_RULE));
		expect(wafRulePatch(SCANNER_RULE, fields)).toEqual({});
	});

	it('sends only what changed, so a field nobody touched is never rewritten', () => {
		const rule: WafRule = { ...SCANNER_RULE, blockStatus: undefined };
		const fields = fieldsOf(buildWafRule({ ...wafRuleFormValues(rule), description: 'Scanners' }, rule));
		expect(wafRulePatch(rule, fields)).toEqual({ description: 'Scanners' });
	});

	it('sends the fields a change of action clears', () => {
		const fields = fieldsOf(buildWafRule({ ...wafRuleFormValues(SCANNER_RULE), action: 'log' }, SCANNER_RULE));
		expect(wafRulePatch(SCANNER_RULE, fields)).toEqual({ action: 'log', blockStatus: null, shadow: null });
	});
});

describe('newWafRule', () => {
	it('drops the nulls, which only mean something to an edit, and sets the evaluated phase', () => {
		const fields = fieldsOf(buildWafRule(form({ pathPrefix: '/admin/' })));
		expect(newWafRule(' block-admin ', fields)).toEqual({
			id: 'block-admin',
			phase: 'request',
			enabled: true,
			action: 'block',
			shadow: false,
			match: { path: { prefix: '/admin/' } },
		});
	});
});

describe('wafRuleIdError', () => {
	const existing = new Set(['block-admin']);

	it('accepts a new, plain id', () => {
		expect(wafRuleIdError('block-admin-2', existing)).toBeUndefined();
	});

	it('refuses a blank, oddly spelled, reserved or taken id', () => {
		expect(wafRuleIdError('  ', existing)).toBe('Give the rule an id.');
		expect(wafRuleIdError('block admin', existing)).toMatch(/^Start with a letter or digit/);
		expect(wafRuleIdError('__waf_control__', existing)).toMatch(/^Start with a letter or digit/);
		expect(wafRuleIdError('block-admin', existing)).toBe('A rule with this id already exists.');
	});
});
