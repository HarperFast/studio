/**
 * @vitest-environment jsdom
 *
 * useFormField drives every label, control and message. It must re-render them when the field's
 * error changes, and must not subscribe them to anything else: react-hook-form flips isValidating
 * synchronously while a Controller registers during its own render, and a subscriber to it would
 * be a render-phase update of the whole form (the setup's tripwire fails the test if that recurs).
 */
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { zodResolver } from '@hookform/resolvers/zod';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act, useState } from 'react';
import { Control, useForm, UseFormReturn, useFormState } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

const Schema = z.object({ name: z.string().min(1, 'Name is required'), extra: z.string() });
type Values = z.infer<typeof Schema>;

let form: UseFormReturn<Values>;

// Reading isValid is what makes a field's register run the schema, as the real modals do. Its own
// component, so the harness root does not re-render on every form-state change and the labels
// have to earn their re-renders from their own subscription.
function Submit({ control }: { control: Control<Values> }) {
	const { isValid } = useFormState({ control });
	return <button type="submit" disabled={!isValid}>save</button>;
}

function Harness() {
	form = useForm<Values>({ resolver: zodResolver(Schema), defaultValues: { name: '', extra: '' }, mode: 'onChange' });
	// A second field mounted on demand: the register-in-render path that surfaced the subscription.
	const [showExtra, setShowExtra] = useState(false);
	return (
		<Form {...form}>
			<FormField
				control={form.control}
				name="name"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Name</FormLabel>
						<FormControl>
							<input {...field} />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			{showExtra && (
				<FormField
					control={form.control}
					name="extra"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Extra</FormLabel>
							<FormControl>
								<input {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			)}
			<button type="button" onClick={() => setShowExtra(true)}>more</button>
			<Submit control={form.control} />
		</Form>
	);
}

afterEach(cleanup);

describe('useFormField', () => {
	it('re-renders the label and message when the field gains and loses an error', async () => {
		render(<Harness />);
		expect(screen.queryByText('Name is required')).toBeNull();
		expect(screen.getByText('Name').getAttribute('data-error')).toBe('false');

		await act(async () => {
			await form.trigger('name');
		});
		expect(screen.getByText('Name is required')).toBeTruthy();
		expect(screen.getByText('Name').getAttribute('data-error')).toBe('true');

		fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
		await act(() => null);
		expect(screen.queryByText('Name is required')).toBeNull();
		expect(screen.getByText('Name').getAttribute('data-error')).toBe('false');
	});

	it('mounting another field mid-form does not update the existing ones while it renders', async () => {
		render(<Harness />);
		fireEvent.click(screen.getByText('more'));
		await act(() => null);
		expect(screen.getByText('Extra')).toBeTruthy();
	});
});
