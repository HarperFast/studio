/** @vitest-environment jsdom */
import { ApiExplorer } from '@/features/instance/apis/explorer/ApiExplorer';
import { OpenApiSpec } from '@/features/instance/apis/explorer/types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The Try-it-out tab (not exercised here) is the only thing that mounts Monaco; mock it so importing
// the tree never pulls the editor in, matching how the repo's other component tests handle Monaco.
vi.mock('@/lib/monaco/MonacoEditor', () => ({ Editor: () => null, MonacoEditor: () => null }));
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'light' }));

const spec: OpenApiSpec = {
	info: { title: 'Test API', version: '1.0.0' },
	paths: {
		'/leaderboard/': { get: { description: 'list scores', responses: { '200': { description: 'ok' } } } },
		'/game/{id}': {
			get: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: {} },
			post: {
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
				responses: {},
			},
		},
	},
	components: {
		securitySchemes: { basicAuth: { type: 'http', scheme: 'basic' }, bearerAuth: { type: 'http', scheme: 'bearer' } },
	},
};

function renderExplorer() {
	return render(<ApiExplorer spec={spec} baseURL="http://localhost:9926" entityId="ins-test" />);
}

describe('ApiExplorer', () => {
	// Radix reads these pointer APIs jsdom doesn't implement (see AGENTS.md).
	beforeAll(() => {
		Element.prototype.hasPointerCapture = () => false;
		Element.prototype.scrollIntoView = () => {};
	});
	beforeEach(() => localStorage.clear());
	afterEach(cleanup);

	it('renders the resource → path → method hierarchy and the first operation by default', () => {
		renderExplorer();
		expect(screen.getByText('leaderboard')).toBeTruthy();
		expect(screen.getByText('game')).toBeTruthy();
		// The initially-selected GET /leaderboard/ shows its documentation (Responses only appears there).
		expect(screen.getByText('Responses')).toBeTruthy();
	});

	it('takes over the detail pane with Server + Authorization when Authorize is clicked', () => {
		renderExplorer();
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		expect(screen.getByRole('heading', { name: 'Server' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Authorization' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Cookie' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Bearer token' })).toBeTruthy();
		// The operation docs are replaced, not merely appended.
		expect(screen.queryByText('Responses')).toBeNull();
	});

	it('selecting an operation from the sidebar shows its documentation', () => {
		renderExplorer();
		// Exactly one POST in the spec, so its method button is unambiguous.
		fireEvent.click(screen.getByRole('button', { name: 'post' }));
		expect(screen.getByText('Request body')).toBeTruthy();
	});

	it('renders a resize separator wired to the persisted sidebar width', () => {
		const { container } = renderExplorer();
		const separator = screen.getByRole('separator', { name: 'Resize sidebar' });
		expect(separator.getAttribute('aria-valuenow')).toBe('320');
		expect(separator.getAttribute('aria-valuemin')).toBe('240');
		expect(separator.getAttribute('aria-valuemax')).toBe('512'); // half of jsdom's 1024 innerWidth
		const aside = container.querySelector('aside');
		expect(aside?.style.getPropertyValue('--api-sidebar-width')).toBe('320px');
	});

	it('binds a path-parameter input into the built request URL', () => {
		renderExplorer();
		// The single POST is unambiguous; its Monaco body editor is mocked out above, so this
		// exercises the path-input → built-request wiring.
		fireEvent.click(screen.getByRole('button', { name: 'post' }));
		// Radix tabs use automatic (focus-based) activation.
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.change(screen.getByPlaceholderText('id'), { target: { value: '42' } });
		expect(screen.getByText('http://localhost:9926/game/42')).toBeTruthy();
	});
});
