/**
 * @vitest-environment jsdom
 */
import { Form } from '@/components/ui/form/Form';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LengthLimitedInput } from './LengthLimitedInput';

function NameForm({ type = 'text', name = '', maxLength = 10, focus = false }: {
	type?: 'text' | 'email';
	name?: string;
	maxLength?: number;
	focus?: boolean;
}) {
	const form = useForm({ defaultValues: { name } });
	const { setFocus } = form;
	useEffect(() => {
		if (focus) {
			setFocus('name');
		}
	}, [focus, setFocus]);
	return (
		<Form {...form}>
			<FormField
				control={form.control}
				name="name"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Name</FormLabel>
						<LengthLimitedInput type={type} maxLength={maxLength} {...field} />
						<FormMessage />
					</FormItem>
				)}
			/>
		</Form>
	);
}

afterEach(cleanup);

const input = () => screen.getByLabelText('Name') as HTMLInputElement;
const hint = () => document.querySelector('[data-slot="form-length-hint"]')!;
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const description = () =>
	(input().getAttribute('aria-describedby') ?? '').split(' ').map(id => document.getElementById(id)?.textContent)
		.join(' ').trim();

// jsdom has no paste default action, so `landed` stands in for what the browser inserts.
function startPaste(text: string, landed: string) {
	fireEvent.paste(input(), { clipboardData: { getData: () => text } });
	type(landed);
}
async function paste(text: string, landed: string) {
	startPaste(text, landed);
	await act(() => new Promise(resolve => setTimeout(resolve)));
}

describe('LengthLimitedInput', () => {
	it('stops the input at the limit and says so, politely, in its accessible description', () => {
		render(<NameForm />);
		expect(input().maxLength).toBe(10);

		type('a'.repeat(10));

		expect(hint().textContent).toBe('Maximum 10 characters reached.');
		expect(description()).toBe('Maximum 10 characters reached.');
		expect(hint().getAttribute('aria-live')).toBe('polite');
	});

	it("passes react-hook-form the input's ref, so a refused field can still be focused", async () => {
		render(<NameForm focus />);

		await waitFor(() => expect(document.activeElement).toBe(input()));
	});

	it('says nothing below the limit, from a live region that is already in place', () => {
		render(<NameForm />);
		type('a'.repeat(9));

		expect(hint().textContent).toBe('');
		expect(hint().getAttribute('aria-live')).toBe('polite');
		expect(input().getAttribute('aria-describedby')).toContain(hint().id);
	});

	it('clears once the value is back under the limit', () => {
		render(<NameForm />);
		type('a'.repeat(10));
		type('a'.repeat(9));

		expect(hint().textContent).toBe('');
	});

	it('says when a paste was cut, how long it was and how much of it fit', async () => {
		render(<NameForm />);
		await paste('p'.repeat(312), 'p'.repeat(10));

		expect(description()).toBe(
			'Maximum 10 characters reached. Pasted text was 312 characters; only the first 10 fit.',
		);
	});

	it('counts only the room left beside what the field already held', async () => {
		render(<NameForm />);
		type('abcd');
		await paste('x'.repeat(20), `abcd${'x'.repeat(6)}`);

		expect(hint().textContent).toBe(
			'Maximum 10 characters reached. Pasted text was 20 characters; only the first 6 fit.',
		);
	});

	it('announces the cut paste alone, not the limit first and then the paste', async () => {
		render(<NameForm />);
		startPaste('p'.repeat(312), 'p'.repeat(10));

		expect(hint().textContent).toBe('');
		await act(() => new Promise(resolve => setTimeout(resolve)));
		expect(hint().textContent).toContain('Pasted text was 312 characters');
	});

	it('keeps the paste notice while the value is what the paste left, and drops it on any change', async () => {
		render(<NameForm />);
		await paste('p'.repeat(312), 'p'.repeat(10));
		expect(hint().textContent).toContain('Pasted text was 312 characters');

		type(`${'p'.repeat(9)}q`);
		expect(hint().textContent).toBe('Maximum 10 characters reached.');

		type('p'.repeat(9));
		expect(hint().textContent).toBe('');
	});

	it('says none of a paste fit when the browser stopped short of a surrogate pair', async () => {
		render(<NameForm />);
		type('a'.repeat(9));
		await paste('😀', 'a'.repeat(9));

		expect(hint().textContent).toBe('Maximum 10 characters. Pasted text was 2 characters; none of it fit.');
	});

	it('says nothing about a paste that fit', async () => {
		render(<NameForm />);
		await paste('abc', 'abc');

		expect(hint().textContent).toBe('');
	});

	it('says how far over the limit a value starts, such as a name saved before the limit was lowered', () => {
		render(<NameForm name={'a'.repeat(12)} />);

		expect(description()).toBe('Maximum 10 characters; this has 12.');
	});

	it('leaves the field alone when its schema sets no maximum, where zod reports the limit as null', () => {
		render(<NameForm maxLength={z.string().maxLength!} />);
		type('a'.repeat(50));

		expect(input().maxLength).toBe(-1);
		expect(document.querySelector('[data-slot="form-length-hint"]')).toBeNull();
	});

	it('makes no claim about a paste into a field that hides its selection, as type="email" does', async () => {
		render(<NameForm type="email" />);
		expect(input().selectionStart).toBeNull();
		type('a@b.co');
		await paste(`bob@${'e'.repeat(40)}.com`, `bob@${'e'.repeat(6)}`);

		expect(hint().textContent).toBe('Maximum 10 characters reached.');
	});
});
