/**
 * The two halves of the post-deploy e2e check that are not Playwright itself:
 *
 *   node postDeploy.ts wait     block until BASE_URL serves EXPECTED_VERSION
 *   node postDeploy.ts report   judge RESULTS_FILE, write the job summary, exit non-zero on red
 *
 * Self-contained on purpose — Node runs it by type stripping, which cannot resolve this repo's
 * extensionless imports.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

type Annotation = { type: string; description?: string };
type TestError = { message?: string };
type TestResult = { status: string; error?: TestError };
type ReportTest = { projectName: string; status: string; annotations?: Annotation[]; results: TestResult[] };
type ReportSpec = { title: string; file: string; line: number; tests: ReportTest[] };
type ReportSuite = { title: string; specs?: ReportSpec[]; suites?: ReportSuite[] };

export type PlaywrightReport = {
	config?: { version?: string };
	suites?: ReportSuite[];
	errors?: TestError[];
	stats?: { duration?: number };
};

export type OutcomeStatus = 'passed' | 'failed' | 'flaky' | 'skipped' | 'not run';

export type TestOutcome = {
	title: string;
	location: string;
	project: string;
	status: OutcomeStatus;
	detail: string;
};

export type Verdict = {
	ok: boolean;
	problems: string[];
	counts: Record<OutcomeStatus, number>;
	outcomes: TestOutcome[];
};

export type Observation = { matches: boolean; detail: string };

/** The run's own secrets, stripped from everything it publishes (the repo is public). */
const SECRET_ENV = ['PLAYWRIGHT_USER_EMAIL', 'PLAYWRIGHT_USER_PASSWORD', 'MAILOSAUR_API_KEY'];
const ENTRY_CHUNK = /(?:\.?\/)?assets\/index-[\w-]+\.js/;
const VERSION_MARKER = /(?<![\w.-])(?:(?:dev|stage|prod)_[0-9a-f]{7,40}|v\d+\.\d+\.\d+)(?![\w.-])/;
const MAX_ROWS = 50;
const ANSI_COLOR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export function findEntryChunk(html: string): string | undefined {
	const match = ENTRY_CHUNK.exec(html);
	return match ? `/${match[0].replace(/^\.?\//, '')}` : undefined;
}

/** Delimited, not a substring test: `v2.18.3` must not match a bundle that says `v2.18.30`. */
export function servesVersion(bundle: string, version: string): boolean {
	const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(?<![\\w.-])${escaped}(?![\\w.-])`).test(bundle);
}

export function advertisedVersion(bundle: string): string | undefined {
	return VERSION_MARKER.exec(bundle)?.[0];
}

export async function observeDeployment(
	baseUrl: string,
	version: string,
	fetchImpl: typeof fetch = fetch,
): Promise<Observation> {
	try {
		const page = await fetchImpl(`${baseUrl}/?e2e-deploy-check=${Date.now()}`, {
			headers: { 'cache-control': 'no-cache' },
			signal: AbortSignal.timeout(15_000),
		});
		if (!page.ok) { return { matches: false, detail: `GET / answered ${page.status}` }; }
		const entry = findEntryChunk(await page.text());
		if (!entry) { return { matches: false, detail: 'index.html references no assets/index-*.js' }; }
		const chunk = await fetchImpl(`${baseUrl}${entry}`, { signal: AbortSignal.timeout(30_000) });
		if (!chunk.ok) { return { matches: false, detail: `GET ${entry} answered ${chunk.status}` }; }
		const bundle = await chunk.text();
		if (servesVersion(bundle, version)) { return { matches: true, detail: `${entry} serves ${version}` }; }
		return { matches: false, detail: `${entry} serves ${advertisedVersion(bundle) ?? 'no recognizable version'}` };
	} catch (error) {
		return { matches: false, detail: `request failed: ${error instanceof Error ? error.message : String(error)}` };
	}
}

/**
 * A CM deploys `replicated=true` behind a load balancer, so one matching response can come from the
 * one node that has the new build. Only `required` matches in a row count as live.
 */
export async function waitForVersion({
	observe,
	timeoutMs,
	intervalMs = 10_000,
	required = 3,
	now = Date.now,
	sleepImpl = sleep,
	log = () => {},
}: {
	observe: () => Promise<Observation>;
	timeoutMs: number;
	intervalMs?: number;
	required?: number;
	now?: () => number;
	sleepImpl?: (ms: number) => Promise<unknown>;
	log?: (line: string) => void;
}): Promise<{ ok: boolean; lastSeen: string; checks: number }> {
	const deadline = now() + timeoutMs;
	let consecutive = 0;
	let checks = 0;
	for (;;) {
		const { matches, detail } = await observe();
		checks += 1;
		consecutive = matches ? consecutive + 1 : 0;
		log(`[deploy-check] ${matches ? `${consecutive}/${required}` : 'waiting'} — ${detail}`);
		if (consecutive >= required) { return { ok: true, lastSeen: detail, checks }; }
		if (now() + intervalMs > deadline) { return { ok: false, lastSeen: detail, checks }; }
		await sleepImpl(intervalMs);
	}
}

function firstLines(message: string | undefined): string {
	if (!message) { return ''; }
	const lines = message
		.replace(ANSI_COLOR, '')
		.split('\n')
		.map((line) => line.trim().replace(/^- /, ''))
		.filter((line) => line && line !== 'Call log:');
	return lines.slice(0, 2).join(' — ');
}

function toOutcome(title: string, location: string, test: ReportTest): TestOutcome {
	const base = { title, location, project: test.projectName };
	const errors = test.results.filter((result) => result.error);
	switch (test.status) {
		case 'expected':
			return { ...base, status: 'passed', detail: '' };
		case 'flaky':
			return { ...base, status: 'flaky', detail: firstLines(errors[0]?.error?.message) };
		case 'unexpected':
			return {
				...base,
				status: 'failed',
				detail: firstLines(errors.at(-1)?.error?.message) || 'passed, but was expected to fail',
			};
		default:
			// A test cut off by --max-failures is reported as skipped with no results at all.
			if (test.results.length === 0) { return { ...base, status: 'not run', detail: '' }; }
			return {
				...base,
				status: 'skipped',
				detail: test.annotations?.find((note) => note.type === 'skip')?.description ?? 'skipped without a reason',
			};
	}
}

export function collectOutcomes(report: PlaywrightReport): TestOutcome[] {
	const outcomes: TestOutcome[] = [];
	const visit = (suite: ReportSuite, path: string[]) => {
		for (const spec of suite.specs ?? []) {
			for (const test of spec.tests) {
				outcomes.push(toOutcome([...path, spec.title].join(' › '), `${spec.file}:${spec.line}`, test));
			}
		}
		for (const child of suite.suites ?? []) { visit(child, [...path, child.title]); }
	};
	for (const suite of report.suites ?? []) { visit(suite, [suite.title]); }
	return outcomes;
}

/**
 * Stricter than Playwright's exit code, which is 0 when every test skipped. A skip here means a
 * prerequisite the run was given stopped working (e2e/README.md, "Skips are deliberate"), so it
 * fails the check — the same floor as the harness's trusted lane.
 */
export function judge(report: PlaywrightReport | undefined, playwrightExit: number): Verdict {
	const counts: Record<OutcomeStatus, number> = { passed: 0, failed: 0, flaky: 0, skipped: 0, 'not run': 0 };
	if (!report?.stats) {
		return { ok: false, problems: ['Playwright produced no usable report'], counts, outcomes: [] };
	}
	const outcomes = collectOutcomes(report);
	for (const outcome of outcomes) { counts[outcome.status] += 1; }
	const problems: string[] = [];
	if (counts.failed) { problems.push(`${counts.failed} failed`); }
	for (const error of report.errors ?? []) {
		const line = firstLines(error.message);
		if (line) { problems.push(line); }
	}
	if (counts.passed + counts.failed + counts.flaky === 0) { problems.push('no tests ran'); }
	if (counts.skipped) { problems.push(`${counts.skipped} skipped`); }
	if (counts['not run'] && !counts.failed) { problems.push(`${counts['not run']} did not run`); }
	if (playwrightExit !== 0 && problems.length === 0) { problems.push(`Playwright exited ${playwrightExit}`); }
	return { ok: problems.length === 0, problems, counts, outcomes };
}

export function redact(text: string, secrets: readonly string[]): string {
	let result = text;
	for (const secret of secrets) {
		if (secret.length < 4) { continue; }
		for (const form of new Set([secret, encodeURIComponent(secret)])) {
			result = result.split(form).join('[redacted]');
		}
	}
	return result;
}

function cell(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	const clipped = flat.length > 300 ? `${flat.slice(0, 299)}…` : flat;
	return clipped.replace(/\|/g, '\\|').replace(/</g, '&lt;');
}

export type SummaryContext = {
	environment: string;
	baseUrl: string;
	version: string;
	sha: string;
	grepInvert: string;
	project: string;
	durationMs?: number;
	playwrightVersion?: string;
};

function formatDuration(ms: number): string {
	const seconds = Math.round(ms / 1000);
	return seconds >= 60 ? `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`;
}

export function headline(verdict: Verdict, environment: string): string {
	const { passed, flaky } = verdict.counts;
	if (verdict.ok) {
		return `✅ E2E passed on ${environment} — ${passed} passed${flaky ? `, ${flaky} flaky` : ''}`;
	}
	return `❌ E2E failed on ${environment} — ${verdict.problems.join('; ')}`;
}

function table(title: string, rows: TestOutcome[], detailHeader: string): string[] {
	if (rows.length === 0) { return []; }
	const shown = rows.slice(0, MAX_ROWS);
	return [
		`### ${title} (${rows.length})`,
		'',
		`| test | project | where | ${detailHeader} |`,
		'|---|---|---|---|',
		...shown.map((row) => `| ${cell(row.title)} | ${row.project} | ${cell(row.location)} | ${cell(row.detail)} |`),
		...(rows.length > shown.length ? ['', `…and ${rows.length - shown.length} more — see the job log.`] : []),
		'',
	];
}

export function renderSummary(verdict: Verdict, context: SummaryContext): string {
	const { counts, outcomes } = verdict;
	const byStatus = (status: OutcomeStatus) => outcomes.filter((outcome) => outcome.status === status);
	const facts = [
		`\`${context.version}\` on ${context.baseUrl}`,
		context.sha && `commit \`${context.sha.slice(0, 7)}\``,
		context.durationMs !== undefined && formatDuration(context.durationMs),
		context.playwrightVersion && `Playwright ${context.playwrightVersion}`,
	].filter(Boolean);
	const selection = [
		context.project && `--project=${context.project}`,
		context.grepInvert && `--grep-invert "${context.grepInvert}"`,
	].filter(Boolean).join(' ');
	return [
		`## ${headline(verdict, context.environment)}`,
		'',
		facts.join(' · '),
		'',
		'| passed | failed | flaky | skipped | not run |',
		'|---:|---:|---:|---:|---:|',
		`| ${counts.passed} | ${counts.failed} | ${counts.flaky} | ${counts.skipped} | ${counts['not run']} |`,
		'',
		...table('Failed', byStatus('failed'), 'error'),
		...table('Flaky — passed on retry', byStatus('flaky'), 'first failure'),
		...table('Skipped', byStatus('skipped'), 'reason'),
		...(counts['not run'] ? [`${counts['not run']} tests did not run: the run stopped early.`, ''] : []),
		'<details><summary>Reproduce locally</summary>',
		'',
		'```bash',
		...(context.sha ? [`git checkout ${context.sha}`] : []),
		`cd e2e && pnpm install && pnpm install:browser`,
		`PLAYWRIGHT_BASE_URL=${context.baseUrl} pnpm exec playwright test ${selection}`.trimEnd(),
		'```',
		'',
		'Authed and round-trip specs also need the test account and Mailosaur settings in `e2e/.env.e2e`. No trace,',
		'video or screenshot is uploaded: this repository is public, and a trace records the session cookie.',
		'</details>',
		'',
	].join('\n');
}

function escapeData(text: string): string {
	return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function annotate(level: 'error' | 'warning', title: string, message: string): void {
	const property = escapeData(title).replace(/:/g, '%3A').replace(/,/g, '%2C');
	console.log(`::${level} title=${property}::${escapeData(message)}`);
}

function publish(markdown: string): void {
	const summaryFile = process.env.GITHUB_STEP_SUMMARY;
	if (summaryFile) { appendFileSync(summaryFile, `${markdown}\n`); }
	else { console.log(markdown); }
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) { throw new Error(`${name} is required`); }
	return value;
}

function readReport(file: string): PlaywrightReport | undefined {
	try {
		return JSON.parse(readFileSync(file, 'utf8')) as PlaywrightReport;
	} catch {
		return undefined;
	}
}

async function waitCommand(): Promise<number> {
	const baseUrl = requiredEnv('BASE_URL').replace(/\/+$/, '');
	const version = requiredEnv('EXPECTED_VERSION');
	const timeoutSeconds = Number(process.env.TIMEOUT_SECONDS || 600);
	const result = await waitForVersion({
		observe: () => observeDeployment(baseUrl, version),
		timeoutMs: timeoutSeconds * 1000,
		log: (line) => console.log(line),
	});
	if (result.ok) { return 0; }
	const message = `${baseUrl} did not serve ${version} within ${timeoutSeconds}s (${result.checks} checks). `
		+ `Last check: ${result.lastSeen}. The e2e suite did not run.`;
	annotate('error', 'Deploy did not land', message);
	publish(`## ❌ ${version} never went live on ${baseUrl}\n\n${message}\n`);
	return 1;
}

function reportCommand(): number {
	const report = readReport(process.env.RESULTS_FILE || 'e2e/results/results.json');
	const verdict = judge(report, Number(process.env.PLAYWRIGHT_EXIT || 1));
	const environment = process.env.ENVIRONMENT || 'the target';
	const secrets = SECRET_ENV.map((name) => process.env[name] ?? '');
	publish(redact(
		renderSummary(verdict, {
			environment,
			baseUrl: process.env.BASE_URL ?? '',
			version: process.env.EXPECTED_VERSION ?? '',
			sha: process.env.GITHUB_SHA ?? '',
			grepInvert: process.env.GREP_INVERT ?? '',
			project: process.env.PROJECT ?? '',
			durationMs: report?.stats?.duration,
			playwrightVersion: report?.config?.version,
		}),
		secrets,
	));
	console.log(redact(headline(verdict, environment), secrets));
	if (!verdict.ok) { annotate('error', `E2E failed on ${environment}`, redact(verdict.problems.join('; '), secrets)); }
	else if (verdict.counts.flaky) {
		annotate('warning', `Flaky e2e on ${environment}`, `${verdict.counts.flaky} passed only on retry`);
	}
	return verdict.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const command = process.argv[2];
	if (command === 'wait') { process.exitCode = await waitCommand(); }
	else if (command === 'report') { process.exitCode = reportCommand(); }
	else {
		console.error('usage: node postDeploy.ts wait|report');
		process.exitCode = 2;
	}
}
