/**
 * @vitest-environment jsdom
 */
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Children, isValidElement, ReactElement, ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { JobDialog, JobDialogTarget } from './JobDialog';
import { readAppJobs } from './jobsConfig';
import { schedulerApps } from './schedulerApps';

function triggerLabel(children: ReactNode): string | undefined {
	for (const child of Children.toArray(children)) {
		if (!isValidElement(child)) {
			continue;
		}
		const props = (child as ReactElement<{ 'aria-label'?: string; children?: ReactNode }>).props;
		const label = props['aria-label'] ?? triggerLabel(props.children);
		if (label) {
			return label;
		}
	}
	return undefined;
}

/** A native <select> standing in for Radix's, whose portal listbox jsdom doesn't open. */
vi.mock('@/components/ui/select', () => ({
	Select: ({ value, onValueChange, disabled, children }: {
		value?: string;
		onValueChange: (value: string) => void;
		disabled?: boolean;
		children: ReactNode;
	}) => (
		<select
			aria-label={triggerLabel(children)}
			value={value ?? ''}
			disabled={disabled}
			onChange={(event) => onValueChange(event.target.value)}
		>
			<option value="" />
			{children}
		</select>
	),
	SelectTrigger: () => null,
	SelectValue: () => null,
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<option value={value}>{children}</option>
	),
}));

const JOBS_SOURCE = 'export async function syncRates() {}\nexport const first = () => {}, second = () => {};\n';
const CONFIG = 'scheduler:\n  jobs:\n    - name: sync-rates\n      interval: 10s\n      handler: ./jobs.js#syncRates\n';

const post = vi.fn(async (_url: string, body: { operation: string; file?: string }) => {
	if (body.operation === 'get_component_file' && body.file === 'jobs.js') {
		return { data: { message: JOBS_SOURCE } };
	}
	throw new Error(`unexpected ${body.operation}`);
});

function target(withJob: boolean, configText = CONFIG): JobDialogTarget {
	const [app] = schedulerApps({
		name: 'components',
		entries: [{ name: 'metrics-app', entries: [{ name: 'config.yaml' }, { name: 'jobs.js' }] }],
	});
	const config = readAppJobs(configText);
	return { app, job: withJob ? config.jobs[0] : undefined, baseText: configText, config };
}

function renderDialog(withJob = false, configText = CONFIG) {
	const onSave = vi.fn();
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<JobDialog
				open
				target={target(withJob, configText)}
				instanceParams={{ instanceClient: { post } as never, entityId: 'instance-1' }}
				isSaving={false}
				saveError={null}
				onSave={onSave}
				onClose={() => {}}
			/>
		</QueryClientProvider>,
	);
	return onSave;
}

const SELECTS = new Set(['Timezone', 'Export', 'Handler file']);
const field = (label: string) =>
	(SELECTS.has(label) ? screen.getByRole('combobox', { name: label }) : screen.getByRole('textbox', { name: label })) as
		| HTMLInputElement
		| HTMLSelectElement;
const submit = () => screen.getByRole('button', { name: /Add job|Save job/ }) as HTMLButtonElement;

async function change(label: string, value: string) {
	await act(async () => {
		fireEvent.change(field(label), { target: { value } });
	});
}

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

describe('JobDialog', () => {
	it('adds a cron job in UTC with an export the file declares', async () => {
		const onSave = renderDialog();
		await change('Name', 'nightly');
		await change('Cron expression', '0 2 * * *');
		await change('Timezone', 'UTC');
		await waitFor(() => expect(screen.getByRole('option', { name: 'syncRates' })).toBeTruthy());
		await change('Export', 'syncRates');
		await waitFor(() => expect(submit().disabled).toBe(false));
		await act(async () => {
			fireEvent.click(submit());
		});
		expect(onSave).toHaveBeenCalledWith({
			name: 'nightly',
			schedule: { cron: '0 2 * * *', timezone: 'UTC' },
			handler: './jobs.js#syncRates',
		});
	});

	it('takes an export the scan missed, and says it didn’t find it', async () => {
		const onSave = renderDialog();
		await change('Name', 'second-job');
		await change('Cron expression', '@daily');
		await waitFor(() => expect(screen.getByRole('option', { name: 'Another export…' })).toBeTruthy());
		await change('Export', '__other__');
		await act(async () => {
			fireEvent.change(screen.getByPlaceholderText('syncRates, or default'), { target: { value: 'second' } });
		});
		expect(screen.getByText(/Studio didn’t find an export named second in jobs.js/)).toBeTruthy();
		await waitFor(() => expect(submit().disabled).toBe(false));
		await act(async () => {
			fireEvent.click(submit());
		});
		expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ handler: './jobs.js#second' }));
	});

	it("shows Harper's refusal once the cron field is left", async () => {
		renderDialog();
		await change('Cron expression', '0 0 30 2 *');
		expect(screen.queryByText(/can never fire/)).toBeNull();
		await act(async () => {
			fireEvent.blur(field('Cron expression'));
		});
		expect(screen.getByText('Cron expression "0 0 30 2 *" can never fire')).toBeTruthy();
		expect(submit().disabled).toBe(true);
	});

	it('keeps a typed export typed while it is cleared and retyped', async () => {
		renderDialog(true, CONFIG.replace('#syncRates', '#refreshRates'));
		await waitFor(() => expect(screen.getByRole('option', { name: 'syncRates' })).toBeTruthy());
		const typed = () => screen.getByPlaceholderText('syncRates, or default') as HTMLInputElement;
		expect(typed().value).toBe('refreshRates');
		await act(async () => {
			fireEvent.change(typed(), { target: { value: '' } });
		});
		await act(async () => {
			fireEvent.change(typed(), { target: { value: 'syncRates' } });
		});
		expect(typed().value).toBe('syncRates');
	});

	it('enables Save on the first change to a valid job', async () => {
		renderDialog(true);
		await waitFor(() => expect(screen.getByRole('option', { name: 'syncRates' })).toBeTruthy());
		expect(submit().disabled).toBe(true);
		await change('Interval', '15m');
		await waitFor(() => expect(submit().disabled).toBe(false));
	});

	it('opens a job whose handler file is gone with that error showing', async () => {
		renderDialog(true, CONFIG.replace('./jobs.js#syncRates', './gone.js#syncRates'));
		expect(await screen.findByText('This app has no such file.')).toBeTruthy();
	});

	it('opens a job Harper would refuse with its error showing', async () => {
		renderDialog(true, CONFIG.replace('interval: 10s', "cron: '0 0 30 2 *'"));
		expect(await screen.findByText('Cron expression "0 0 30 2 *" can never fire')).toBeTruthy();
		expect(submit().disabled).toBe(true);
	});

	it('stops reading the handler file once it closes', async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const shown = target(true);
		const dialog = (open: boolean) => (
			<QueryClientProvider client={client}>
				<JobDialog
					open={open}
					target={shown}
					instanceParams={{ instanceClient: { post } as never, entityId: 'instance-1' }}
					isSaving={false}
					saveError={null}
					onSave={() => {}}
					onClose={() => {}}
				/>
			</QueryClientProvider>
		);
		const reads = () => post.mock.calls.filter(([, body]) => body.operation === 'get_component_file').length;
		const { rerender } = render(dialog(true));
		await waitFor(() => expect(screen.getByRole('option', { name: 'syncRates' })).toBeTruthy());
		const focusAgain = async () => {
			await act(async () => {
				focusManager.setFocused(false);
				focusManager.setFocused(true);
			});
		};
		try {
			const whileOpen = reads();
			await focusAgain();
			await waitFor(() => expect(reads()).toBe(whileOpen + 1));
			rerender(dialog(false));
			const afterClose = reads();
			await focusAgain();
			expect(reads()).toBe(afterClose);
		} finally {
			focusManager.setFocused(undefined);
		}
	});

	it('never offers a file with a # in its name, which Harper would read as file and export', async () => {
		const [app] = schedulerApps({
			name: 'components',
			entries: [{
				name: 'metrics-app',
				entries: [{ name: 'config.yaml' }, { name: '#nightly.js' }, { name: 'jobs.js' }],
			}],
		});
		const config = readAppJobs(CONFIG);
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		render(
			<QueryClientProvider client={client}>
				<JobDialog
					open
					target={{ app, job: undefined, baseText: CONFIG, config }}
					instanceParams={{ instanceClient: { post } as never, entityId: 'instance-1' }}
					isSaving={false}
					saveError={null}
					onSave={() => {}}
					onClose={() => {}}
				/>
			</QueryClientProvider>,
		);
		expect((field('Handler file') as HTMLSelectElement).value).toBe('jobs.js');
		expect(screen.queryByRole('option', { name: '#nightly.js' })).toBeNull();
	});

	it.each([
		['../shared/jobs.js#syncRates', '../shared/jobs.js#syncRates'],
		['/srv/jobs.js', '/srv/jobs.js'],
	])('keeps a handler outside the app, %j, as written while the schedule changes', async (handler, saved) => {
		const onSave = renderDialog(true, CONFIG.replace('./jobs.js#syncRates', handler));
		expect((field('Handler file') as HTMLSelectElement).value).toBe(handler.split('#')[0]);
		await change('Interval', '15m');
		await waitFor(() => expect(submit().disabled).toBe(false));
		await act(async () => {
			fireEvent.click(submit());
		});
		expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ schedule: { interval: '15m' }, handler: saved }));
	});

	it('keeps a quoted name’s spaces when another field changes, since Harper would read it as a new job', async () => {
		const onSave = renderDialog(true, CONFIG.replace('name: sync-rates', "name: ' sync-rates'"));
		await change('Interval', '15m');
		await waitFor(() => expect(submit().disabled).toBe(false));
		await act(async () => {
			fireEvent.click(submit());
		});
		expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: ' sync-rates' }));
	});

	it('lets a job Harper would refuse be saved as the form already fixes it', async () => {
		renderDialog(true, CONFIG.replace('      handler:', '      timeZone: UTC\n      handler:'));
		await waitFor(() => expect(screen.getByRole('option', { name: 'syncRates' })).toBeTruthy());
		await waitFor(() => expect(submit().disabled).toBe(false));
	});
});
