import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
	buildHandler,
	handlerExportName,
	handlerFileProblem,
	handlerModulePath,
	readAppJobs,
	removeJob,
	writeJob,
} from './jobsConfig';

const METRICS_APP = `# Metrics app
rest: true
jsResource:
  files: resources.js
scheduler:
  jobs:
    # pulls rates every 10 seconds
    - name: sync-rates
      interval: 10s # keep it short
      handler: ./jobs.js#syncRates
    - name: flaky-report
      cron: '* * * * *'
      timezone: America/New_York
      handler: ./jobs.js#flakyReport
`;

describe('readAppJobs', () => {
	it('reads each job with no problems when Harper would accept it', () => {
		const { jobs, problem, editable } = readAppJobs(METRICS_APP);
		expect(problem).toBeUndefined();
		expect(editable).toBe(true);
		expect(jobs).toEqual([
			{ index: 0, name: 'sync-rates', interval: '10s', handler: './jobs.js#syncRates', problem: undefined },
			{
				index: 1,
				name: 'flaky-report',
				cron: '* * * * *',
				timezone: 'America/New_York',
				handler: './jobs.js#flakyReport',
				problem: undefined,
			},
		]);
	});

	it('treats a missing file, a missing block and an all-commented jobs list as no jobs', () => {
		expect(readAppJobs(undefined)).toEqual({ jobs: [], editable: true });
		expect(readAppJobs('rest: true\n')).toEqual({ jobs: [], editable: true });
		expect(readAppJobs('scheduler:\n  jobs:\n  # - name: old\n')).toEqual({ jobs: [], editable: true });
	});

	it('refuses to edit a file that is not YAML, or whose jobs are not a list', () => {
		expect(readAppJobs('scheduler: [\n')).toMatchObject({
			editable: false,
			problem: expect.stringMatching(/valid YAML/),
		});
		expect(readAppJobs('scheduler:\n  jobs:\n    name: a\n')).toEqual({
			jobs: [],
			editable: false,
			problem: 'scheduler.jobs must be a list of jobs.',
		});
		expect(readAppJobs('scheduler: [legacy]\n')).toEqual({
			jobs: [],
			editable: false,
			problem: 'scheduler is a list, not a set of keys, so Studio can’t add jobs to it.',
		});
		expect(readAppJobs('scheduler: true\n')).toMatchObject({ editable: false });
		expect(readAppJobs('base: 1\nm:\n  <<: *missing\n')).toEqual({
			jobs: [],
			editable: false,
			problem: expect.stringMatching(/^Studio can’t read the file: Unresolved alias/),
		});
	});

	it.each([
		['- name: a\n      cron: "@daily"\n      handler: ./a.js\n      timeZone: UTC', /Unrecognized key\(s\): timeZone/],
		['- cron: "@daily"\n      handler: ./a.js', /needs a name/],
		['- name: a\n      handler: ./a.js', /exactly one of cron or interval/],
		['- name: a\n      cron: "@daily"\n      interval: 5m\n      handler: ./a.js', /exactly one of cron or interval/],
		['- name: a\n      cron: "@daily"', /needs a handler/],
		['- name: a\n      cron:\n      handler: ./a.js', /cron must be text, not empty/],
		['- name: a\n      cron: "0 0 30 2 *"\n      handler: ./a.js', /can never fire/],
		['- name: a\n      cron: "@daily"\n      timezone: Mars/Olympus\n      handler: ./a.js', /Unknown timezone/],
		['- name: a\n      interval: 5m\n      timezone: UTC\n      handler: ./a.js', /only applies to cron/],
		['- name: a\n      interval: 500ms\n      handler: ./a.js', /not a supported duration/],
		['- just-a-string', /must be a set of keys/],
	])('reports what Harper refuses in %j', (entry, problem) => {
		const [job] = readAppJobs(`scheduler:\n  jobs:\n    ${entry}\n`).jobs;
		expect(job.problem).toMatch(problem);
	});

	it('flags the second of two jobs with one name, as Harper does', () => {
		const { jobs } = readAppJobs(
			'scheduler:\n  jobs:\n    - { name: a, interval: 5m, handler: ./a.js }\n    - { name: a, interval: 6m, handler: ./a.js }\n',
		);
		expect(jobs[0].problem).toBeUndefined();
		expect(jobs[1].problem).toMatch(/already named "a"/);
	});
});

describe('writeJob', () => {
	it('changes a job in place and keeps every comment', () => {
		const next = writeJob(METRICS_APP, 0, {
			name: 'sync-rates',
			schedule: { interval: '15m' },
			handler: './jobs.js#syncRates',
		});
		expect(next).toContain('# Metrics app');
		expect(next).toContain('# pulls rates every 10 seconds');
		expect(next).toContain('interval: 15m # keep it short');
		expect(readAppJobs(next).jobs[0]).toMatchObject({ name: 'sync-rates', interval: '15m' });
		expect(readAppJobs(next).jobs[1]).toEqual(readAppJobs(METRICS_APP).jobs[1]);
	});

	it('switches a job from interval to cron in the documented key order, quoting the expression', () => {
		const next = writeJob(METRICS_APP, 0, {
			name: 'sync-rates',
			schedule: { cron: '@daily', timezone: 'Europe/Paris' },
			handler: './jobs.js#syncRates',
		});
		expect(next).toContain(
			"    - name: sync-rates\n      cron: '@daily'\n      timezone: Europe/Paris\n      handler: ./jobs.js#syncRates\n",
		);
		expect(next).not.toContain('interval');
	});

	it('drops a key Harper refuses, so the saved job loads', () => {
		const text =
			"scheduler:\n  jobs:\n    - name: a\n      cron: '@daily'\n      timeZone: UTC\n      handler: ./a.js\n";
		const next = writeJob(text, 0, { name: 'a', schedule: { cron: '@daily', timezone: 'UTC' }, handler: './a.js' });
		expect(next).not.toContain('timeZone');
		expect(readAppJobs(next).jobs[0]).toMatchObject({ timezone: 'UTC', problem: undefined });
	});

	it('drops the timezone when a cron job goes back to the server timezone', () => {
		const next = writeJob(METRICS_APP, 1, {
			name: 'flaky-report',
			schedule: { cron: '* * * * *' },
			handler: './jobs.js#flakyReport',
		});
		expect(readAppJobs(next).jobs[1].timezone).toBeUndefined();
		expect(next).not.toContain('America/New_York');
	});

	it('adds a job to the end of the list', () => {
		const next = writeJob(METRICS_APP, undefined, {
			name: 'nightly',
			schedule: { cron: '0 2 * * *' },
			handler: './jobs.js',
		});
		expect(readAppJobs(next).jobs.map((job) => job.name)).toEqual(['sync-rates', 'flaky-report', 'nightly']);
		expect(next).toContain("      cron: '0 2 * * *'\n");
	});

	it('writes a bare number of seconds as a number', () => {
		const next = writeJob(METRICS_APP, undefined, { name: 'n', schedule: { interval: 90 }, handler: './a.js' });
		expect(next).toContain('      interval: 90\n');
		expect(parse(next).scheduler.jobs[2].interval).toBe(90);
	});

	it('adds a scheduler block to a config without one, and keeps the rest of the file', () => {
		const next = writeJob('rest: true\nstatic:\n  files: web/**\n', undefined, {
			name: 'n',
			schedule: { interval: '5m' },
			handler: './a.js',
		});
		expect(parse(next)).toEqual({
			rest: true,
			static: { files: 'web/**' },
			scheduler: { jobs: [{ name: 'n', interval: '5m', handler: './a.js' }] },
		});
	});

	it("starts a new config file from Harper's defaults, so the app keeps loading what it loaded without one", () => {
		const next = writeJob(undefined, undefined, { name: 'n', schedule: { interval: '5m' }, handler: './a.js' });
		expect(parse(next)).toEqual({
			rest: true,
			graphqlSchema: { files: '*.graphql' },
			roles: { files: 'roles.yaml' },
			jsResource: { files: 'resources.js' },
			fastifyRoutes: { files: 'routes/*.js' },
			static: { files: 'web/**' },
			scheduler: { jobs: [{ name: 'n', interval: '5m', handler: './a.js' }] },
		});
	});

	it('keeps commented-out jobs when the list was empty', () => {
		const next = writeJob('scheduler:\n  jobs:\n  # - name: old\n', undefined, {
			name: 'n',
			schedule: { interval: '5m' },
			handler: './a.js',
		});
		expect(next).toContain('# - name: old');
		expect(readAppJobs(next).jobs.map((job) => job.name)).toEqual(['n']);
	});

	it('keeps a list written flush with its key that way', () => {
		const flush = 'scheduler:\n  jobs:\n  - name: a\n    interval: 5m\n    handler: ./a.js\n';
		const next = writeJob(flush, undefined, { name: 'b', schedule: { interval: '6m' }, handler: './b.js' });
		expect(next).toBe(`${flush}  - name: b\n    interval: 6m\n    handler: ./b.js\n`);
	});

	it('refuses to touch a file it cannot read', () => {
		const draft = { name: 'n', schedule: { interval: '5m' }, handler: './a.js' };
		expect(() => writeJob('scheduler: [\n', undefined, draft)).toThrow(/valid YAML/);
		expect(() => writeJob('scheduler:\n  jobs: nope\n', undefined, draft)).toThrow(/not a list/);
		expect(() => writeJob('scheduler: [legacy]\n', undefined, draft)).toThrow(/not a set of keys/);
		expect(writeJob('scheduler:\n', undefined, draft)).toContain('    - name: n\n');
	});
});

describe('removeJob', () => {
	it('removes one job and keeps the others', () => {
		const next = removeJob(METRICS_APP, 0);
		expect(readAppJobs(next).jobs.map((job) => job.name)).toEqual(['flaky-report']);
		expect(next).toContain('# Metrics app');
	});

	it('removes a scheduler block that held only the last job', () => {
		const next = removeJob('rest: true\nscheduler:\n  jobs:\n    - { name: a, interval: 5m, handler: ./a.js }\n', 0);
		expect(parse(next)).toEqual({ rest: true });
	});
});

describe('handlers', () => {
	it.each([
		['./jobs.ts#syncRates', 'jobs.ts', 'syncRates'],
		['jobs.ts', 'jobs.ts', 'default'],
		['./lib/../jobs/run.js#go', 'jobs/run.js', 'go'],
		['/abs/jobs.js#go', undefined, 'go'],
		['../outside.js', undefined, 'default'],
	])('%j resolves to %j and export %j', (handler, path, exportName) => {
		expect(handlerModulePath(handler)).toBe(path);
		expect(handlerExportName(handler)).toBe(exportName);
	});

	it('builds the reference Harper expects', () => {
		expect(buildHandler('jobs.ts', 'syncRates')).toBe('./jobs.ts#syncRates');
		expect(buildHandler('jobs.ts', 'default')).toBe('./jobs.ts');
	});

	it('flags a handler whose file is not in the app, and leaves paths it cannot judge alone', () => {
		const files = new Set(['jobs.js', 'lib/util.js']);
		expect(handlerFileProblem('./jobs.js#a', files)).toBeUndefined();
		expect(handlerFileProblem('./lib/util.js', files)).toBeUndefined();
		expect(handlerFileProblem('./job.js#a', files)).toMatch(/no file at \.\/job\.js/);
		expect(handlerFileProblem('/srv/jobs.js', files)).toBeUndefined();
	});
});
