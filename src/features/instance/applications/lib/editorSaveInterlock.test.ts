/**
 * The save/rename interlock across tabs. Each tab is its own copy of the module with its own query
 * client, as a tab is; all of them share one lock manager, as the tabs of an origin do. Every case runs
 * against the fake that the jsdom suites use and against Node's own Web Locks, so the fake is held to
 * the real grant rules.
 */
import type { SetComponentFileRequest } from '@/integrations/api/instance/applications/setComponentFile';
import { FakeLockManager } from '@/test/fakeWebLocks';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Interlock = typeof import('@/features/instance/applications/lib/editorSaveInterlock');
interface Tab {
	interlock: Interlock;
	client: QueryClient;
}

async function openTab(): Promise<Tab> {
	vi.resetModules();
	return {
		interlock: await import('@/features/instance/applications/lib/editorSaveInterlock'),
		client: new QueryClient(),
	};
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>(done => {
		resolve = done;
	});
	return { promise, resolve };
}

/** An editor save in `tab`'s mutation cache, in flight until the returned function is called. */
function editorSaveInFlight({ interlock, client }: Tab, entityId: string) {
	const landed = deferred();
	void new MutationObserver<void, Error, SetComponentFileRequest>(client, {
		mutationKey: interlock.editorSaveKey,
		mutationFn: () => landed.promise,
	}).mutate({ entityId, project: 'app', file: 'a.js' } as SetComponentFileRequest);
	return landed.resolve;
}

type Locks = Pick<LockManager, 'request' | 'query'>;

// Node shares one lock manager across the worker threads vitest runs files on, so each test takes its
// names under a scope of its own, and a lock a failed test left held stalls nothing after it.
const nodeLocks = navigator.locks;
function scopedNodeLocks(): Locks {
	const scope = `${crypto.randomUUID()}:`;
	const mine = (locks: LockInfo[] = []) =>
		locks.filter(lock => lock.name?.startsWith(scope)).map(lock => ({ ...lock, name: lock.name!.slice(scope.length) }));
	return {
		request: (name: string, ...rest: unknown[]) => Reflect.apply(nodeLocks.request, nodeLocks, [scope + name, ...rest]),
		query: async () => {
			const { held, pending } = await nodeLocks.query();
			return { held: mine(held), pending: mine(pending) };
		},
	} as Locks;
}

describe.each([
	['an in-memory lock manager', () => new FakeLockManager() as unknown as Locks],
	["Node's Web Locks", scopedNodeLocks],
])('with %s', (_, createLocks) => {
	let locks: Locks;
	let tabA: Tab;
	let tabB: Tab;
	beforeEach(async () => {
		locks = createLocks();
		vi.stubGlobal('navigator', { locks });
		tabA = await openTab();
		tabB = await openTab();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const queued = async () => (await locks.query()).pending?.length ?? 0;
	const held = async () => ((await locks.query()).held ?? []).map(lock => `${lock.mode} ${lock.name}`).sort();
	const rename = async (tab: Tab, paths: string[]) =>
		(await tab.interlock.startRename(tab.client, 'ins-1', { paths }))!;

	it.each(['app/a.js', 'app/c.js'])(
		'holds a save of %s while another tab renames app/a.js to app/c.js, then sends it',
		async path => {
			const endRename = await rename(tabB, ['app/a.js', 'app/c.js']);
			const send = vi.fn(() => Promise.resolve('saved'));

			const saving = tabA.interlock.holdForSave('ins-1', path, send);
			await vi.waitFor(async () => expect(await queued()).toBe(1));

			expect(send).not.toHaveBeenCalled();
			endRename();
			await expect(saving).resolves.toBe('saved');
			expect(send).toHaveBeenCalledOnce();
		},
	);

	it.each(['app/a.js', 'app/c.js'])(
		'holds a rename of app/a.js to app/c.js while another tab saves %s, until the save lands',
		async path => {
			const landed = deferred();
			const saving = tabA.interlock.holdForSave('ins-1', path, () => landed.promise);
			await vi.waitFor(async () => expect(await held()).toHaveLength(2));

			let started = false;
			const starting = rename(tabB, ['app/a.js', 'app/c.js']).then(end => {
				started = true;
				return end;
			});
			await vi.waitFor(async () => expect(await queued()).toBe(1));

			expect(started).toBe(false);
			landed.resolve();
			await saving;
			(await starting)();
		},
	);

	it('lets a save of another file through during a rename', async () => {
		const endRename = await rename(tabB, ['app/a.js', 'app/c.js']);

		await expect(tabA.interlock.holdForSave('ins-1', 'app/b.js', () => Promise.resolve('saved'))).resolves.toBe(
			'saved',
		);
		endRename();
	});

	it('never holds saves for each other, in one file or two', async () => {
		const landed = deferred();
		const first = tabA.interlock.holdForSave('ins-1', 'app/a.js', () => landed.promise);

		await tabB.interlock.holdForSave('ins-1', 'app/a.js', () => Promise.resolve());
		await tabB.interlock.holdForSave('ins-1', 'app/b.js', () => Promise.resolve());
		landed.resolve();
		await first;
	});

	it('holds every save on the instance during a folder rename, and none on another instance', async () => {
		const endRename = (await tabB.interlock.startRename(tabB.client, 'ins-1', 'instance'))!;
		const send = vi.fn(() => Promise.resolve());

		const saving = tabA.interlock.holdForSave('ins-1', 'app/lib/never-listed.js', send);
		await tabA.interlock.holdForSave('ins-2', 'app/lib/x.js', () => Promise.resolve());
		await vi.waitFor(async () => expect(await queued()).toBe(1));

		expect(send).not.toHaveBeenCalled();
		endRename();
		await saving;
		expect(send).toHaveBeenCalledOnce();
	});

	it('finishes two renames of two files onto each other in two tabs, one after the other', async () => {
		const first = rename(tabA, ['app/a.js', 'app/c.js']);
		const second = rename(tabB, ['app/c.js', 'app/a.js']);

		(await first)();
		(await second)();
	}, 5_000);

	it("lets a failed save's file go, and sends it once", async () => {
		const send = vi.fn(() => Promise.reject(new Error('refused')));

		await expect(tabA.interlock.holdForSave('ins-1', 'app/a.js', send)).rejects.toThrow('refused');

		expect(send).toHaveBeenCalledOnce();
		(await rename(tabB, ['app/a.js', 'app/c.js']))();
		await vi.waitFor(async () => expect(await held()).toEqual([]));
	});

	it('names its locks by instance and path alone', async () => {
		const landed = deferred();
		const saving = tabA.interlock.holdForSave('ins-1', 'app/a.js', () => landed.promise);
		await vi.waitFor(async () => expect(await held()).toHaveLength(2));
		expect(await held()).toEqual(['shared Studio:EditorFile:ins-1:app/a.js', 'shared Studio:EditorFiles:ins-1']);
		landed.resolve();
		await saving;

		const endRename = await rename(tabB, ['app/c.js', 'app/b.js']);
		expect(await held()).toEqual([
			'exclusive Studio:EditorFile:ins-1:app/b.js',
			'exclusive Studio:EditorFile:ins-1:app/c.js',
			'shared Studio:EditorFiles:ins-1',
		]);
		endRename();
	});

	it("gives up a rename aborted while it waits for another tab's save, holding nothing", async () => {
		const landed = deferred();
		const saving = tabA.interlock.holdForSave('ins-1', 'app/a.js', () => landed.promise);
		await vi.waitFor(async () => expect(await held()).toHaveLength(2));
		const cancellation = new AbortController();
		const starting = tabB.interlock.startRename(
			tabB.client,
			'ins-1',
			{ paths: ['app/a.js', 'app/c.js'] },
			cancellation.signal,
		);
		await vi.waitFor(async () => expect(await queued()).toBe(1));
		const logged = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

		cancellation.abort();

		await expect(starting).resolves.toBeUndefined();
		expect(tabB.interlock.isRenaming(tabB.client, 'ins-1')).toBe(false);
		expect(logged).not.toHaveBeenCalled();
		logged.mockRestore();
		landed.resolve();
		await saving;
		(await rename(tabA, ['app/a.js', 'app/c.js']))();
	});

	it("marks a rename in its own tab at once, while it waits for another tab's save", async () => {
		const landed = deferred();
		const saving = tabB.interlock.holdForSave('ins-1', 'app/a.js', () => landed.promise);
		await vi.waitFor(async () => expect(await held()).toHaveLength(2));

		const starting = rename(tabA, ['app/a.js', 'app/c.js']);

		expect(tabA.interlock.isRenaming(tabA.client, 'ins-1')).toBe(true);
		expect(tabA.interlock.isRenaming(tabA.client, 'ins-2')).toBe(false);
		expect(tabB.interlock.isRenaming(tabB.client, 'ins-1')).toBe(false);
		landed.resolve();
		await saving;
		(await starting)();
		expect(tabA.interlock.isRenaming(tabA.client, 'ins-1')).toBe(false);
	});
});

describe('within one tab', () => {
	beforeEach(() => {
		vi.stubGlobal('navigator', { locks: new FakeLockManager() });
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('refuses a rename while an editor save is in flight on the instance, and marks nothing', async () => {
		const tab = await openTab();
		const land = editorSaveInFlight(tab, 'ins-1');

		expect(tab.interlock.startRename(tab.client, 'ins-1', 'instance')).toBeUndefined();
		expect(tab.interlock.isRenaming(tab.client, 'ins-1')).toBe(false);
		const endOther = await tab.interlock.startRename(tab.client, 'ins-2', { paths: ['app/a.js'] });
		expect(tab.interlock.isRenaming(tab.client, 'ins-2')).toBe(true);
		endOther!();
		land();
	});

	it('stays renaming until every rename it started ends', async () => {
		const tab = await openTab();
		const endFirst = (await tab.interlock.startRename(tab.client, 'ins-1', { paths: ['app/a.js'] }))!;
		const endSecond = (await tab.interlock.startRename(tab.client, 'ins-1', { paths: ['app/b.js'] }))!;

		endFirst();
		expect(tab.interlock.isRenaming(tab.client, 'ins-1')).toBe(true);
		endSecond();
		expect(tab.interlock.isRenaming(tab.client, 'ins-1')).toBe(false);
	});
});

describe('without Web Locks', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each([
		['an insecure context or an older browser', { locks: undefined }],
		['no navigator', undefined],
	])("falls back to the tab's own interlock in %s", async (_, navigatorStub) => {
		vi.stubGlobal('navigator', navigatorStub);
		const logged = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		const tabA = await openTab();
		const tabB = await openTab();

		const endRename = (await tabB.interlock.startRename(tabB.client, 'ins-1', { paths: ['app/a.js'] }))!;
		await expect(tabA.interlock.holdForSave('ins-1', 'app/a.js', () => Promise.resolve('saved'))).resolves.toBe(
			'saved',
		);

		expect(tabB.interlock.isRenaming(tabB.client, 'ins-1')).toBe(true);
		endRename();
		expect(tabB.interlock.isRenaming(tabB.client, 'ins-1')).toBe(false);
		await expect(tabB.interlock.startRename(tabB.client, 'ins-1', 'instance', AbortSignal.abort())).resolves
			.toBeUndefined();
		expect(tabB.interlock.isRenaming(tabB.client, 'ins-1')).toBe(false);
		editorSaveInFlight(tabA, 'ins-1');
		expect(tabA.interlock.startRename(tabA.client, 'ins-1', 'instance')).toBeUndefined();
		expect(logged).not.toHaveBeenCalled();
	});

	it.each([
		['refuses the request', () => Promise.reject(new DOMException('Access denied', 'SecurityError'))],
		[
			'throws',
			() => {
				throw new TypeError('locks unavailable');
			},
		],
	])('saves and renames once, without them, when Web Locks %s', async (_, request) => {
		vi.stubGlobal('navigator', { locks: { request } });
		const logged = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		const tab = await openTab();
		const send = vi.fn(() => Promise.resolve('saved'));

		await expect(tab.interlock.holdForSave('ins-1', 'app/a.js', send)).resolves.toBe('saved');
		expect(send).toHaveBeenCalledOnce();
		(await tab.interlock.startRename(tab.client, 'ins-1', 'instance'))!();
		expect(logged).toHaveBeenCalledTimes(2);
	});
});
