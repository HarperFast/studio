/**
 * @vitest-environment jsdom
 */
import { LOG_DATE_MIN, LogFiltersFormSchema } from '@/integrations/api/instance/status/logFiltersFormSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useForm, UseFormReturn } from 'react-hook-form';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LogsFiltersForm } from './LogsFiltersForm';

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

type Filters = z.infer<typeof LogFiltersFormSchema>;

function Harness(
	{ onSubmit, onForm }: { onSubmit: (data: Filters) => void; onForm?: (form: UseFormReturn<Filters>) => void },
) {
	const form = useForm<Filters>({
		resolver: zodResolver(LogFiltersFormSchema),
		defaultValues: { log_name: 'hdb.log', limit: '100', level: 'undefined', from: '', until: '', filter: '' },
		mode: 'onChange',
	});
	onForm?.(form);
	return (
		<LogsFiltersForm
			form={form}
			resetFilters={() => undefined}
			submitFilters={onSubmit}
			isOpen
			onOpenChange={() => undefined}
		/>
	);
}

function dateInputs(container: HTMLElement) {
	return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'));
}

describe('LogsFiltersForm date inputs', () => {
	it('bound both inputs to the epoch..today and show seconds', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 9, 10, 14, 30, 0));
		const { container } = render(<Harness onSubmit={() => undefined} />);
		const inputs = dateInputs(container);
		expect(inputs).toHaveLength(2);
		for (const input of inputs) {
			expect(input.min).toBe(LOG_DATE_MIN);
			expect(input.max).toBe('2026-10-10T23:59:59');
			expect(input.step).toBe('1');
		}
	});

	it('re-reads the max on focus, so a tab left open overnight does not cap at yesterday', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 9, 10, 23, 59, 0));
		const { container } = render(<Harness onSubmit={() => undefined} />);
		const [from] = dateInputs(container);
		expect(from.max).toBe('2026-10-10T23:59:59');

		vi.setSystemTime(new Date(2026, 9, 11, 8, 0, 0));
		act(() => {
			fireEvent.focus(from);
		});
		expect(from.max).toBe('2026-10-11T23:59:59');
	});

	it('blocks a 6-digit year from being applied and says why', async () => {
		const onSubmit = vi.fn();
		const { container } = render(<Harness onSubmit={onSubmit} />);
		const [from] = dateInputs(container);
		await act(async () => {
			fireEvent.change(from, { target: { value: '202555-01-01T10:30' } });
		});
		expect(await screen.findByText('Enter a valid date and time with a 4-digit year')).toBeTruthy();

		await act(async () => {
			fireEvent.submit(container.querySelector('form')!);
		});
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('clears the input when the form value is nulled, rather than going uncontrolled', async () => {
		let form: UseFormReturn<Filters> | undefined;
		const { container } = render(<Harness onSubmit={() => undefined} onForm={(f) => (form = f)} />);
		const [from] = dateInputs(container);
		await act(async () => {
			fireEvent.change(from, { target: { value: '2026-01-01T10:30:15' } });
		});
		expect(from.value).toBe('2026-01-01T10:30:15');

		await act(async () => {
			form!.setValue('from', null);
		});
		expect(from.value).toBe('');
	});

	it('applies a valid second-precision range', async () => {
		const onSubmit = vi.fn();
		const { container } = render(<Harness onSubmit={onSubmit} />);
		const [from, until] = dateInputs(container);
		await act(async () => {
			fireEvent.change(from, { target: { value: '2026-01-01T10:30:15' } });
			fireEvent.change(until, { target: { value: '2026-01-01T11:00:45' } });
		});
		await act(async () => {
			fireEvent.submit(container.querySelector('form')!);
		});
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ from: '2026-01-01T10:30:15', until: '2026-01-01T11:00:45' });
	});
});
