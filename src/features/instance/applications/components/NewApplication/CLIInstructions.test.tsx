/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CLIInstructions } from './CLIInstructions';

const { state } = vi.hoisted(() => ({
	state: { steps: [] as Array<{ title: string; code: string }> },
}));

vi.mock('./useCLISteps', () => ({ useCLISteps: () => state.steps }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

afterEach(cleanup);

it('copies the step that was clicked, also one added after the first render', async () => {
	const writeText = vi.fn(async () => undefined);
	Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
	const props = { defaultApplicationName: 'app', formState: { isValid: true } as never, watch: (() => '') as never };
	state.steps = [{ title: 'Install', code: 'npm install -g harper' }, { title: 'Deploy!', code: 'npm run deploy' }];
	const { rerender } = render(<CLIInstructions {...props} />);

	// A step appended behind an unchanged prefix: a memo keyed on the codes would keep the shorter list.
	state.steps = [...state.steps, { title: 'Push', code: 'git push origin main' }];
	rerender(<CLIInstructions {...props} />);
	const buttons = screen.getAllByRole('button').filter((button) => button.textContent === '');
	expect(buttons).toHaveLength(3);
	fireEvent.click(buttons[2]);
	await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('git push origin main'));
});
