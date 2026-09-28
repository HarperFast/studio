import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	advertisedVersions,
	annotationsFor,
	collectOutcomes,
	composeReport,
	findEntryChunk,
	judge,
	observeAll,
	observeDeployment,
	parseTimeoutSeconds,
	type PlaywrightReport,
	probeOrigins,
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

	it('probes the public origin and every replicated node by its own hostname', () => {
		expect(probeOrigins('https://stage.example.test')).toEqual(['https://stage.example.test']);
		expect(probeOrigins('https://stage.example.test', ' stage-2.example.test,stage-3.example.test,')).toEqual([
			'https://stage.example.test',
			'https://stage-2.example.test',
			'https://stage-3.example.test',
		]);
		expect(probeOrigins('https://stage.example.test', 'stage.example.test')).toEqual(['https://stage.example.test']);
	});

	it.each(['https://stage-2.example.test', 'stage-2.example.test/assets', 'stage-2'])(
		'refuses a node entry that is not a hostname: %s',
		(entry) => {
			expect(() => probeOrigins('https://stage.example.test', entry)).toThrow('not a hostname');
		},
	);

	it('fails the round while any node still serves the old build, and names it', async () => {
		const byHost = (versions: Record<string, string>): typeof fetch =>
			(async (input: string | URL | Request) => {
				const url = new URL(String(input));
				return url.pathname === '/'
					? new Response('<script src="/assets/index-A1.js"></script>')
					: new Response(`v=\`${versions[url.host]}\``);
			}) as typeof fetch;
		const origins = ['https://stage.example.test', 'https://stage-2.example.test'];
		const stale = await observeAll(
			origins,
			'v2.1.0',
			byHost({ 'stage.example.test': 'v2.1.0', 'stage-2.example.test': 'v2.0.9' }),
		);
		expect(stale).toEqual({
			matches: false,
			detail:
				'stage.example.test /assets/index-A1.js serves v2.1.0; stage-2.example.test /assets/index-A1.js serves v2.0.9',
		});
		const live = await observeAll(
			origins,
			'v2.1.0',
			byHost({ 'stage.example.test': 'v2.1.0', 'stage-2.example.test': 'v2.1.0' }),
		);
		expect(live.matches).toBe(true);
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
		expect(verdict.problems).toEqual([
			'1 failed',
			'Testing stopped early after 10 maximum allowed failures.',
			'1 did not run',
		]);
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
		const { markdown, headline, annotations } = composeReport(report([leaky]), 1, context, [secret]);
		expect(markdown).toContain('?token=[redacted] with [redacted]');
		expect(markdown).not.toContain('verification-123456');
		expect(markdown).not.toContain('demo');
		expect(headline).toBe('❌ E2E failed on dev — 1 failed');
		expect(annotations.join('\n')).not.toMatch(/verification-123456|demo/);
	});

	it('annotates the verdict first, then each failed test once, within GitHub’s 10-per-step budget', () => {
		const lines = annotationsFor(judge(report(Array.from({ length: 12 }, () => failed)), 1), 'dev');
		expect(lines).toHaveLength(9);
		expect(lines[0]).toBe('::error title=E2E failed on dev::12 failed');
		expect(lines[1]).toMatch(
			/^::error file=e2e\/tests\/a\.anon\.spec\.ts,line=1,title=a\.anon\.spec\.ts › case 0::TimeoutError/,
		);
	});

	it('escapes the separators GitHub reads inside annotation properties', () => {
		const titled: PlaywrightReport = {
			stats: {},
			suites: [{
				title: 'x.anon.spec.ts',
				specs: [{
					title: 'switches org, then signs out: fast',
					file: 'x.anon.spec.ts',
					line: 7,
					tests: [playwrightTest('unexpected', [{ status: 'failed', error: { message: '50% done\nnext' } }])],
				}],
			}],
		};
		expect(annotationsFor(judge(titled, 1), 'dev')[1]).toBe(
			'::error file=e2e/tests/x.anon.spec.ts,line=7,title=x.anon.spec.ts › switches org%2C then signs out%3A fast::50%25 done — next',
		);
	});

	it('keeps the annotation separator when a test title carries a credential-shaped parameter', () => {
		const titled: PlaywrightReport = {
			stats: {},
			suites: [{
				title: 'v.anon.spec.ts',
				specs: [{
					title: 'rejects /#/verify-email?token=expired',
					file: 'v.anon.spec.ts',
					line: 3,
					tests: [playwrightTest('unexpected', [{ status: 'failed', error: { message: 'boom' } }])],
				}],
			}],
		};
		const { annotations } = composeReport(titled, 1, context, []);
		expect(annotations[1]).toBe(
			'::error file=e2e/tests/v.anon.spec.ts,line=3,title=v.anon.spec.ts › rejects /#/verify-email?token=[redacted]::boom',
		);
	});

	it('warns once for a flaky pass and stays silent on a clean one', () => {
		const flaky = playwrightTest('flaky', [{ status: 'failed', error: { message: 'boom' } }, { status: 'passed' }]);
		expect(annotationsFor(judge(report([passed, flaky]), 0), 'dev')).toEqual([
			'::warning title=Flaky e2e on dev::1 passed only on retry',
		]);
		expect(annotationsFor(judge(report([passed]), 0), 'dev')).toEqual([]);
	});

	it('redacts a whole credential parameter, colons included, and leaves an already-redacted one alone', () => {
		const once = redact('open /#/verify-email?token=user:session123 then ?code=[redacted]::boom', []);
		expect(once).toBe('open /#/verify-email?token=[redacted] then ?code=[redacted]::boom');
		expect(redact(once, [])).toBe(once);
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

describe('peer discovery in studio-deploy', () => {
	const action = readFileSync(join(import.meta.dirname, '../../.github/actions/studio-deploy/action.yaml'), 'utf8');
	const program = action.match(/nodes=\$\(sed -n '([^']+)'/)?.[1] ?? '';
	const peers = (output: string) =>
		execFileSync('sed', ['-n', program], { input: output, encoding: 'utf8' }).split('\n').filter(Boolean).join(',');

	it('finds the sed program the deploy step runs', () => {
		expect(program).toContain('replicated:');
	});

	// Verbatim deploy_component output from the dev, stage and prod deploy logs of 2026-09-24/25/28.
	it.each([
		['a single node', 'message: "Successfully deployed: hdbms"\nreplicated: []\ndeployment_id: f485c522\n', ''],
		[
			'stage',
			'message: "Successfully deployed: hdbms"\nreplicated:\n  - message: "Successfully deployed: hdbms"\n    requestId: 1\n    node: stage-2.studio.harperfabric.com\ndeployment_id: dc037de3\n',
			'stage-2.studio.harperfabric.com',
		],
		[
			'prod, restarting',
			'message: "Successfully deployed: hdbms, restarting Harper"\nreplicated:\n  - message: "Successfully deployed: hdbms, restarting Harper"\n    requestId: 1\n    node: studio-2.harperfabric.com\ndeployment_id: de104c35\n',
			'studio-2.harperfabric.com',
		],
		[
			'two peers',
			'message: "ok"\nreplicated:\n  - message: "ok"\n    node: a-2.example.test\n  - message: "ok"\n    node: a-3.example.test\ndeployment_id: x\n',
			'a-2.example.test,a-3.example.test',
		],
	])('reads the replicated peers of %s', (_label, output, expected) => {
		expect(peers(output)).toBe(expected);
	});
});
