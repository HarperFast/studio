// Deterministic synthesizer for replication-latency fixtures. Rotates 3
// synthetic writer (source) nodes across a fixed set of destination nodes.
// Output is stable across runs (Mulberry32 seed); commit alongside the script.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface FixtureRecord {
	time: number;
	node: string; // destination (the node emitting the metric)
	path: string; // '<source-node>.<database>.<table>'
	count: number;
	mean: number;
	p50: number;
	p95: number;
	p99: number;
	period: number;
}

const SOURCES = [
	'xb6-us-west-1.prod.ibm.harperfabric.com',
	'4u4-us-east-1.prod.ibm.harperfabric.com',
	'846-fr-par-1.prod.ibm.harperfabric.com',
];
const DESTINATIONS = ['dest-a.prod.ibm.harperfabric.com', 'dest-b.prod.ibm.harperfabric.com'];
const DATABASES = ['data'];
const TABLES = ['events', 'users'];
const PERIOD = 60_000;
const WINDOW_BUCKETS = 10;
const START = 1_700_000_000_000;

function mulberry32(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = seed;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function synthesize(opts: { sources: string[]; seed: number }): FixtureRecord[] {
	const rng = mulberry32(opts.seed);
	const records: FixtureRecord[] = [];
	for (let b = 0; b < WINDOW_BUCKETS; b++) {
		const time = START + b * PERIOD;
		for (const dest of DESTINATIONS) {
			for (const source of opts.sources) {
				for (const db of DATABASES) {
					for (const table of TABLES) {
						const base = 20 + rng() * 80; // 20–100 ms
						const p95 = base * (1.4 + rng() * 0.6);
						const count = 100 + Math.floor(rng() * 400);
						records.push({
							time,
							node: dest,
							path: `${source}.${db}.${table}`,
							count,
							mean: base,
							p50: base * 0.9,
							p95,
							p99: p95 * 1.1,
							period: PERIOD,
						});
					}
				}
			}
		}
	}
	return records;
}

// 2×2 matrix with pinned per-cell counts. Guaranteed confidence-tier diversity:
// cells sum to 200 (ok), 60 (grey), 20 (suppress), 300 (ok).
function synthesizeLowCountMatrix(): FixtureRecord[] {
	const srcs = SOURCES.slice(0, 2);
	const dests = ['dest-a.prod.ibm.harperfabric.com', 'dest-b.prod.ibm.harperfabric.com'];
	const perRecord: Record<string, number> = {
		[`${srcs[0]}|${dests[0]}`]: 20, // Σ = 200 → ok
		[`${srcs[0]}|${dests[1]}`]: 6, // Σ = 60  → grey
		[`${srcs[1]}|${dests[0]}`]: 2, // Σ = 20  → suppress
		[`${srcs[1]}|${dests[1]}`]: 30, // Σ = 300 → ok
	};
	const records: FixtureRecord[] = [];
	for (let b = 0; b < WINDOW_BUCKETS; b++) {
		const time = START + b * PERIOD;
		for (const src of srcs) {
			for (const dest of dests) {
				const count = perRecord[`${src}|${dest}`];
				const base = 50;
				records.push({
					time,
					node: dest,
					path: `${src}.data.events`,
					count,
					mean: base,
					p50: base * 0.9,
					p95: base * 1.5,
					p99: base * 1.8,
					period: PERIOD,
				});
			}
		}
	}
	return records;
}

const here = dirname(fileURLToPath(import.meta.url));
const multi = synthesize({ sources: SOURCES, seed: 42 });
const single = synthesize({ sources: [SOURCES[0]], seed: 7 });
const lowCountMatrix = synthesizeLowCountMatrix();

writeFileSync(join(here, 'multi-source.json'), JSON.stringify(multi, null, 2) + '\n');
writeFileSync(join(here, 'single-source.json'), JSON.stringify(single, null, 2) + '\n');
writeFileSync(join(here, 'low-count-matrix.json'), JSON.stringify(lowCountMatrix, null, 2) + '\n');

console.log(`multi: ${multi.length}, single: ${single.length}, low-count-matrix: ${lowCountMatrix.length}`);
