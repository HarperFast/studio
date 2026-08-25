import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * A workflow that can mint a repository-write token, or that receives deployment credentials,
 * must not accept an event whose SHA carries unmerged code. `merge_group` is the one such event
 * GitHub offers: it runs the candidate PR's own workflow and action YAML, so a boundary written
 * in that YAML is not a boundary. See studio#1649 and .github/deploying.md.
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
		if (!isPrivileged(parse(raw), raw)) { return; }
		for (const event of UNTRUSTED_REF_EVENTS) {
			expect(triggers(parse(raw))).not.toContain(event);
		}
	});

	// The scan above passes vacuously if triggers come back empty or nothing classifies as
	// privileged. These two pin both halves.
	it('still reads triggers, so an empty list cannot pass the scan silently', () => {
		const raw = readFileSync(join(WORKFLOWS_DIR, 'deploy-stage.yaml'), 'utf8');
		expect(triggers(parse(raw))).toContain('push');
	});

	it('still recognises the stage workflow as privileged, so the scan cannot pass by finding nothing', () => {
		const raw = readFileSync(join(WORKFLOWS_DIR, 'deploy-stage.yaml'), 'utf8');
		expect(isPrivileged(parse(raw), raw)).toBe(true);
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
