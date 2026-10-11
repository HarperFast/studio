/**
 * @vitest-environment jsdom
 */
import { Form } from '@/components/ui/form/Form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ImportAuthorization } from './ImportAuthorization';
import { defaultImportOptions, NewApplicationSchema } from './schema';

interface FakeKey {
	name: string;
	host: string;
	hostname?: string;
}

const instance = vi.hoisted(() => ({ keys: [] as FakeKey[], getKeyPending: false }));

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({}),
	Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_path: string, body: { operation: string; name?: string }) => {
			if (body.operation === 'list_ssh_keys') {
				return { data: instance.keys };
			}
			if (instance.getKeyPending) {
				return new Promise(() => {});
			}
			return { data: { key: '', ...instance.keys.find(key => key.name === body.name) } };
		},
	};
	const params = { instanceClient, entityId: 'entity-1', entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
	cleanup();
	instance.keys = [];
	instance.getKeyPending = false;
});

const NO_SSH_KEY_USED = /only uses an SSH key for an SSH URL/;

function Harness({ url, sshKeyName = '', requiresAuth = true }: {
	url: string;
	sshKeyName?: string;
	requiresAuth?: boolean;
}) {
	const methods = useForm<z.infer<typeof NewApplicationSchema>>({
		defaultValues: {
			applicationName: 'app',
			contents: { ...defaultImportOptions, ref: url, sshKeyName, requiresAuth },
		},
	});
	const contents = methods.watch('contents');
	return (
		<Form {...methods}>
			<ImportAuthorization control={methods.control} setValue={methods.setValue} watch={methods.watch} />
			<output data-testid="ref">{contents.type === 'import' ? contents.ref : ''}</output>
		</Form>
	);
}

// Seeding the cache renders the keys on the first pass, so an assertion that an alert is absent
// cannot pass merely because they had not loaded yet.
function renderAuthorization(props: Parameters<typeof Harness>[0]) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	queryClient.setQueryData(['entity-1', 'list_ssh_keys'], instance.keys);
	if (!instance.getKeyPending) {
		for (const key of instance.keys) {
			queryClient.setQueryData(['entity-1', 'get_ssh_key', key.name], { key: '', ...key });
		}
	}
	return render(
		<QueryClientProvider client={queryClient}>
			<Harness {...props} />
		</QueryClientProvider>,
	);
}

describe('ImportAuthorization', () => {
	it('warns that an HTTPS URL will not use the SSH key, instead of confirming the host matches', () => {
		instance.keys = [{ name: 'work', host: 'work.github.com', hostname: 'github.com' }];
		renderAuthorization({ url: 'https://work.github.com/acme/widgets.git', sshKeyName: 'work' });

		expect(screen.queryByText(/matching the selected key/)).toBeNull();
		expect(screen.getByText(NO_SSH_KEY_USED)).toBeTruthy();
	});

	it("suggests the SSH URL on the selected key's host alias and applies it", () => {
		instance.keys = [{ name: 'work', host: 'work.github.com', hostname: 'github.com' }];
		renderAuthorization({ url: 'https://github.com/acme/widgets.git', sshKeyName: 'work' });

		expect(screen.queryByText('https://work.github.com/acme/widgets.git')).toBeNull();
		expect(screen.getByText('git@work.github.com:acme/widgets.git')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Use SSH URL' }));
		expect(screen.getByTestId('ref').textContent).toBe('git@work.github.com:acme/widgets.git');
		expect(screen.getByText(/matching the selected key/)).toBeTruthy();
		expect(screen.queryByText(NO_SSH_KEY_USED)).toBeNull();
	});

	it("takes the alias from the key list while the selected key's details are still loading", () => {
		instance.keys = [{ name: 'work', host: 'work.github.com', hostname: 'github.com' }];
		instance.getKeyPending = true;
		renderAuthorization({ url: 'https://github.com/acme/widgets.git', sshKeyName: 'work' });

		expect(screen.getByText('git@work.github.com:acme/widgets.git')).toBeTruthy();
		expect(screen.queryByText('git@github.com:acme/widgets.git')).toBeNull();
	});

	it('offers no one-click URL before a key is chosen, since the bare host reaches no key', async () => {
		renderAuthorization({ url: 'https://github.com/acme/widgets.git' });

		expect(await screen.findByText(NO_SSH_KEY_USED)).toBeTruthy();
		expect(screen.getByText(/the host alias of the SSH key for this repository/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Use SSH URL' })).toBeNull();
	});

	it("names the key's alias but does not guess the SSH path for a host it cannot map", () => {
		instance.keys = [{ name: 'app', host: 'app.git.example.com', hostname: 'git.example.com' }];
		renderAuthorization({ url: 'https://git.example.com/team/app.git', sshKeyName: 'app' });

		expect(screen.getByText(NO_SSH_KEY_USED)).toBeTruthy();
		expect(screen.getByText('app.git.example.com')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Use SSH URL' })).toBeNull();
	});

	it('does not move the URL onto a key that serves a different git host', () => {
		instance.keys = [{ name: 'lab', host: 'lab.gitlab.com', hostname: 'gitlab.com' }];
		renderAuthorization({ url: 'https://github.com/acme/widgets.git', sshKeyName: 'lab' });

		expect(screen.getByText(NO_SSH_KEY_USED)).toBeTruthy();
		expect(screen.queryByText(/lab\.gitlab\.com:acme/)).toBeNull();
		expect(screen.queryByRole('button', { name: 'Use SSH URL' })).toBeNull();
	});

	it("treats a key that doesn't report its git host as unknown, not as a match", () => {
		instance.keys = [{ name: 'lab', host: 'lab.gitlab.com' }];
		renderAuthorization({ url: 'https://github.com/acme/widgets.git', sshKeyName: 'lab' });

		expect(screen.getByText(NO_SSH_KEY_USED)).toBeTruthy();
		expect(screen.queryByText(/lab\.gitlab\.com:acme/)).toBeNull();
		expect(screen.queryByRole('button', { name: 'Use SSH URL' })).toBeNull();
	});

	it('still confirms an SSH URL whose host matches the selected key', () => {
		instance.keys = [{ name: 'work', host: 'work.github.com', hostname: 'github.com' }];
		renderAuthorization({ url: 'git@work.github.com:acme/widgets.git', sshKeyName: 'work' });

		expect(screen.getByText(/matching the selected key/)).toBeTruthy();
		expect(screen.queryByText(NO_SSH_KEY_USED)).toBeNull();
	});

	it('says nothing about HTTPS for a public import', () => {
		renderAuthorization({ url: 'https://github.com/acme/widgets.git', requiresAuth: false });

		expect(screen.queryByText(NO_SSH_KEY_USED)).toBeNull();
	});
});
