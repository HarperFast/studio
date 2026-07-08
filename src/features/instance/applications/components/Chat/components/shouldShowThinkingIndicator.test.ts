import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { shouldShowThinkingIndicator } from './shouldShowThinkingIndicator';

const assistant = (parts: unknown[] | undefined) => ({ id: '1', role: 'assistant', parts }) as unknown as UIMessage;
const user = () => ({ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }) as unknown as UIMessage;

describe('shouldShowThinkingIndicator', () => {
	it('shows while a request is submitted', () => {
		expect(shouldShowThinkingIndicator('submitted', user())).toBe(true);
		expect(
			shouldShowThinkingIndicator('submitted', assistant([{ type: 'tool-getComponents', state: 'output-available' }])),
		)
			.toBe(true);
	});

	it('shows while streaming before the assistant message has any parts', () => {
		expect(shouldShowThinkingIndicator('streaming', user())).toBe(true);
		expect(shouldShowThinkingIndicator('streaming', assistant([]))).toBe(true);
		expect(shouldShowThinkingIndicator('streaming', undefined)).toBe(true);
	});

	it('hides while text is actively streaming in', () => {
		expect(shouldShowThinkingIndicator('streaming', assistant([{ type: 'text', text: 'Sure', state: 'streaming' }])))
			.toBe(false);
	});

	it('shows again after the last part finished but the stream is still open', () => {
		expect(shouldShowThinkingIndicator('streaming', assistant([{ type: 'text', text: 'Sure', state: 'done' }])))
			.toBe(true);
		expect(
			shouldShowThinkingIndicator(
				'streaming',
				assistant([{ type: 'tool-getComponents', state: 'output-available', toolCallId: 'c1' }]),
			),
		).toBe(true);
	});

	it('hides while a tool call is in flight (its group shows a spinner)', () => {
		expect(
			shouldShowThinkingIndicator(
				'streaming',
				assistant([{ type: 'tool-getComponents', state: 'input-streaming', toolCallId: 'c1' }]),
			),
		).toBe(false);
		expect(
			shouldShowThinkingIndicator(
				'streaming',
				assistant([{ type: 'tool-getComponents', state: 'input-available', toolCallId: 'c1' }]),
			),
		).toBe(false);
	});

	it('shows while invisible parts stream (reasoning, step markers)', () => {
		expect(shouldShowThinkingIndicator('streaming', assistant([{ type: 'reasoning', text: 'hmm' }]))).toBe(true);
		expect(shouldShowThinkingIndicator('streaming', assistant([{ type: 'step-start' }]))).toBe(true);
	});

	it('hides when idle or errored', () => {
		expect(shouldShowThinkingIndicator('ready', assistant([{ type: 'text', text: 'Done' }]))).toBe(false);
		expect(shouldShowThinkingIndicator('error', user())).toBe(false);
	});
});
