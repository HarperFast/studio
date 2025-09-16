import { describe, expect, it } from 'vitest';
import { capitalizeWords } from './capitalizeWords';

describe('capitalizeWords', () => {
	describe('examples from spec', () => {
		it('org -> Org', () => {
			expect(capitalizeWords('org')).toBe('Org');
		});

		it('new-cluster -> New Cluster', () => {
			expect(capitalizeWords('new-cluster')).toBe('New Cluster');
		});

		it('newCluster -> New Cluster', () => {
			expect(capitalizeWords('newCluster')).toBe('New Cluster');
		});

		it('newIDs -> New IDs', () => {
			expect(capitalizeWords('newIDs')).toBe('New IDs');
		});

		it('UPDATING_HDB_NODES -> Updating HDB Nodes', () => {
			expect(capitalizeWords('UPDATING_HDB_NODES')).toBe('Updating HDB Nodes');
		});

		it('RUNNING -> Running', () => {
			expect(capitalizeWords('RUNNING')).toBe('Running');
		});
	});

	describe('delimiters and whitespace', () => {
		it('handles underscores', () => {
			expect(capitalizeWords('new_cluster')).toBe('New Cluster');
		});

		it('collapses multiple delimiters and spaces', () => {
			expect(capitalizeWords('  new--cluster__name  ')).toBe('New Cluster Name');
		});
	});

	describe('camelCase and PascalCase', () => {
		it('capitalizes PascalCase', () => {
			expect(capitalizeWords('UserAccount')).toBe('User Account');
		});

		it('keeps acronyms in PascalCase', () => {
			expect(capitalizeWords('APIResponse')).toBe('API Response');
		});

		it('handles numbers', () => {
			expect(capitalizeWords('version2IDCheck')).toBe('Version 2 ID Check');
		});
	});

	describe('acronyms and plurals', () => {
		it('keeps acronym all-caps', () => {
			expect(capitalizeWords('loadAPI')).toBe('Load API');
		});

		it('merges plural s after acronym', () => {
			expect(capitalizeWords('processIDsNow')).toBe('Process IDs Now');
		});

		it('keeps single-word acronym', () => {
			expect(capitalizeWords('CPU')).toBe('CPU');
		});
	});

	describe('edge cases', () => {
		it('empty string', () => {
			expect(capitalizeWords('')).toBe('');
		});

		it('spaces only', () => {
			expect(capitalizeWords('   ')).toBe('');
		});

		it('single letter', () => {
			expect(capitalizeWords('a')).toBe('A');
		});
	});
});
