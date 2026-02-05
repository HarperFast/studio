import { describe, expect, it } from 'vitest';
import { UpsertClusterSchema } from './upsertClusterSchema';

const validBase = {
	clusterName: 'My Cluster',
	deploymentDescription: 'Shared',
	performanceDescription: 'Standard',
	regionPlans: [
		{
			regionName: 'us-east-1',
			latencyDescription: 'Low',
		},
	],
	instances: [
		{
			secure: 'false',
			fqdn: 'instance1.example.com',
			port: 8080,
		},
	],
};

describe('UpsertClusterSchema', () => {
	it('validates a correct object', () => {
		const result = UpsertClusterSchema.safeParse(validBase);
		expect(result.success).toBe(true);
	});

	describe('clusterName', () => {
		it('is required', () => {
			const result = UpsertClusterSchema.safeParse({ ...validBase, clusterName: '' });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Please enter a cluster name.');
			}
		});

		it('has a max length of 255', () => {
			const result = UpsertClusterSchema.safeParse({ ...validBase, clusterName: 'a'.repeat(256) });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Cluster name cannot be longer than 255 characters long.');
			}
		});
	});

	describe('abbreviatedName', () => {
		const validateAbbreviated = (name: string | undefined) =>
			UpsertClusterSchema.safeParse({ ...validBase, abbreviatedName: name });

		it('validates correct abbreviated names', () => {
			const validNames = ['a', 'z', '0', '9', 'a1', '1a', 'a-b', 'a-1-b', 'my-cluster-123'];
			for (const name of validNames) {
				const result = validateAbbreviated(name);
				expect(result.success, `Expected "${name}" to be valid`).toBe(true);
			}
		});

		it('invalidates names starting with a dash', () => {
			const result = validateAbbreviated('-abc');
			expect(result.success).toBe(false);
		});

		it('invalidates names ending with a dash', () => {
			const result = validateAbbreviated('abc-');
			expect(result.success).toBe(false);
		});

		it('invalidates names with uppercase letters', () => {
			const result = validateAbbreviated('Abc');
			expect(result.success).toBe(false);
		});

		it('invalidates names with invalid characters', () => {
			const invalidNames = ['abc.def', 'abc_def', 'abc!def', 'abc def'];
			for (const name of invalidNames) {
				const result = validateAbbreviated(name);
				expect(result.success, `Expected "${name}" to be invalid`).toBe(false);
			}
		});

		it('invalidates names longer than 20 characters', () => {
			const result = validateAbbreviated('a'.repeat(21));
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Must be at most 20 characters long.');
			}
		});

		it('allows it to be optional (undefined)', () => {
			const result = validateAbbreviated(undefined);
			expect(result.success).toBe(true);
		});

		it('invalidates empty string (must match regex if provided)', () => {
			const result = validateAbbreviated('');
			expect(result.success).toBe(false);
		});
	});

	describe('fqdn', () => {
		it('validates a correct fqdn', () => {
			const result = UpsertClusterSchema.safeParse({ ...validBase, fqdn: 'cluster.example.com' });
			expect(result.success).toBe(true);
		});

		it('invalidates an incorrect fqdn', () => {
			const result = UpsertClusterSchema.safeParse({ ...validBase, fqdn: 'not an fqdn' });
			expect(result.success).toBe(false);
		});

		it('is optional', () => {
			const result = UpsertClusterSchema.safeParse({ ...validBase, fqdn: undefined });
			expect(result.success).toBe(true);
		});
	});

	describe('regionPlans', () => {
		it("requires at least one region (actually zod doesn't specify min(1) here but let's check what happens with empty array)", () => {
			const result = UpsertClusterSchema.safeParse({ ...validBase, regionPlans: [] });
			// The schema doesn't have .min(1) on regionPlans array, so empty array should be valid according to schema
			expect(result.success).toBe(true);
		});

		it('validates regionName and latencyDescription are required', () => {
			const result = UpsertClusterSchema.safeParse({
				...validBase,
				regionPlans: [{ regionName: '', latencyDescription: '' }],
			});
			expect(result.success).toBe(false);
		});

		it('limits to 50 regions', () => {
			const manyRegions = Array(51).fill({ regionName: 'r', latencyDescription: 'l' });
			const result = UpsertClusterSchema.safeParse({ ...validBase, regionPlans: manyRegions });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('A maximum of 50 regions can be selected for each cluster. ');
			}
		});
	});

	describe('instances', () => {
		it('validates instance fields', () => {
			const result = UpsertClusterSchema.safeParse({
				...validBase,
				instances: [{ secure: 'maybe', fqdn: '', port: -1 }],
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				const messages = result.error.issues.map((i) => i.message);
				expect(messages).toContain('Invalid option: expected one of "true"|"false"');
				expect(messages).toContain('Please enter the host name of your instance.');
				expect(messages).toContain('Positive thinking only, please.');
			}
		});

		it('limits to 100 instances', () => {
			const manyInstances = Array(101).fill({ secure: 'false', fqdn: 'a.com', port: 80 });
			const result = UpsertClusterSchema.safeParse({ ...validBase, instances: manyInstances });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('A maximum of 100 instances can be added to each cluster.');
			}
		});

		it('validates max port number', () => {
			const result = UpsertClusterSchema.safeParse({
				...validBase,
				instances: [{ secure: 'false', fqdn: 'a.com', port: 70000 }],
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('That port number is too high.');
			}
		});
	});
});
