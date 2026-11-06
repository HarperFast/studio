import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * A workflow that can mint a repository-write token, or that receives deployment credentials,
 * must not accept `merge_group`: that event runs the candidate PR's own workflow and action YAML,
 * so a boundary written in that YAML is not a boundary. See studio#1649.
 *
 * This is NOT a claim that no unmerged code can reach a credential. A same-repo `pull_request`
 * also runs the workflow definition from the PR's ref, with repository secrets available — only
 * fork PRs get a read-only token and no secrets. So anyone who can push a branch can already
 * read any secret a workflow references, with no approval gate at all. `pull_request` is
 * deliberately absent from the list below because adding it would fail `verify-pr.yaml`, whose
 * `pull-requests: write` is load-bearing; the fix for that class is scoping the credentials
 * (environment secrets with required reviewers, or org workflow-execution policy), tracked on
 * studio#1651 — not a list edit here.
 *
 * `actionlint` cannot check this — it never evaluates a workflow's event set against its job
 * permissions, and it skips composite action bodies entirely.
 *
 * This cannot compute GitHub's *effective* permissions, which depend on repo and org policy no
 * checkout can see. It deliberately errs privileged: an omitted `permissions:` block counts as
 * privileged, because this repo's `default_workflow_permissions` is `write`.
 */
const WORKFLOWS_DIR = join(import.meta.dirname, '../../.github/workflows');

const UNTRUSTED_REF_EVENTS = ['merge_group'];

type Job = { permissions?: unknown };

function triggers(doc: Record<string, unknown>): string[] {
	const on = doc.on;
	if (typeof on === 'string') { return [on]; }
	if (Array.isArray(on)) { return on as string[]; }
	return Object.keys((on ?? {}) as Record<string, unknown>);
}

function grantsWrite(permissions: unknown): boolean {
	// `write-all` is a bare string, not a map — the form most likely to slip past a map lookup.
	if (typeof permissions === 'string') { return permissions !== 'read-all' && permissions !== 'none'; }
	if (permissions && typeof permissions === 'object') {
		return Object.values(permissions as Record<string, string>).includes('write');
	}
	// Omitted: inherits the repo default, which is `write` here.
	return true;
}

function isPrivileged(doc: Record<string, unknown>, raw: string): boolean {
	const jobs = Object.values((doc.jobs ?? {}) as Record<string, Job>);
	const writes = jobs.some((job) => grantsWrite(job.permissions ?? doc.permissions));
	// The word anywhere, not `secrets.` or `secrets[`: whole-context forwarding (`${{ secrets }}`,
	// `toJSON(secrets)`, or an indirection through an action input) is a valid way to hand every
	// secret to a step. A match inside a comment only fails closed. An allowlist of sensitive
	// names would fail open, which is the direction that matters here.
	const takesSecrets = /\bsecrets\b/.test(raw);
	return writes || takesSecrets;
}

function workflowFiles() {
	return readdirSync(WORKFLOWS_DIR).filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'));
}

describe('workflow privilege boundary', () => {
	it('finds the workflows to check', () => {
		expect(workflowFiles().length).toBeGreaterThan(0);
	});

	it.each(workflowFiles())('%s does not expose privilege to an unmerged ref', (name) => {
		const raw = readFileSync(join(WORKFLOWS_DIR, name), 'utf8');
		const doc = parse(raw);
		if (!isPrivileged(doc, raw)) { return; }
		const declared = triggers(doc);
		for (const event of UNTRUSTED_REF_EVENTS) {
			expect(declared).not.toContain(event);
		}
	});

	// The scan above passes vacuously if triggers come back empty or nothing classifies as
	// privileged. These two pin both halves.
	it('still reads triggers, so an empty list cannot pass the scan silently', () => {
		const raw = readFileSync(join(WORKFLOWS_DIR, 'deploy-stage.yaml'), 'utf8');
		expect(triggers(parse(raw))).toContain('push');
	});

	// The merge queue is configured to require a check by name, and that string lives in repo
	// settings — nothing in the repo would notice a rename. A rename plus a required check is a
	// silently stalled queue, so pin it here.
	it('keeps the merge-queue job named `Verify Stage`, which repo settings require by name', () => {
		const doc = parse(readFileSync(join(WORKFLOWS_DIR, 'verify-stage.yaml'), 'utf8'));
		const jobs = (doc.jobs ?? {}) as Record<string, { name?: string }>;
		// The job itself, not "some job in this file called that" — a stub carrying the name
		// beside a renamed real job would satisfy the looser assertion and stall the queue.
		expect(jobs.verifyMergeGroup?.name).toBe('Verify Stage');
	});

	it('still recognises the stage workflow as privileged, so the scan cannot pass by finding nothing', () => {
		const raw = readFileSync(join(WORKFLOWS_DIR, 'deploy-stage.yaml'), 'utf8');
		expect(isPrivileged(parse(raw), raw)).toBe(true);
	});
});

/**
 * The cluster's trust policy pins `preview.yaml`'s path, not its content, and `harper preview setup`
 * checks the content only once. A `run:` step that executes the downloaded artifact is not caught.
 */
const FORK_GUARD = 'github.event.pull_request.head.repo.full_name == github.repository';

function isMapping(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether the guard is a term of the top-level `&&` chain, outside every parenthesis, so nothing
 * negates, quotes, wraps or bypasses it. A top-level `||`, an index expression or a second `${{ }}`
 * is refused outright.
 */
function hasForkGuard(condition: unknown): boolean {
	if (typeof condition !== 'string') { return false; }
	const expression = condition.trim().replace(/^\$\{\{([\s\S]*)\}\}$/, '$1')
		// String literals can hold `&&`, parentheses and the guard's own text.
		.replace(/'(?:[^']|'')*'/g, "''");
	if (/[{}[\]]/.test(expression)) { return false; }
	const terms: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < expression.length; index++) {
		const char = expression[index];
		if (char === '(') {
			depth++;
		} else if (char === ')') {
			if (--depth < 0) { return false; }
		} else if (depth === 0 && expression.startsWith('||', index)) {
			return false;
		} else if (depth === 0 && expression.startsWith('&&', index)) {
			terms.push(expression.slice(start, index));
			start = index + 2;
			index++;
		}
	}
	terms.push(expression.slice(start));
	return depth === 0 && terms.some((term) => term.replace(/\s+/g, ' ').trim() === FORK_GUARD);
}

// A shape this can't read is reported, not skipped, so it fails the test instead of passing it.
function pullRequestTargetProblems(doc: Record<string, unknown>): string[] {
	const problems: string[] = [];
	if (doc.jobs !== undefined && !isMapping(doc.jobs)) { return ['jobs: not a mapping']; }
	for (const [name, job] of Object.entries(doc.jobs ?? {})) {
		if (!isMapping(job)) {
			problems.push(`${name}: not a mapping`);
			continue;
		}
		if (!hasForkGuard(job.if)) { problems.push(`${name}: no fork guard`); }
		if (job.uses !== undefined) { problems.push(`${name}: calls a reusable workflow`); }
		const steps = job.steps ?? [];
		if (!Array.isArray(steps)) {
			problems.push(`${name}: steps is not a list`);
			continue;
		}
		for (const step of steps) {
			if (!isMapping(step)) {
				problems.push(`${name}: a step is not a mapping`);
				continue;
			}
			const uses = typeof step.uses === 'string' ? step.uses : '';
			if (uses.startsWith('actions/checkout@') || uses.startsWith('./')) {
				problems.push(`${name}: uses ${uses}`);
			}
		}
	}
	return problems;
}

describe('pull_request_target workflows run no PR code', () => {
	const targetWorkflows = workflowFiles().filter((name) =>
		triggers(parse(readFileSync(join(WORKFLOWS_DIR, name), 'utf8'))).includes('pull_request_target')
	);

	it('finds preview.yaml, so the scan cannot pass by finding nothing', () => {
		expect(targetWorkflows).toContain('preview.yaml');
	});

	it.each(targetWorkflows)('%s guards every job and checks out nothing', (name) => {
		expect(pullRequestTargetProblems(parse(readFileSync(join(WORKFLOWS_DIR, name), 'utf8')))).toEqual([]);
	});

	const job = (body: string) => `on: [pull_request_target]\njobs:\n  j:\n${body}`;
	const guarded = `    if: \${{ ${FORK_GUARD} }}\n`;

	it.each([
		['a job with no fork guard', job('    steps:\n      - run: echo hi\n')],
		// `&&` binds tighter, so this is `true || (… && guard)`, and its last term is the guard itself.
		['a guard that `||` can bypass', job(`    if: \${{ true || github.event.action != 'closed' && ${FORK_GUARD} }}\n`)],
		['a negated guard', job(`    if: \${{ !(${FORK_GUARD}) }}\n`)],
		['a guard inside a negated group', job(`    if: \${{ !(true && ${FORK_GUARD} && true) }}\n`)],
		['a guard inside a call', job(`    if: \${{ format('{0}', true && ${FORK_GUARD}) }}\n`)],
		['a guard inside an index', job(`    if: \${{ github.event[true && ${FORK_GUARD} && true] }}\n`)],
		['unbalanced parentheses', job(`    if: \${{ ${FORK_GUARD} && (true }}\n`)],
		['a parenthesis closed before it opens', job(`    if: \${{ true) && (true && ${FORK_GUARD} }}\n`)],
		['a guard between two interpolations', job(`    if: \${{ false }} && ${FORK_GUARD} && \${{ false }}\n`)],
		['a guard inside a string', job(`    if: contains('x && ${FORK_GUARD} && y', 'z')\n`)],
		['a guard compared again', job(`    if: \${{ ${FORK_GUARD} == false }}\n`)],
		['a checkout', job(`${guarded}    steps:\n      - uses: actions/checkout@v7\n`)],
		['a local action', job(`${guarded}    steps:\n      - uses: ./.github/actions/studio-verify\n`)],
		['a reusable workflow', job(`${guarded}    uses: ./.github/workflows/x.yaml\n`)],
		['jobs that are not a mapping', 'on: [pull_request_target]\njobs: 1\n'],
		['a job that is not a mapping', job('')],
		['steps that are not a list', job(`${guarded}    steps:\n      uses: actions/checkout@v7\n`)],
		['a step that is not a mapping', job(`${guarded}    steps:\n      - actions/checkout@v7\n`)],
	])('flags %s', (_label, raw) => {
		expect(pullRequestTargetProblems(parse(raw))).not.toEqual([]);
	});

	it.each([
		['a bare guard', guarded],
		['a guard after `!=`', `    if: github.event.action != 'closed' && ${FORK_GUARD}\n`],
		[
			'a guard beside an `||` inside a call',
			`    if: ${FORK_GUARD} && contains(fromJSON(vars.LIST || '[]'), github.actor)\n`,
		],
		[
			'a guard split across lines',
			`    if: |-\n      true &&\n      ${FORK_GUARD.replace(' == ', '\n        ==  ')}\n`,
		],
	])('passes %s on a job that only calls a pinned action', (_label, condition) => {
		const raw = job(`${condition}    steps:\n      - uses: HarperFast/deploy-action@0000000\n`);
		expect(pullRequestTargetProblems(parse(raw))).toEqual([]);
	});
});

describe('isPrivileged recognises every privileged form', () => {
	const job = (body: string) => `on: [merge_group]\njobs:\n  j:\n${body}`;

	it.each([
		['explicit contents: write', job('    permissions:\n      contents: write\n')],
		['write-all as a bare string', job('    permissions: write-all\n')],
		['no permissions block at all', job('    runs-on: ubuntu-latest\n')],
		[
			'workflow-level write, job silent',
			`on: [merge_group]\npermissions:\n  contents: write\njobs:\n  j:\n    runs-on: x\n`,
		],
		[
			'a deploy secret by dot access',
			job('    permissions:\n      contents: read\n    steps:\n      - run: echo ${{ secrets.CLI_DEPLOY_TARGET }}\n'),
		],
		[
			'a deploy secret by bracket access',
			job(
				"    permissions:\n      contents: read\n    steps:\n      - run: echo ${{ secrets['HARPERDB_CLI_TARGET_PASSWORD'] }}\n",
			),
		],
		['secrets: inherit', job('    permissions:\n      contents: read\n    secrets: inherit\n')],
		[
			'whole-context forwarding, which a `secrets.`-only matcher missed',
			job(
				'    permissions:\n      contents: read\n    steps:\n      - uses: ./.github/actions/x\n        with:\n          blob: ${{ toJSON(secrets) }}\n',
			),
		],
		[
			'the Datadog key, which studio-deploy also consumes',
			job('    permissions:\n      contents: read\n    steps:\n      - run: echo ${{ secrets.DATADOG_API_KEY }}\n'),
		],
	])('flags %s', (_label, raw) => {
		expect(isPrivileged(parse(raw), raw)).toBe(true);
	});

	it.each([
		['read-only with no secrets', job('    permissions:\n      contents: read\n    steps:\n      - run: echo hi\n')],
		['read-all', job('    permissions: read-all\n')],
	])('does not flag %s', (_label, raw) => {
		expect(isPrivileged(parse(raw), raw)).toBe(false);
	});
});
