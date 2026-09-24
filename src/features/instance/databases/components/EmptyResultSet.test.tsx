/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyResultSet } from './EmptyResultSet';

afterEach(() => cleanup());

function renderEmptyResultSet(overrides: Partial<Parameters<typeof EmptyResultSet>[0]> = {}) {
	const props = {
		tableName: 'users',
		hasPrimaryKey: true,
		isFiltered: false,
		isPastFirstPage: false,
		recordCount: 0 as number | undefined,
		canImportFile: true,
		canImportUrl: true,
		canSeedSample: true,
		canSeedRandom: true,
		canAddRecords: true,
		onImport: vi.fn(),
		onSeed: vi.fn(),
		onAddRecords: vi.fn(),
		onClearFilters: vi.fn(),
		...overrides,
	};
	render(<EmptyResultSet {...props} />);
	return props;
}

const importCard = () => screen.queryByRole('button', { name: /Import your data/ });
const seedCard = () => screen.queryByRole('button', { name: /Seed some data/ });

describe('EmptyResultSet', () => {
	it('offers importing and seeding as two separate invitations on an empty table', () => {
		const props = renderEmptyResultSet();
		expect(importCard()).not.toBe(seedCard());

		fireEvent.click(importCard()!);
		expect(props.onImport).toHaveBeenCalledTimes(1);
		expect(props.onSeed).not.toHaveBeenCalled();

		fireEvent.click(seedCard()!);
		expect(props.onSeed).toHaveBeenCalledTimes(1);
		expect(props.onImport).toHaveBeenCalledTimes(1);
	});

	it('names the table it is empty, and offers adding a record by hand', () => {
		const props = renderEmptyResultSet();
		expect(screen.getByRole('heading').textContent).toContain('users');

		fireEvent.click(screen.getByRole('button', { name: /Add New Record/ }));
		expect(props.onAddRecords).toHaveBeenCalledTimes(1);
	});

	// Each card stands on the source it would actually use. `methods.sample` and `methods.file` share
	// one path, so gating on those would offer Seed to a role whose dataset dropdown is empty.
	it('drops the import card when no import source is open', () => {
		renderEmptyResultSet({ canImportFile: false, canImportUrl: false });
		expect(importCard()).toBeNull();
		expect(seedCard()).toBeTruthy();
	});

	it('drops the seed card when neither a sample dataset nor random records are possible', () => {
		renderEmptyResultSet({ canSeedSample: false, canSeedRandom: false });
		expect(seedCard()).toBeNull();
		expect(importCard()).toBeTruthy();
	});

	it('says nothing about getting data in when the role can do none of it', () => {
		renderEmptyResultSet({
			canImportFile: false,
			canImportUrl: false,
			canSeedSample: false,
			canSeedRandom: false,
			canAddRecords: false,
		});
		expect(screen.getByRole('heading').textContent).toContain('has no records yet');
		expect(screen.queryAllByRole('button')).toHaveLength(0);
	});

	// The copy has to describe what this role will actually be shown in the modal, and "two ways"
	// has to stop claiming two when only one card is there.
	it('promises two ways only when both invitations are on screen', () => {
		renderEmptyResultSet({ canSeedSample: false, canSeedRandom: false });
		expect(screen.queryByText(/Two ways to get some in/)).toBeNull();

		cleanup();
		renderEmptyResultSet();
		expect(screen.getByText(/Two ways to get some in/)).toBeTruthy();
	});

	it('describes only the import sources this role can reach', () => {
		renderEmptyResultSet({ canImportFile: false });
		expect(importCard()!.textContent).toContain('Load a CSV from a URL');
		expect(importCard()!.textContent).not.toContain('Upload a CSV or JSON file');
	});

	// A bundled dataset retargets the import to the dataset's own table, so only the random-records
	// path may claim it fills the table the user is looking at.
	it('promises this table is filled only where random records are possible', () => {
		renderEmptyResultSet({ canSeedRandom: false });
		expect(seedCard()!.textContent).toContain('table of its own');
		expect(seedCard()!.textContent).not.toContain('Fill this table');

		cleanup();
		renderEmptyResultSet({ canSeedSample: false });
		expect(seedCard()!.textContent).toContain('Fill this table');
	});

	// An empty *result set* is not an empty table. Offering to import into a table that already holds
	// records would be telling the user something untrue, and invites a duplicating load.
	it('points at the filters, not at importing, when filters matched nothing', () => {
		const props = renderEmptyResultSet({ isFiltered: true });
		expect(screen.getByRole('heading').textContent).toContain('No records match these filters');
		expect(importCard()).toBeNull();
		expect(seedCard()).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: /Clear Filters/ }));
		expect(props.onClearFilters).toHaveBeenCalledTimes(1);
	});

	it('explains the page instead, past the first page, filtered or not', () => {
		renderEmptyResultSet({ isFiltered: true, isPastFirstPage: true });
		expect(screen.getByRole('heading').textContent).toContain('No records on this page');
		expect(screen.queryByRole('button')).toBeNull();
	});

	// `search_by_value` answers a 404 with `{ data: [] }`, which Only If Cached (on by default) can
	// produce on a cache miss — so a page of nothing against a non-zero count is not an empty table.
	it('does not claim a table is empty when its own count says otherwise', () => {
		renderEmptyResultSet({ recordCount: 12 });
		expect(screen.getByRole('heading').textContent).toContain('No records came back');
		expect(importCard()).toBeNull();
		expect(seedCard()).toBeNull();
	});

	// describe_all carries no counts, so the count is undefined on first paint and stays undefined if
	// describe_table failed (retry: false). The invitation still stands; the claim of emptiness does not.
	it('keeps the invitations but stops asserting emptiness while the count is unknown', () => {
		renderEmptyResultSet({ recordCount: undefined });
		expect(screen.getByRole('heading').textContent).toBe('No records to show');
		expect(importCard()).toBeTruthy();
		expect(seedCard()).toBeTruthy();

		cleanup();
		renderEmptyResultSet({ recordCount: 0 });
		expect(screen.getByRole('heading').textContent).toBe('users has no records yet');
	});

	it('explains a table with no primary key ahead of every other reason, and invites nothing', () => {
		renderEmptyResultSet({ hasPrimaryKey: false, isFiltered: true, isPastFirstPage: true, recordCount: 1234 });
		expect(screen.getByRole('heading').textContent).toBe('users has no primary key');
		expect(screen.getByText(/It reports 1,234 records/)).toBeTruthy();
		expect(screen.queryAllByRole('button')).toHaveLength(0);

		cleanup();
		renderEmptyResultSet({ hasPrimaryKey: false, recordCount: undefined });
		expect(screen.queryByText(/It reports/)).toBeNull();
		expect(screen.getByText(/can't browse this table/)).toBeTruthy();
		// Declaring a key on the existing table fails once it holds records (HarperFast/harper#2480).
		expect(screen.getByText(/recreate the table with a primary key/)).toBeTruthy();
		expect(screen.queryByText(/declare a primary key/i)).toBeNull();
	});
});
