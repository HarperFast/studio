/**
 * An in-memory `navigator.locks` for jsdom, which has none. One instance stands for one origin: every
 * caller handed it shares its locks, as the tabs of an origin do.
 *
 * It follows the Web Locks spec's grant rules: each name has a FIFO queue, the request at its head is
 * granted when no lock of that name is held (exclusive) or none held is exclusive (shared), and granting
 * stops at the first request that can't be. So a shared request waits behind an exclusive one queued
 * before it. A lock is released when its callback's promise settles, before `request` settles with it.
 * An aborted `signal` takes a request out of its queue and rejects it with the signal's reason; once
 * granted, the signal no longer matters. `ifAvailable` and `steal` throw rather than being ignored.
 * `editorSaveInterlock.test.ts` holds it to Node's own Web Locks.
 */
export class FakeLockManager {
	readonly #held: HeldLock[] = [];
	readonly #queues = new Map<string, Request[]>();

	request<T>(name: string, callback: (lock: Lock | null) => T): Promise<Awaited<T>>;
	request<T>(name: string, options: LockOptions, callback: (lock: Lock | null) => T): Promise<Awaited<T>>;
	request<T>(
		name: string,
		optionsOrCallback: LockOptions | ((lock: Lock | null) => T),
		maybeCallback?: (lock: Lock | null) => T,
	): Promise<Awaited<T>> {
		const [options, callback] = typeof optionsOrCallback === 'function'
			? [{}, optionsOrCallback]
			: [optionsOrCallback, maybeCallback!];
		if (options.ifAvailable || options.steal) {
			throw new Error('FakeLockManager supports only `mode` and `signal`');
		}
		if (name.startsWith('-')) {
			return Promise.reject(new DOMException('Names starting with "-" are reserved.', 'NotSupportedError'));
		}
		const { signal } = options;
		if (signal?.aborted) {
			return Promise.reject(signal.reason);
		}
		return new Promise((resolve, reject) => {
			const queue = this.#queues.get(name) ?? [];
			this.#queues.set(name, queue);
			const request: Request = {
				name,
				mode: options.mode ?? 'exclusive',
				callback: callback as Request['callback'],
				resolve: resolve as Request['resolve'],
				reject,
			};
			queue.push(request);
			signal?.addEventListener('abort', () => {
				const waiting = this.#queues.get(name);
				const index = waiting?.indexOf(request) ?? -1;
				if (index >= 0) {
					waiting!.splice(index, 1);
					reject(signal.reason);
					this.#grant(name);
				}
			}, { once: true });
			this.#grant(name);
		});
	}

	query(): Promise<LockManagerSnapshot> {
		const info = ({ name, mode }: HeldLock) => ({ name, mode, clientId: 'fake' });
		return Promise.resolve({
			held: this.#held.map(info),
			pending: [...this.#queues.values()].flat().map(info),
		});
	}

	#grant(name: string) {
		const queue = this.#queues.get(name) ?? [];
		while (queue.length > 0) {
			const held = this.#held.filter(lock => lock.name === name);
			const request = queue[0];
			const grantable = request.mode === 'exclusive' ? held.length === 0 : held.every(lock => lock.mode === 'shared');
			if (!grantable) {
				break;
			}
			queue.shift();
			const lock = { name, mode: request.mode };
			this.#held.push(lock);
			// Browsers call back from a task, never during `request` itself.
			queueMicrotask(() => {
				let outcome: Promise<unknown>;
				try {
					outcome = Promise.resolve(request.callback(lock as Lock));
				} catch (error) {
					outcome = Promise.reject(error);
				}
				const release = () => {
					this.#held.splice(this.#held.indexOf(lock), 1);
					this.#grant(name);
				};
				outcome.then(
					value => {
						release();
						request.resolve(value);
					},
					(error: unknown) => {
						release();
						request.reject(error);
					},
				);
			});
		}
		if (queue.length === 0) {
			this.#queues.delete(name);
		}
	}
}

interface HeldLock {
	name: string;
	mode: LockMode;
}

interface Request {
	name: string;
	mode: LockMode;
	callback: (lock: Lock | null) => unknown;
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
}
