import { getSessionStorage } from '@/lib/storage/getSessionStorage';
import { SessionStorageKeys } from '@/lib/storage/sessionStorageKeys';
import { setSessionStorage } from '@/lib/storage/setSessionStorage';

// Every `useSessionStorage` on a key renders this one value; sessionStorage holds its persisted copy, and
// a value it refused stays here, its only copy, until a write lands or sign-out.
type Key = keyof SessionStorageKeys;

type Held = { value: unknown; state: 'stored' | 'default' | 'refused' };

const values = new Map<string, Held>();
const watchers = new Map<string, Set<() => void>>();

function notify(key: string): void {
	for (const onChange of watchers.get(key) ?? []) {
		onChange();
	}
}

// Persisting is best-effort: if a refused write (quota) left instances behind what the user typed, Save
// would send the older editor buffer while the editor still shows the newer text.
function hold(key: Key, value: unknown): void {
	let state: Held['state'] = 'stored';
	try {
		setSessionStorage(key, value);
	} catch (error) {
		state = 'refused';
		if (values.get(key)?.state !== 'refused') {
			console.warn('sessionStorage refused a write; keeping the value in memory only', error);
		}
	}
	values.set(key, { value, state });
}

function heldValue(key: Key, defaultValue: unknown): Held {
	let held = values.get(key);
	// A default nobody watches yet came from a render React may have thrown away; this reader's applies.
	if (!held || (held.state === 'default' && !watchers.has(key))) {
		const stored = getSessionStorage<unknown, Key>(key, undefined);
		const value = stored === undefined ? defaultValue : stored;
		held = { value, state: stored === undefined ? 'default' : 'stored' };
		values.set(key, held);
	}
	return held;
}

/** Keys whose value is held only here, because session storage refused it. */
export function refusedSessionKeys(): string[] {
	return [...values].filter(([, held]) => held.state === 'refused').map(([key]) => key);
}

export function readSessionValue<T>(key: Key, defaultValue: T): T {
	return heldValue(key, defaultValue).value as T;
}

export function writeSessionValue<T>(key: Key, defaultValue: T, next: T | ((previous: T) => T)): void {
	const previous = readSessionValue(key, defaultValue);
	const value = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
	if (Object.is(value, previous)) {
		return;
	}
	hold(key, value);
	notify(key);
}

export function subscribeToSessionValue<T>(key: Key, defaultValue: T, onChange: () => void): () => void {
	let keyWatchers = watchers.get(key);
	if (!keyWatchers) {
		const held = heldValue(key, defaultValue);
		if (held.state !== 'stored') {
			// So a reload sees the default too.
			hold(key, held.value);
		}
		keyWatchers = new Set();
		watchers.set(key, keyWatchers);
	}
	keyWatchers.add(onChange);
	return () => {
		keyWatchers.delete(onChange);
		if (!keyWatchers.size) {
			watchers.delete(key);
			if (values.get(key)?.state !== 'refused') {
				values.delete(key);
			}
		}
	};
}

export function forgetSessionValues(): void {
	values.clear();
	for (const key of watchers.keys()) {
		notify(key);
	}
}

if (typeof window !== 'undefined') {
	// Writes from other documents: localStorage writes from other tabs arrive here too, and a clear() has
	// no key.
	window.addEventListener('storage', (event) => {
		if (event.storageArea !== sessionStorage) {
			return;
		}
		if (event.key === null) {
			forgetSessionValues();
		} else if (values.delete(event.key)) {
			notify(event.key);
		}
	});
}
