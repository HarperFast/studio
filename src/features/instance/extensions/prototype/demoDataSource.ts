import type { ExtensionDataSource, ExtensionRecord } from '@/features/instance/extensions/dataSource';

/**
 * PROTOTYPE ONLY: an in-memory cluster for the demo components, so every scenario can be clicked
 * through on any cluster without deploying anything. Lives for the page's lifetime.
 */

const now = Date.now();
const hour = 3_600_000;

const tables: Record<string, ExtensionRecord[]> = {
	'redirects.Rule': [
		rule('r1', '/blog/*', 'https://www.example.com/articles/*', 301, true, 18_412),
		rule('r2', '/pricing-old', 'https://www.example.com/pricing', 301, true, 2_207),
		rule('r3', '/docs/v3/*', 'https://docs.example.com/v4/*', 308, true, 9_983),
		rule('r4', '/summer-sale', 'https://www.example.com/sale', 302, false, 0),
		rule('r5', '/careers', 'https://jobs.example.com', 301, true, 611),
		rule('r6', '/support', 'https://help.example.com', 307, true, 4_102),
	],
	'prerender.Settings': [{
		id: 'default',
		enabled: true,
		origin: 'https://www.example.com',
		refreshMinutes: 60,
		userAgents: 'Googlebot|Bingbot|DuckDuckBot|facebookexternalhit',
	}],
	'prerender.Page': [
		page('p1', '/', 'fresh', 0.2, 84),
		page('p2', '/pricing', 'fresh', 0.6, 61),
		page('p3', '/blog/launch-week', 'stale', 3.2, 142),
		page('p4', '/docs/getting-started', 'fresh', 0.9, 97),
		page('p5', '/customers', 'rendering', 5.5, 0),
	],
	'cache.Stat': Array.from({ length: 24 }, (_, index) => ({
		id: `h${index}`,
		hour: index,
		hits: Math.round(4_000 + 3_000 * Math.sin(index / 3.8) + (index % 5) * 310),
		misses: Math.round(420 + 260 * Math.cos(index / 2.5) + (index % 3) * 90),
	})),
};

function rule(id: string, source: string, target: string, statusCode: number, enabled: boolean, hits: number) {
	return { id, source, target, statusCode, enabled, hits };
}

function page(id: string, path: string, status: string, hoursAgo: number, sizeKb: number) {
	return { id, path, status, renderedAt: now - hoursAgo * hour, sizeKb };
}

const latency = () => new Promise((resolve) => setTimeout(resolve, 250));

function rows(database: string, table: string): ExtensionRecord[] {
	return (tables[`${database}.${table}`] ??= []);
}

export const demoDataSource: ExtensionDataSource = {
	id: 'prototype-demo',
	async list(database, table) {
		await latency();
		return { records: rows(database, table).map((record) => ({ ...record })), truncated: false };
	},
	async count(database, table, where) {
		await latency();
		const conditions = Object.entries(where ?? {});
		const count =
			rows(database, table).filter((record) =>
				conditions.every(([attribute, expected]) => record[attribute] === expected)
			).length;
		return { count, bound: 'exact' };
	},
	async get(database, table, primaryKey, id) {
		await latency();
		const record = rows(database, table).find((candidate) => candidate[primaryKey] === id);
		return record && { ...record };
	},
	async insert(database, table, record) {
		await latency();
		const list = rows(database, table);
		const id = record.id ?? crypto.randomUUID();
		if (list.some((candidate) => candidate.id === id)) {
			throw new Error(`A record with id ${String(id)} already exists`);
		}
		list.push({ hits: database === 'redirects' ? 0 : undefined, ...record, id });
	},
	async update(database, table, record) {
		await latency();
		const existing = rows(database, table).find((candidate) => candidate.id === record.id);
		if (!existing) {
			throw new Error(`No record with id ${String(record.id)}`);
		}
		Object.assign(existing, record);
	},
	async remove(database, table, id) {
		await latency();
		const list = rows(database, table);
		tables[`${database}.${table}`] = list.filter((candidate) => candidate.id !== id);
	},
	async send(request) {
		await latency();
		switch (request.operation) {
			case 'prerender_refresh':
				for (const record of rows('prerender', 'Page')) {
					Object.assign(record, { status: 'rendering' });
				}
				return { queued: rows('prerender', 'Page').length };
			case 'prerender_purge':
				for (const record of rows('prerender', 'Page')) {
					Object.assign(record, { status: 'purged', sizeKb: 0 });
				}
				return { purged: rows('prerender', 'Page').length };
			case 'cache_flush':
				return { flushed: 1_284 };
		}
		if (request.operation === 'search_by_value' && typeof request.database === 'string') {
			return rows(request.database, String(request.table)).map((record) => ({ ...record }));
		}
		throw new Error(`The demo cluster does not implement ${request.operation}`);
	},
};
