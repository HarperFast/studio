import { describe, expect, it } from 'vitest';
import { DeploymentStatus, isTerminalDeploymentStatus } from './types';

describe('isTerminalDeploymentStatus', () => {
	it.each<[DeploymentStatus, boolean]>([
		['pending', false],
		['extracting', false],
		['installing', false],
		['loading', false],
		['replicating', false],
		['restarting', false],
		['success', true],
		['failed', true],
		['rolled_back', true],
	])('%s -> terminal=%s', (status, expected) => {
		expect(isTerminalDeploymentStatus(status)).toBe(expected);
	});

	it('treats undefined as non-terminal', () => {
		expect(isTerminalDeploymentStatus(undefined)).toBe(false);
	});
});
