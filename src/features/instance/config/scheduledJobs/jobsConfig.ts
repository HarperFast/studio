import { Document, isAlias, isMap, isScalar, isSeq, Pair, parseDocument, Scalar, visit, YAMLMap, YAMLSeq } from 'yaml';
import { cronProblem, intervalProblem, timezoneProblem } from './schedule';

/** The files Harper reads an app's config from, in the order it looks (harper `components/componentLoader.ts`). */
export const APP_CONFIG_FILES = ['harper-config.yaml', 'harperdb-config.yaml', 'config.yaml'] as const;

/**
 * What Harper loads for an app with none of {@link APP_CONFIG_FILES} (harper `components/DEFAULT_CONFIG.ts`). A config
 * file Studio creates starts from it, so adding a job doesn't switch off the app's REST, schema or static files.
 */
const DEFAULT_APP_CONFIG = {
	rest: true,
	graphqlSchema: { files: '*.graphql' },
	roles: { files: 'roles.yaml' },
	jsResource: { files: 'resources.js' },
	fastifyRoutes: { files: 'routes/*.js' },
	static: { files: 'web/**' },
};

const KNOWN_JOB_KEYS = new Set(['name', 'cron', 'interval', 'timezone', 'handler']);
const KEY_ORDER = ['name', 'cron', 'interval', 'timezone', 'handler'];

export interface ScheduledJobConfig {
	/** Its position in `scheduler.jobs`, which is how an edit finds it again. */
	index: number;
	name?: string;
	cron?: string;
	interval?: string | number;
	timezone?: string;
	handler?: string;
	/** The first thing Harper refuses about this entry, checked in Harper's order. Any one stops the app loading. */
	problem?: string;
}

export interface AppJobsConfig {
	jobs: ScheduledJobConfig[];
	/** Why Harper refuses the whole block, or why Studio can't read the file. */
	problem?: string;
	/** Whether Studio can rewrite the file: it parses, and `scheduler.jobs` is missing, empty or a list. */
	editable: boolean;
}

function describeValue(value: unknown): string {
	return value === null ? 'empty' : Array.isArray(value) ? 'a list' : `a ${typeof value}`;
}

/** Harper's checks in `resources/scheduler/scheduler.ts` `buildJob`, except loading the handler. */
function entryProblem(entry: unknown): string | undefined {
	if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
		return 'Each job must be a set of keys (name, cron or interval, handler).';
	}
	const job = entry as Record<string, unknown>;
	const unknownKeys = Object.keys(job).filter((key) => !KNOWN_JOB_KEYS.has(key));
	if (unknownKeys.length > 0) {
		return `Unrecognized key(s): ${unknownKeys.join(', ')}. Allowed: name, cron, interval, timezone, handler.`;
	}
	if (typeof job.name !== 'string' || job.name.length === 0) {
		return 'Every job needs a name.';
	}
	if ((job.cron === undefined) === (job.interval === undefined)) {
		return 'A job needs exactly one of cron or interval.';
	}
	if (typeof job.handler !== 'string' || job.handler.length === 0) {
		return 'A job needs a handler, like ./jobs.ts#myExport.';
	}
	if (job.handler.startsWith('#') || job.handler.endsWith('#')) {
		return 'A handler needs a file, and an export name after # if it has one, like ./jobs.ts#myExport.';
	}
	if (job.cron !== undefined) {
		if (typeof job.cron !== 'string') {
			return `cron must be text, not ${describeValue(job.cron)}.`;
		}
		const problem = cronProblem(job.cron);
		if (problem) {
			return problem;
		}
		if (job.timezone !== undefined) {
			if (typeof job.timezone !== 'string') {
				return 'timezone must be an IANA timezone name, like America/New_York.';
			}
			return timezoneProblem(job.timezone);
		}
		return undefined;
	}
	if (job.timezone !== undefined) {
		return 'timezone only applies to cron schedules.';
	}
	return intervalProblem(job.interval);
}

function asJob(entry: unknown, index: number): ScheduledJobConfig {
	const job: ScheduledJobConfig = { index, problem: entryProblem(entry) };
	if (typeof entry === 'object' && entry !== null) {
		const { name, cron, interval, timezone, handler } = entry as Record<string, unknown>;
		job.name = typeof name === 'string' ? name : undefined;
		job.cron = typeof cron === 'string' ? cron : undefined;
		job.interval = typeof interval === 'string' || typeof interval === 'number' ? interval : undefined;
		job.timezone = typeof timezone === 'string' ? timezone : undefined;
		job.handler = typeof handler === 'string' ? handler : undefined;
	}
	return job;
}

/**
 * The jobs an app's config file declares, read the way Harper reads them: the plugin's `jobs` key, where an absent or
 * empty one is no jobs (YAML reads "all commented out" as `jobs: null`).
 */
export function readAppJobs(text: string | undefined): AppJobsConfig {
	if (text === undefined) {
		return { jobs: [], editable: true };
	}
	const doc = parseDocument(text);
	if (doc.errors.length > 0) {
		return { jobs: [], editable: false, problem: `The file isn't valid YAML: ${doc.errors[0].message}` };
	}
	let config: Record<string, unknown> | null;
	try {
		config = doc.toJSON() as Record<string, unknown> | null;
	} catch (error) {
		// An alias whose anchor is never set (`<<: *missing`) parses without errors, then throws here.
		return { jobs: [], editable: false, problem: `Studio can’t read the file: ${(error as Error).message}` };
	}
	if (config !== null && (typeof config !== 'object' || Array.isArray(config))) {
		return {
			jobs: [],
			editable: false,
			problem: `The file is ${describeValue(config)}, not a set of keys, so Studio can’t add jobs to it.`,
		};
	}
	const read = readSchedulerValue(config?.scheduler);
	// The data reads through an alias or anchor anywhere under `scheduler`, but an edit works on the nodes: it would
	// rewrite the alias itself, or change whatever else shares the anchor.
	const schedulerNode: unknown = doc.get('scheduler', true);
	let aliased = isAlias(schedulerNode);
	if (!aliased && (isMap(schedulerNode) || isSeq(schedulerNode) || isScalar(schedulerNode))) {
		visit(schedulerNode, {
			Node(_key, node) {
				if (isAlias(node) || (node as { anchor?: string }).anchor) {
					aliased = true;
					return visit.BREAK;
				}
				return undefined;
			},
		});
	}
	return aliased
		? {
			...read,
			editable: false,
			problem: read.problem ?? 'The jobs come through a YAML alias (*name), so Studio can’t change them in place.',
		}
		: read;
}

function readSchedulerValue(scheduler: unknown): AppJobsConfig {
	if (scheduler == null) {
		return { jobs: [], editable: true };
	}
	if (typeof scheduler !== 'object' || Array.isArray(scheduler)) {
		return {
			jobs: [],
			editable: false,
			problem: `scheduler is ${describeValue(scheduler)}, not a set of keys, so Studio can’t add jobs to it.`,
		};
	}
	const jobs = (scheduler as Record<string, unknown>).jobs;
	if (jobs == null) {
		return { jobs: [], editable: true };
	}
	if (!Array.isArray(jobs)) {
		return { jobs: [], editable: false, problem: 'scheduler.jobs must be a list of jobs.' };
	}
	const seen = new Set<string>();
	return {
		editable: true,
		jobs: jobs.map((entry, index) => {
			const job = asJob(entry, index);
			// A broken job's name still counts: once it's fixed, Harper refuses the later one.
			if (job.name) {
				if (!job.problem && seen.has(job.name)) {
					job.problem = `Another job in this app is already named "${job.name}".`;
				}
				seen.add(job.name);
			}
			return job;
		}),
	};
}

type JobSchedule = { cron: string; timezone?: string } | { interval: string | number };

export interface JobDraft {
	name: string;
	schedule: JobSchedule;
	handler: string;
}

function scalar(value: string | number, quoted = false): Scalar {
	const node = new Scalar(value);
	if (quoted) {
		node.type = Scalar.QUOTE_SINGLE;
	}
	return node;
}

/**
 * Sets `key`, keeping the existing node (and so its comments) where there is one, and placing a new key where the docs
 * put it: name, cron or interval, timezone, handler.
 */
function setKey(map: YAMLMap, key: string, value: string | number | undefined, quoted = false) {
	const at = map.items.findIndex((pair) => (isScalar(pair.key) ? pair.key.value : pair.key) === key);
	if (value === undefined) {
		if (at >= 0) {
			map.items.splice(at, 1);
		}
		return;
	}
	if (at >= 0) {
		const existing = map.items[at].value;
		if (isScalar(existing)) {
			existing.value = value;
			if (quoted && existing.type !== Scalar.QUOTE_DOUBLE) {
				existing.type = Scalar.QUOTE_SINGLE;
			}
		} else {
			map.items[at].value = scalar(value, quoted);
		}
		return;
	}
	const rank = KEY_ORDER.indexOf(key);
	const before = map.items.findIndex((pair) => {
		const other = KEY_ORDER.indexOf(String(isScalar(pair.key) ? pair.key.value : pair.key));
		return other > rank;
	});
	const pair = new Pair(scalar(key), scalar(value, quoted));
	if (before < 0) {
		map.items.push(pair);
	} else {
		map.items.splice(before, 0, pair);
	}
}

/** Writes the form over the entry. A key Harper refuses, such as a misspelt `timeZone`, goes: the form replaces it. */
function writeDraft(map: YAMLMap, draft: JobDraft) {
	map.items = map.items.filter((pair) => KNOWN_JOB_KEYS.has(String(isScalar(pair.key) ? pair.key.value : pair.key)));
	setKey(map, 'name', draft.name);
	if ('cron' in draft.schedule) {
		setKey(map, 'interval', undefined);
		// Quoted, as the docs write it: a bare `*` or `@daily` would otherwise read as YAML syntax.
		setKey(map, 'cron', draft.schedule.cron, true);
		setKey(map, 'timezone', draft.schedule.timezone || undefined);
	} else {
		setKey(map, 'cron', undefined);
		setKey(map, 'timezone', undefined);
		setKey(map, 'interval', draft.schedule.interval);
	}
	setKey(map, 'handler', draft.handler);
}

/** `jobs:` written flush with its key (`- name` under `jobs`, not indented past it) stays that way. */
function indentsSequences(text: string): boolean {
	return !/^([ \t]*)[^\s#-][^\n]*:[ \t]*\r?\n\1- /m.test(text);
}

function openJobsList(text: string | undefined): { doc: Document; jobs: YAMLSeq; scheduler: YAMLMap } {
	// As a number, an integer past 2^53 would be written back rounded, wherever it is in the file.
	const doc = text === undefined ? new Document(DEFAULT_APP_CONFIG) : parseDocument(text, { intAsBigInt: true });
	if (doc.errors.length > 0) {
		throw new Error(`The config file isn't valid YAML: ${doc.errors[0].message}`);
	}
	if (isScalar(doc.contents) && doc.contents.value === null) {
		// `~` or `null` as the whole file reads as empty, like a blank one.
		doc.contents = new YAMLMap();
	} else if (doc.contents !== null && !isMap(doc.contents)) {
		throw new Error('The config file isn’t a set of keys, so Studio can’t add jobs to it.');
	}
	// An empty `{}` or `[]` is flow style, which would put everything added to it on one line.
	if (isMap(doc.contents) && doc.contents.items.length === 0) {
		doc.contents.flow = false;
	}
	let scheduler = doc.get('scheduler', true);
	if (!isMap(scheduler)) {
		if (scheduler !== undefined && !(isScalar(scheduler) && scheduler.value === null)) {
			throw new Error('scheduler is not a set of keys, so Studio can’t add jobs to it.');
		}
		scheduler = new YAMLMap();
		doc.set('scheduler', scheduler);
	}
	const schedulerMap = scheduler as YAMLMap;
	if (schedulerMap.items.length === 0) {
		schedulerMap.flow = false;
	}
	const existing: unknown = schedulerMap.get('jobs', true);
	if (isSeq(existing)) {
		if (existing.items.length === 0) {
			existing.flow = false;
		}
		return { doc, jobs: existing, scheduler: schedulerMap };
	}
	if (existing !== undefined && !(isScalar(existing) && existing.value === null)) {
		throw new Error('scheduler.jobs is not a list, so Studio can’t add to it.');
	}
	const jobs = new YAMLSeq();
	// `jobs:` with every entry commented out keeps those comments under the new list.
	if (isScalar(existing) && existing.comment) {
		jobs.comment = existing.comment;
	}
	schedulerMap.set('jobs', jobs);
	return { doc, jobs, scheduler: schedulerMap };
}

function serialize(doc: Document, text: string | undefined): string {
	return doc.toString({ lineWidth: 0, indentSeq: text === undefined || indentsSequences(text) });
}

export function writeJob(text: string | undefined, index: number | undefined, draft: JobDraft): string {
	const { doc, jobs } = openJobsList(text);
	if (index === undefined) {
		const map = new YAMLMap();
		writeDraft(map, draft);
		jobs.items.push(map);
	} else {
		const existing = jobs.items[index];
		if (!isMap(existing)) {
			const map = new YAMLMap();
			writeDraft(map, draft);
			jobs.items[index] = map;
		} else {
			writeDraft(existing, draft);
		}
	}
	return serialize(doc, text);
}

/** Removing the last job takes a `scheduler` block that held only it, too. */
export function removeJob(text: string, index: number): string {
	const { doc, jobs, scheduler } = openJobsList(text);
	jobs.items.splice(index, 1);
	if (jobs.items.length === 0 && !jobs.comment && scheduler.items.length === 1) {
		doc.delete('scheduler');
	}
	return serialize(doc, text);
}

export function handlerModulePath(handler: string): string | undefined {
	const hashIndex = handler.indexOf('#');
	const modulePath = hashIndex >= 0 ? handler.slice(0, hashIndex) : handler;
	if (modulePath.startsWith('/')) {
		return undefined;
	}
	const parts: string[] = [];
	for (const part of modulePath.split('/')) {
		if (part === '' || part === '.') {
			continue;
		}
		if (part === '..') {
			if (parts.length === 0) {
				return undefined;
			}
			parts.pop();
			continue;
		}
		parts.push(part);
	}
	return parts.length > 0 ? parts.join('/') : undefined;
}

function escapesApp(modulePath: string): boolean {
	let depth = 0;
	for (const part of modulePath.split('/')) {
		if (part === '..') {
			depth -= 1;
			if (depth < 0) {
				return true;
			}
		} else if (part !== '' && part !== '.') {
			depth += 1;
		}
	}
	return false;
}

export function handlerExportName(handler: string): string {
	const hashIndex = handler.indexOf('#');
	return hashIndex >= 0 ? handler.slice(hashIndex + 1) : 'default';
}

/** A handler's file as written when it is absolute or outside the app's folder, which Studio can't list or read. */
export function outsideModulePath(handler: string): string | undefined {
	const modulePath = handler.split('#')[0];
	return modulePath.startsWith('/') || escapesApp(modulePath) ? modulePath : undefined;
}

export function buildHandler(file: string, exportName: string): string {
	const modulePath = outsideModulePath(file) ?? `./${file}`;
	return exportName === 'default' ? modulePath : `${modulePath}#${exportName}`;
}

export function handlerFileProblem(handler: string, appFiles: ReadonlySet<string>): string | undefined {
	const path = handlerModulePath(handler);
	const modulePath = handler.split('#')[0];
	if (path === undefined && !modulePath.startsWith('/') && !escapesApp(modulePath)) {
		return `${modulePath || 'The handler'} is the app’s folder, not a file, so Harper can’t load the handler.`;
	}
	if (path === undefined || appFiles.has(path)) {
		return undefined;
	}
	return `This app has no file at ${handler.split('#')[0]}, so Harper can’t load the handler.`;
}
