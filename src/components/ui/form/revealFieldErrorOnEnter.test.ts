/**
 * @vitest-environment jsdom
 */
import type { KeyboardEvent } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { revealFieldErrorOnEnter } from './revealFieldErrorOnEnter';

function setup() {
	const values: Record<string, string> = { name: 'index(1).js' };
	const form = { getValues: vi.fn((name: string) => values[name]), setValue: vi.fn() };
	return { form, onKeyDown: revealFieldErrorOnEnter(form as unknown as UseFormReturn<Record<string, string>>) };
}

function keyDown(target: EventTarget, key = 'Enter', isComposing = false) {
	return { key, target, nativeEvent: { isComposing } } as unknown as KeyboardEvent<HTMLFormElement>;
}

function field(tag: 'input' | 'textarea', name: string) {
	const element = document.createElement(tag);
	element.name = name;
	return element;
}

describe('revealFieldErrorOnEnter', () => {
	it('marks the input touched and validates it on Enter, as leaving it would', () => {
		const { form, onKeyDown } = setup();
		onKeyDown(keyDown(field('input', 'name')));

		expect(form.setValue).toHaveBeenCalledWith('name', 'index(1).js', { shouldTouch: true, shouldValidate: true });
	});

	it.each([
		['another key', keyDown(field('input', 'name'), 'a')],
		['Enter that confirms an IME composition', keyDown(field('input', 'name'), 'Enter', true)],
		['Enter in a textarea, where it adds a line', keyDown(field('textarea', 'name'))],
		['an input the form has no value for', keyDown(field('input', 'other'))],
		['an unnamed input', keyDown(field('input', ''))],
	])('ignores %s', (_, event) => {
		const { form, onKeyDown } = setup();
		onKeyDown(event);

		expect(form.setValue).not.toHaveBeenCalled();
	});
});
