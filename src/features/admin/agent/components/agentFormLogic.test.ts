/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/apiClient', () => ({ apiClient: {} }));

import { rangeFor } from '@/features/admin/agent/components/Activity';
import { formatDuration, formatUsd, runCostLabel, runDuration } from '@/features/admin/agent/components/AgentBits';
import {
	changedSettings,
	isSettled,
	parseDraft,
	settingGroup,
	startDraft,
} from '@/features/admin/agent/components/AgentSettingsForm';
import { switchedOffReason } from '@/features/admin/agent/index';

const entry = (name: string, value: unknown) => ({ name, value, description: 'd', superUserOnly: false });

describe('settings form logic', () => {
	it('reads a draft back as the row type', () => {
		expect(parseDraft('boolean', true)).toEqual({ ok: true, value: true });
		expect(parseDraft('number', '2.5')).toEqual({ ok: true, value: 2.5 });
		expect(parseDraft('number', '')).toEqual({ ok: false, error: 'Enter a number.' });
		expect(parseDraft('number', 'abc')).toMatchObject({ ok: false });
		expect(parseDraft('string', ' x ')).toEqual({ ok: true, value: ' x ' });
		expect(parseDraft('json', '{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
		expect(parseDraft('json', '{')).toMatchObject({ ok: false });
	});

	it('reports only keys whose value changed, each with the value it was read with', () => {
		const settings = [
			entry('AGENT_ENABLED', false),
			entry('AGENT_RUN_BUDGET_USD', 1),
			entry('AGENT_SLACK_CHANNEL', 'a'),
		];
		const { changes, errors } = changedSettings(settings, {
			AGENT_ENABLED: { text: true, expected: false },
			AGENT_RUN_BUDGET_USD: { text: '1', expected: 1 },
			AGENT_SLACK_CHANNEL: { text: 'b', expected: 'a' },
		});
		expect(changes).toEqual([
			{ name: 'AGENT_ENABLED', value: true, expected: false },
			{ name: 'AGENT_SLACK_CHANNEL', value: 'b', expected: 'a' },
		]);
		expect(errors).toEqual({});
	});

	it('holds back an unparseable draft as an error', () => {
		const { changes, errors } = changedSettings([entry('AGENT_RUN_BUDGET_USD', 1)], {
			AGENT_RUN_BUDGET_USD: { text: 'x', expected: 1 },
		});
		expect(changes).toEqual([]);
		expect(errors).toEqual({ AGENT_RUN_BUDGET_USD: 'Enter a number.' });
	});

	// A refetch after someone else's save must not move the baseline, or the stale draft would overwrite their value.
	it('keeps the value an edit started from when the row changes underneath it', () => {
		const draft = startDraft(entry('AGENT_RUN_BUDGET_USD', 1), '2');
		const { changes, movedUnder } = changedSettings([entry('AGENT_RUN_BUDGET_USD', 5)], {
			AGENT_RUN_BUDGET_USD: draft,
		});
		expect(changes).toEqual([{ name: 'AGENT_RUN_BUDGET_USD', value: 2, expected: 1 }]);
		expect(movedUnder).toEqual(['AGENT_RUN_BUDGET_USD']);
	});

	it('settles a draft the server already holds, as after a save that landed without an answer', () => {
		const draft = startDraft(entry('AGENT_RUN_BUDGET_USD', 1), '2');
		const { changes, movedUnder } = changedSettings([entry('AGENT_RUN_BUDGET_USD', 2)], {
			AGENT_RUN_BUDGET_USD: draft,
		});
		expect(changes).toEqual([]);
		expect(movedUnder).toEqual([]);
	});

	it('starts a new edit of a settled draft from the value the server now holds', () => {
		const settled = startDraft(entry('AGENT_RUN_BUDGET_USD', 1), '2');
		expect(isSettled(settled, entry('AGENT_RUN_BUDGET_USD', 2))).toBe(true);
		expect(isSettled(settled, entry('AGENT_RUN_BUDGET_USD', 5))).toBe(false);
	});

	it('groups by what the name says, with anything unrecognized in Other', () => {
		expect(settingGroup('AGENT_ENABLED')).toBe('Switches');
		expect(settingGroup('AGENT_ROLE_INVESTIGATOR_ENABLED')).toBe('Switches');
		expect(settingGroup('AGENT_MONTHLY_BUDGET_USD_INVESTIGATOR')).toBe('Budgets');
		expect(settingGroup('AGENT_SLACK_ENABLED')).toBe('Slack');
		expect(settingGroup('GRAFANA_LOKI_URL')).toBe('Data sources');
		expect(settingGroup('AGENT_TRIGGER_COOLDOWN_MINUTES')).toBe('Other');
	});
});

describe('range choice', () => {
	it('maps presets to trailing spans and falls back to the default range', () => {
		expect(rangeFor('default', '', '')).toEqual({ kind: 'default' });
		expect(rangeFor('24h', '', '')).toEqual({ kind: 'last', hours: 24 });
		expect(rangeFor('7d', '', '')).toEqual({ kind: 'last', hours: 168 });
		expect(rangeFor('custom', '2026-11-01', '')).toEqual({ kind: 'default' });
	});

	it('includes the chosen end day by sending the day after it', () => {
		expect(rangeFor('custom', '2026-10-25', '2026-10-31')).toEqual({
			kind: 'between',
			from: '2026-10-25',
			to: '2026-11-01',
		});
	});
});

describe('run display helpers', () => {
	it('shows settled spend once known, else the reservation', () => {
		expect(runCostLabel({ cost: { spentUsd: 0.42, spendKnown: true } })).toBe('$0.42');
		expect(runCostLabel({ cost: { reservedUsd: 1, spentUsd: 0, spendKnown: false } })).toBe('$1.00 reserved');
		expect(runCostLabel({ cost: null })).toBe('—');
		expect(formatUsd(0.0123)).toBe('$0.0123');
	});

	it('measures duration from start to finish, and not for an open run', () => {
		expect(
			runDuration({
				createdAt: '2026-11-17T10:00:00Z',
				startedAt: '2026-11-17T10:00:01Z',
				finishedAt: '2026-11-17T10:00:43Z',
			}),
		)
			.toBe('42s');
		expect(runDuration({ createdAt: '2026-11-17T10:00:00Z', finishedAt: null })).toBe('—');
		expect(formatDuration(210)).toBe('210 ms');
		expect(formatDuration(125_000)).toBe('2m 5s');
	});
});

describe('switched-off state', () => {
	it('names the global switch first, then a role switched off everywhere', () => {
		expect(switchedOffReason({ agentEnabled: false, roles: [] })).toContain('agent is switched off');
		expect(switchedOffReason({ agentEnabled: true, roles: [{ role: 'investigator', enabled: false }] })).toContain(
			'investigator role is switched off',
		);
		expect(switchedOffReason({ agentEnabled: true, roles: [{ role: 'investigator', enabled: true }] })).toBeNull();
	});
});
