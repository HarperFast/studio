import { describe, expect, it } from 'vitest';
import { deploymentErrorText, DeploymentStatus, isTerminalDeploymentStatus } from './types';

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

describe('deploymentErrorText', () => {
	it('passes bare strings through', () => {
		expect(deploymentErrorText('ECONNREFUSED')).toBe('ECONNREFUSED');
	});

	it('extracts message from the structured { message, code } shape Harper records (#1426)', () => {
		expect(deploymentErrorText({ message: 'install failed', code: 'ERR_INSTALL' })).toBe('install failed');
	});

	it('never renders "[object Object]" for message-less objects', () => {
		expect(deploymentErrorText({ code: 500 })).toBe('{"code":500}');
	});

	it('ignores a non-string message and falls back to JSON', () => {
		expect(deploymentErrorText({ message: { nested: true } })).toBe('{"message":{"nested":true}}');
	});

	it.each([[null], [undefined], ['']])('returns undefined for empty input (%s)', (input) => {
		expect(deploymentErrorText(input)).toBeUndefined();
	});

	it('stringifies primitives', () => {
		expect(deploymentErrorText(503)).toBe('503');
	});

	it('returns undefined when the object cannot be serialized', () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(deploymentErrorText(circular)).toBeUndefined();
	});
});
