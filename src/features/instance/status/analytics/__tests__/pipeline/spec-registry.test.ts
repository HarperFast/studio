import { describe, expect, it } from 'vitest';
import { derivedRegistry } from '../../pipeline/derived/index';
import { specRegistry } from '../../pipeline/index';

// Pins the full registry contents so a typo in the wrapperMetrics factory
// table (or a dropped line in the registry) can't silently lose a metric.
// Note 'response_200' is intentionally snake_case — it matches the Harper
// metric name.

/** Every registered metric, split by whether it has a bespoke Renderer. */
const KEYS_WITH_RENDERER = [
	'replication-latency',
	'bytes-sent',
	'bytes-received',
	'connections',
	'duration',
	'success',
	'transfer',
	'connection',
	'cpu-usage',
	'db-read',
	'db-write',
	'db-message',
	'response_200',
	'database-size',
	'memory',
	'main-thread-utilization',
	'cache-hit',
	'cache-resolution',
];

const KEYS_WITHOUT_RENDERER = [
	'resource-usage',
	'tls-reused',
	'utilization',
	'storage-volume',
];

const DERIVED_KEYS = [
	'mqtt-traffic-sent',
	'mqtt-traffic-received',
	'request-rate',
	'error-rate',
	'transaction-log-growth',
];

describe('specRegistry', () => {
	it('registers exactly the expected metric keys', () => {
		expect(Object.keys(specRegistry).sort()).toEqual(
			[...KEYS_WITH_RENDERER, ...KEYS_WITHOUT_RENDERER].sort(),
		);
	});

	it('every entry has a complete spec', () => {
		for (const [key, entry] of Object.entries(specRegistry)) {
			expect(entry.spec, `${key} spec`).toBeDefined();
			expect(entry.spec.title, `${key} title`).toBeTruthy();
			expect(entry.spec.description, `${key} description`).toBeTruthy();
			expect(entry.spec.tab, `${key} tab`).toBeTruthy();
			expect(entry.spec.primitive, `${key} primitive`).toBeTruthy();
			expect(entry.spec.aggregator, `${key} aggregator`).toBeDefined();
			expect(entry.spec.yAxis, `${key} yAxis`).toBeDefined();
		}
	});

	it('renderer presence matches the expected split', () => {
		for (const key of KEYS_WITH_RENDERER) {
			expect(specRegistry[key]?.Renderer, `${key} Renderer`).toBeTypeOf('function');
		}
		for (const key of KEYS_WITHOUT_RENDERER) {
			expect(specRegistry[key]?.Renderer, `${key} Renderer`).toBeUndefined();
		}
	});
});

describe('derivedRegistry', () => {
	it('registers exactly the expected derived metrics, keyed by their own id', () => {
		expect(Object.keys(derivedRegistry).sort()).toEqual([...DERIVED_KEYS].sort());
		for (const [key, derived] of Object.entries(derivedRegistry)) {
			expect(derived.id, `${key} id`).toBe(key);
			expect(derived.recompute, `${key} recompute`).toBeTypeOf('function');
			expect(derived.title, `${key} title`).toBeTruthy();
		}
	});
});
