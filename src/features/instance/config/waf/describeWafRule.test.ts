import type { WafRule } from '@/integrations/api/instance/waf/waf';
import { describe, expect, it } from 'vitest';
import { describeWafAction, describeWafActivation, describeWafMatch, describeWafProvenance } from './describeWafRule';

function rule(overrides: Partial<WafRule>): WafRule {
	return { id: 'r', phase: 'request', action: 'block', match: {}, ...overrides };
}

describe('describeWafMatch', () => {
	it('writes one line per condition, with alternatives joined by "or"', () => {
		expect(describeWafMatch(rule({
			match: {
				ip: '10.0.0.0/8',
				method: ['TRACE', 'TRACK'],
				path: { prefix: '/admin/', regex: '\\.php$' },
				headers: [{ name: 'x-debug', op: 'exists' }],
				query: [{ name: 'q', op: 'contains', value: 'select' }],
				ja4: ['t13d'],
			},
		}))).toEqual([
			'IP 10.0.0.0/8',
			'Method TRACE or TRACK',
			'Path starts with /admin/',
			'Path matches \\.php$',
			'Header x-debug is present',
			'Query q contains select',
			'TLS fingerprint (JA4)',
		]);
	});
});

describe('describeWafAction', () => {
	it('names the status a block answers with, defaulting to 403', () => {
		expect(describeWafAction(rule({}))).toBe('Block with 403');
		expect(describeWafAction(rule({ blockStatus: 429 }))).toBe('Block with 429');
		expect(describeWafAction(rule({ action: 'score', score: 4 }))).toBe('Add 4 to the request’s score');
		expect(describeWafAction(rule({ action: 'log' }))).toBe('Log only');
		expect(describeWafAction(rule({ action: 'drop' }))).toBe('Drop');
	});
});

describe('describeWafActivation', () => {
	it('says every node when nothing narrows it', () => {
		expect(describeWafActivation(rule({}))).toBe('Every node');
		expect(describeWafActivation(rule({ activation: null }))).toBe('Every node');
	});

	it('lists each selector that narrows it', () => {
		expect(describeWafActivation(rule({ activation: { regions: ['us-east', 'eu-west'], tags: ['canary'] } })))
			.toBe('Regions: us-east, eu-west · Tags: canary');
	});
});

describe('describeWafProvenance', () => {
	it('says who added the rule when the rule records it', () => {
		expect(describeWafProvenance(rule({ provenance: { origin: 'human', approver: 'admin' } }))).toBe(
			'Added by admin',
		);
		expect(describeWafProvenance(rule({ provenance: { origin: 'managed-feed', source: 'acme-feed' } }))).toBe(
			'Managed feed: acme-feed',
		);
		expect(describeWafProvenance(rule({}))).toBeUndefined();
	});
});
