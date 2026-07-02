import { tableNameSchema } from '@/integrations/api/instance/database/tableNameSchema';
import { describe, expect, it } from 'vitest';
import { sampleDatasets } from './index';

describe('sampleDatasets', () => {
	it('has unique ids and valid default table names', () => {
		const ids = sampleDatasets.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const dataset of sampleDatasets) {
			expect(tableNameSchema.safeParse(dataset.table).success).toBe(true);
			expect(dataset.name).toBeTruthy();
			expect(dataset.description).toBeTruthy();
		}
	});

	// The datasets are loaded via csv_data_load without any quoting-aware parsing on our
	// side, so keep them trivially parseable: no quotes, and a consistent column count
	// (which also catches stray commas inside values).
	it('ships well-formed CSV with an id column and consistent columns', () => {
		for (const dataset of sampleDatasets) {
			const lines = dataset.csv.trim().split('\n');
			expect(lines.length, `${dataset.id} should have data rows`).toBeGreaterThan(10);
			expect(dataset.csv).not.toContain('"');
			const header = lines[0].split(',');
			expect(header[0], `${dataset.id} first column should be the primary key`).toBe('id');
			for (const [index, line] of lines.entries()) {
				expect(line.split(',').length, `${dataset.id} line ${index + 1} column count`).toBe(header.length);
			}
			const idValues = lines.slice(1).map((line) => line.split(',')[0]);
			expect(new Set(idValues).size, `${dataset.id} ids should be unique`).toBe(idValues.length);
		}
	});
});
