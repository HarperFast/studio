/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { supportsStagedDeployments } from './useSupportsDeploymentSSE';

describe('supportsStagedDeployments', () => {
	it.each([
		['5.3.0', true],
		['5.3.2', true],
		['5.4.0', true],
		['6.0.0', true],
		['5.2.15', false],
		['4.7.9', false],
		// An older node reads `activate: false` as an ordinary deploy, so anything short of a release is refused.
		['5.3.0-beta.4', false],
		[undefined, false],
		['not a version', false],
	])('%s -> %s', (version, expected) => {
		expect(supportsStagedDeployments(version)).toBe(expected);
	});
});
