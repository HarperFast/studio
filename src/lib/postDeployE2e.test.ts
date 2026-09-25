import { describe, expect, it } from 'vitest';
import {
	advertisedVersions,
	collectOutcomes,
	composeReport,
	findEntryChunk,
	judge,
	observeDeployment,
	parseTimeoutSeconds,
	type PlaywrightReport,
	redact,
	redactDeep,
	renderSummary,
	servesVersion,
	waitForVersion,
} from '../../.github/actions/studio-e2e/postDeploy';

type Result = { status: string; error?: { message?: string } };

function playwrightTest(status: string, results: Result[], annotations: { type: string; description?: string }[] = []) {
	return { projectName: 'anon', status, annotations, results };
}

function report(tests: ReturnType<typeof playwrightTest>[], errors: { message: string }[] = []): PlaywrightReport {
	return {
		config: { version: '1.62.1' },
		stats: { duration: 61_000 },
		errors,
		suites: [{
			title: 'a.anon.spec.ts',
			specs: tests.map((test, index) => ({
				title: `case ${index}`,
				file: 'a.anon.spec.ts',
				line: index + 1,
				tests: [test],
			})),
		}],
	};
}

const passed = playwrightTest('expected', [{ status: 'passed' }]);
const failed = playwrightTest('unexpected', [
	{ status: 'failed', error: { message: 'first attempt' } },
	{
		status: 'failed',
		error: {
			message: `TimeoutError: locator.click: Timeout 15000ms exceeded.\nCall log:\n${
				String.fromCharCode(27)
			}[2m  - waiting for getByRole('button', { name: 'Account menu' })${String.fromCharCode(27)}[22m\n`,
		},
	},
]);
const skipped = playwrightTest('skipped', [{ status: 'skipped' }], [{
	type: 'skip',
	description: 'No test account configured',
}]);
const notRun = playwrightTest('skipped', []);
const interrupted = playwrightTest('skipped', [{ status: 'skipped' }]);

describe('the deployed-version gate', () => {
	it.each([
		['<script type="module" crossorigin src="/assets/index-CFNWlyyF.js"></script>', '/assets/index-CFNWlyyF.js'],
		['<script src="./assets/index-a_b-C.js"></script>', '/assets/index-a_b-C.js'],
		['<script src="assets/index-X1.js"></script>', '/assets/index-X1.js'],
		['<link rel="modulepreload" href="/assets/vendor-core-B1.js">', undefined],
	])('finds the entry chunk in %s', (html, entry) => {
		expect(findEntryChunk(html)).toBe(entry);
	});

	it('matches a version only as a whole token', () => {
		const bundle = 'const version=`v2.18.30`,env=`dev_e1fb687`;';
		expect(servesVersion(bundle, 'v2.18.30')).toBe(true);
		expect(servesVersion(bundle, 'v2.18.3')).toBe(false);
		expect(servesVersion(bundle, 'dev_e1fb687')).toBe(true);
		expect(servesVersion(bundle, 'dev_e1fb68')).toBe(false);
	});

	it('names every version-looking token a bundle carries, for the failure message', () => {
		expect(advertisedVersions('a=`v1.4.0`,b=`v2.183.1`,c=`v2.183.1`,d=`dev_e1fb687`')).toEqual([
			'v1.4.0',
			'v2.183.1',
			'dev_e1fb687',
		]);
		expect(advertisedVersions('no marker here')).toEqual([]);
	});

	it.each([['', 600], ['30', 30]])('reads a timeout of %j as %d seconds', (value, seconds) => {
		expect(parseTimeoutSeconds(value)).toBe(seconds);
	});

	it.each(['10m', '0', '-5'])('refuses a timeout of %j instead of waiting forever', (value) => {
		expect(() => parseTimeoutSeconds(value)).toThrow('version-timeout-seconds must be a positive number');
	});

	function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
		return (async (input: string | URL | Request) => {
			const path = new URL(String(input)).pathname;
			const route = routes[path];
			if (!route) { throw new Error(`unexpected request to ${path}`); }
			return route();
		}) as typeof fetch;
	}

	const index = () => new Response('<script src="/assets/index-A1.js"></script>');

	it('reports a lagging node that 404s the new chunk as not yet live', async () => {
		const observation = await observeDeployment(
			'https://example.test',
			'dev_abc1234',
			fakeFetch({ '/': index, '/assets/index-A1.js': () => new Response('', { status: 404 }) }),
		);
		expect(observation).toEqual({ matches: false, detail: 'GET /assets/index-A1.js answered 404' });
	});

	it('reports an older build by the version it serves', async () => {
		const observation = await observeDeployment(
			'https://example.test',
			'dev_abc1234',
			fakeFetch({ '/': index, '/assets/index-A1.js': () => new Response('v=`dev_0000000`') }),
		);
		expect(observation).toEqual({ matches: false, detail: '/assets/index-A1.js serves dev_0000000' });
	});

	it('turns a network failure into an observation instead of throwing', async () => {
		const observation = await observeDeployment('https://example.test', 'dev_abc1234', fakeFetch({}));
		expect(observation.matches).toBe(false);
		expect(observation.detail).toBe('request failed: unexpected request to /');
	});

	it('recognizes the expected build', async () => {
		const observation = await observeDeployment(
			'https://example.test',
			'dev_abc1234',
			fakeFetch({ '/': index, '/assets/index-A1.js': () => new Response('v=`dev_abc1234`') }),
		);
		expect(observation).toEqual({ matches: true, detail: '/assets/index-A1.js serves dev_abc1234' });
	});

	function clock() {
		let time = 0;
		return {
			now: () => time,
			sleepImpl: async (ms: number) => {
				time += ms;
			},
		};
	}

	it('counts only consecutive matches as live', async () => {
		const sequence = [false, true, true, false, true, true, true];
		let call = 0;
		const result = await waitForVersion({
			observe: async () => ({ matches: sequence[call++], detail: `check ${call}` }),
			timeoutMs: 600_000,
			...clock(),
		});
		expect(result).toEqual({ ok: true, lastSeen: 'check 7', checks: 7 });
	});

	it('gives up at the deadline and keeps the last observation', async () => {
		const result = await waitForVersion({
			observe: async () => ({ matches: false, detail: 'serves dev_0000000' }),
			timeoutMs: 30_000,
			...clock(),
		});
		expect(result).toEqual({ ok: false, lastSeen: 'serves dev_0000000', checks: 4 });
	});
});

describe('the post-deploy verdict', () => {
	it('passes a clean run', () => {
		const verdict = judge(report([passed, passed]), 0);
		expect(verdict.ok).toBe(true);
		expect(verdict.counts.passed).toBe(2);
	});

	it('fails on a failure and keeps the last attempt’s message without colors or the call-log label', () => {
		const verdict = judge(report([passed, failed]), 1);
		expect(verdict.ok).toBe(false);
		expect(verdict.problems).toEqual(['1 failed']);
		expect(verdict.outcomes[1].detail).toBe(
			"TimeoutError: locator.click: Timeout 15000ms exceeded. — waiting for getByRole('button', { name: 'Account menu' })",
		);
	});

	it('passes a flaky run but counts it', () => {
		const flaky = playwrightTest('flaky', [{ status: 'failed', error: { message: 'boom' } }, { status: 'passed' }]);
		const verdict = judge(report([passed, flaky]), 0);
		expect(verdict.ok).toBe(true);
		expect(verdict.counts.flaky).toBe(1);
		expect(verdict.outcomes[1].detail).toBe('boom');
	});

	it('fails a skip, which Playwright itself exits 0 on, and says why it skipped', () => {
		const verdict = judge(report([passed, skipped]), 0);
		expect(verdict.ok).toBe(false);
		expect(verdict.problems).toEqual(['1 skipped']);
		expect(verdict.outcomes[1].detail).toBe('No test account configured');
	});

	it('reports tests cut off by --max-failures as not run, behind the failure that stopped the run', () => {
		const verdict = judge(
			report([failed, notRun], [{ message: 'Testing stopped early after 10 maximum allowed failures.' }]),
			1,
		);
		expect(verdict.problems).toEqual(['1 failed', 'Testing stopped early after 10 maximum allowed failures.']);
		expect(verdict.counts['not run']).toBe(1);
		expect(verdict.counts.skipped).toBe(0);
	});

	it('reports tests cut off by --global-timeout as not run rather than as skips', () => {
		const verdict = judge(
			report([passed, interrupted, notRun], [{ message: 'Timed out waiting 1500s for the test suite to run' }]),
			1,
		);
		expect(verdict.problems).toEqual(['Timed out waiting 1500s for the test suite to run', '2 did not run']);
		expect(verdict.counts).toMatchObject({ skipped: 0, 'not run': 2 });
	});

	it('fails a run in which nothing executed', () => {
		expect(judge(report([skipped, skipped]), 0).problems).toEqual(['no tests ran', '2 skipped']);
	});

	it('fails without a report, and on a non-zero exit the report does not explain', () => {
		expect(judge(undefined, 0).problems).toEqual(['Playwright produced no usable report']);
		expect(judge(report([passed]), 1).problems).toEqual(['Playwright exited 1']);
	});

	it('explains an unexpected pass of a test marked to fail', () => {
		const verdict = judge(report([playwrightTest('unexpected', [{ status: 'passed' }])]), 1);
		expect(verdict.outcomes[0].detail).toBe('passed, but was expected to fail');
	});

	it('titles tests by file, describe blocks and name', () => {
		const outcomes = collectOutcomes({
			suites: [{
				title: 'sign-in.anon.spec.ts',
				suites: [{
					title: 'sign-in page',
					specs: [{ title: 'renders', file: 'sign-in.anon.spec.ts', line: 12, tests: [passed] }],
				}],
			}],
		});
		expect(outcomes[0]).toMatchObject({
			title: 'sign-in.anon.spec.ts › sign-in page › renders',
			location: 'sign-in.anon.spec.ts:12',
		});
	});
});

describe('the job summary', () => {
	const context = {
		environment: 'dev',
		baseUrl: 'https://dev.example.test',
		version: 'dev_abc1234',
		sha: 'abc1234def5678',
		grepInvert: '@visual',
		project: '',
		durationMs: 61_000,
		playwrightVersion: '1.62.1',
	};

	it('leads with the verdict and gives a repro pinned to the deployed commit', () => {
		const markdown = renderSummary(judge(report([passed, failed]), 1), context);
		expect(markdown.split('\n')[0]).toBe('## ❌ E2E failed on dev — 1 failed');
		expect(markdown).toContain(
			'`dev_abc1234` on https://dev.example.test · commit `abc1234` · 1m01s · Playwright 1.62.1',
		);
		expect(markdown).toContain('git checkout abc1234def5678');
		expect(markdown).toContain(
			'PLAYWRIGHT_BASE_URL=https://dev.example.test pnpm exec playwright test --grep-invert "@visual"',
		);
	});

	it('keeps table cells intact when a message carries pipes or markup', () => {
		const odd = playwrightTest('unexpected', [{ status: 'failed', error: { message: 'Expected <div> | got </div>' } }]);
		expect(renderSummary(judge(report([odd]), 1), context)).toContain('Expected &lt;div> \\| got &lt;/div>');
	});

	it('caps each table and says how many rows it left out', () => {
		const markdown = renderSummary(judge(report(Array.from({ length: 53 }, () => failed)), 1), context);
		expect(markdown).toContain('### Failed (53)');
		expect(markdown).toContain('…and 3 more — see the job log.');
	});

	it('redacts the raw report before formatting, so escaping cannot turn a secret into a form that survives', () => {
		const secret = 'Qa|demo<Password!42';
		const leaky = playwrightTest('unexpected', [{
			status: 'failed',
			error: {
				message: `Timed out at https://dev.example.test/#/verify-email?token=verification-123456 with ${secret}`,
			},
		}]);
		const { markdown, headline } = composeReport(report([leaky]), 1, context, [secret]);
		expect(markdown).toContain('?token=[redacted] with [redacted]');
		expect(markdown).not.toContain('verification-123456');
		expect(markdown).not.toContain('demo');
		expect(headline).toBe('❌ E2E failed on dev — 1 failed');
	});

	it('redacts every string of a nested report and leaves other values alone', () => {
		expect(redactDeep({ a: ['x hunter22 y', 3], b: { c: 'hunter22' }, d: null }, ['hunter22'])).toEqual({
			a: ['x [redacted] y', 3],
			b: { c: '[redacted]' },
			d: null,
		});
	});

	it('redacts each secret and its URL-encoded form, and leaves short values alone', () => {
		const text = 'as qa@example.test, i.e. ?email=qa%40example.test, with pw hunter22 and id 42';
		expect(redact(text, ['qa@example.test', 'hunter22', '42', ''])).toBe(
			'as [redacted], i.e. ?email=[redacted], with pw [redacted] and id 42',
		);
	});
});
