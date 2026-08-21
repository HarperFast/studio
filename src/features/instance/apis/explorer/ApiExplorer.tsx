import { Badge } from '@/components/ui/badge';
import { authStore } from '@/features/auth/store/authStore';
import { EndpointList } from '@/features/instance/apis/explorer/EndpointList';
import { OperationDetail } from '@/features/instance/apis/explorer/OperationDetail';
import { ApiAuth, AuthMethod, isAuthorized } from '@/features/instance/apis/explorer/request';
import {
	ExplorerEntitySettings,
	forgetEntitySettings,
	readEntitySettings,
	writeEntitySettings,
} from '@/features/instance/apis/explorer/settings';
import { LoginController, SettingsPanel } from '@/features/instance/apis/explorer/SettingsPanel';
import {
	buildEndpointTree,
	buildServerOptions,
	flattenOperations,
	operationMatchesFilter,
} from '@/features/instance/apis/explorer/spec';
import { OpenApiSpec } from '@/features/instance/apis/explorer/types';
import {
	maxSidebarWidth,
	MIN_SIDEBAR_WIDTH,
	useResizableSidebar,
} from '@/features/instance/apis/explorer/useResizableSidebar';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { cn } from '@/lib/cn';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

/** The origin of a URL, or null if it can't be parsed — used to scope a credential to one server. */
function originOf(url: string | null): string | null {
	if (!url) {
		return null;
	}
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

/**
 * The custom Harper API explorer: a searchable operation list beside a detail pane, with an
 * "Authorize" view for server + auth. The token-minting callbacks come from the parent (`APIDocs`) so
 * the auth-client coupling stays there and this tree stays presentational.
 */
export function ApiExplorer(
	{ spec, baseURL, entityId, onSessionMint, onCredentialMint }: {
		spec: OpenApiSpec | undefined;
		baseURL: string | null;
		entityId: string;
		onSessionMint: () => Promise<string>;
		// Null when no direct instance URL is provable, which withholds the password fallback.
		onCredentialMint: ((credentials: { username: string; password: string }) => Promise<string>) | null;
	},
) {
	const allOperations = useMemo(() => flattenOperations(spec), [spec]);
	const serverOptions = useMemo(() => buildServerOptions(spec, baseURL), [spec, baseURL]);
	const [filter, setFilter] = useState('');
	const [view, setView] = useState<'operation' | 'settings'>('operation');
	const [authorizeTab, setAuthorizeTab] = useState<'docs' | 'try'>('docs');
	const [selectedId, setSelectedId] = useState<string | undefined>(() => allOperations[0]?.id);

	// Opening Authorize from the sidebar lands on Documentation; a deep-link from an auth-required
	// operation lands on the actionable "Try it out" log-in view.
	const openAuthorize = (targetTab: 'docs' | 'try') => {
		setAuthorizeTab(targetTab);
		setView('settings');
	};

	// Server + auth selections persist per entity in sessionStorage (this browser tab only), so
	// credentials never cross entities and are cleared when the tab closes. Ephemeral navigation state
	// (filter, selected endpoint, which pane is open) is deliberately not persisted.
	const [entitySettings, setEntitySettings] = useState(() => readEntitySettings(entityId));
	const updateEntitySettings = (patch: Partial<ExplorerEntitySettings>) => {
		writeEntitySettings(entityId, patch);
		setEntitySettings(prev => ({ ...prev, ...patch }));
	};

	const method: AuthMethod = entitySettings.method ?? 'login';
	const auth: ApiAuth = entitySettings.auth ?? { type: 'cookie' };

	// Mint race guard: each mint captures an attempt id; only the latest, on a still-mounted panel,
	// may apply its token. Clearing authorization or unmounting bumps the id so an in-flight mint that
	// resolves afterwards can't silently re-authorize.
	const attemptRef = useRef(0);
	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			attemptRef.current++;
		};
	}, []);
	const [loginStatus, setLoginStatus] = useState<'idle' | 'pending' | 'error'>('idle');
	const [loginError, setLoginError] = useState<string | null>(null);

	// When another tab signs this entity out, clear this tab's stored credential and reset auth state —
	// sessionStorage is per-tab, so a sign-out elsewhere can't reach it without this cross-tab signal.
	useEffect(() => {
		return authStore.onExplorerAuthInvalidated(entityId, () => {
			attemptRef.current++;
			forgetEntitySettings(entityId);
			setEntitySettings({});
			setLoginStatus('idle');
			setLoginError(null);
		});
	}, [entityId]);

	const runMint = async (mint: () => Promise<string>) => {
		const attempt = ++attemptRef.current;
		// Stamp the mint with the entity's sign-out epoch; a sign-out (this tab or another) advances it
		// so a mint resolving after logout can't write the old user's token back.
		const epoch = authStore.getExplorerAuthEpoch(entityId);
		setLoginStatus('pending');
		setLoginError(null);
		try {
			const token = await mint();
			if (!mountedRef.current || attempt !== attemptRef.current || authStore.getExplorerAuthEpoch(entityId) !== epoch) {
				return;
			}
			if (typeof token !== 'string' || token === '') {
				setLoginError('The instance did not return a usable token.');
				setLoginStatus('error');
				return;
			}
			updateEntitySettings({ method: 'login', auth: { type: 'bearer', token } });
			setLoginStatus('idle');
		} catch (error) {
			if (!mountedRef.current || attempt !== attemptRef.current) {
				return;
			}
			setLoginError(error instanceof Error ? error.message : 'Log in failed.');
			setLoginStatus('error');
		}
	};

	const login: LoginController = {
		status: loginStatus,
		error: loginError,
		runSession: () => runMint(onSessionMint),
		runCredentials: onCredentialMint ? credentials => runMint(() => onCredentialMint(credentials)) : null,
	};

	// Any explicit auth change invalidates a mint that's still in flight, so a slow session mint can't
	// resolve later and overwrite the credential the user just chose.
	const selectMethod = (next: AuthMethod) => {
		attemptRef.current++;
		if (next === 'cookie') {
			updateEntitySettings({ method: 'cookie', auth: { type: 'cookie' } });
		} else if (next === 'basic') {
			updateEntitySettings({
				method: 'basic',
				auth: auth.type === 'basic' ? auth : { type: 'basic', username: '', password: '' },
			});
		} else if (next === 'bearer') {
			updateEntitySettings({
				method: 'bearer',
				auth: auth.type === 'bearer' ? auth : { type: 'bearer', token: '' },
			});
		} else {
			// A bearer from the Bearer tab is not a login credential — only keep it when re-selecting Login
			// while already logged in; otherwise Login starts logged-out.
			updateEntitySettings({
				method: 'login',
				auth: method === 'login' && auth.type === 'bearer' ? auth : { type: 'cookie' },
			});
		}
		setLoginStatus('idle');
		setLoginError(null);
	};

	const applyBasic = (username: string, password: string) => {
		attemptRef.current++;
		updateEntitySettings({ method: 'basic', auth: { type: 'basic', username, password } });
	};
	const applyBearer = (token: string) => {
		attemptRef.current++;
		updateEntitySettings({ method: 'bearer', auth: { type: 'bearer', token } });
	};
	const clearAuth = () => {
		attemptRef.current++;
		setLoginStatus('idle');
		setLoginError(null);
		// Keep the user on their chosen method; just drop the credential it carries.
		const cleared: ApiAuth = method === 'basic'
			? { type: 'basic', username: '', password: '' }
			: method === 'bearer'
			? { type: 'bearer', token: '' }
			: { type: 'cookie' };
		updateEntitySettings({ auth: cleared });
	};

	const setSelectedServer = (url: string) => updateEntitySettings({ server: url });

	const activeServer = serverOptions.find(s => s.url === entitySettings.server)?.url
		?? serverOptions[0]?.url
		?? baseURL;
	const [copyServer] = useCopyToClipboard(activeServer ?? '');

	// The credential is scoped to the instance we authorized against (the computed REST origin). Send it
	// only when the active server shares that origin — whether the user picked another declared server or
	// the active server recomputed implicitly — so a token/credential never reaches a different origin.
	const trustedOrigin = originOf(baseURL);
	const effectiveAuth: ApiAuth = trustedOrigin !== null && originOf(activeServer) === trustedOrigin
		? auth
		: { type: 'cookie' };
	const authorized = isAuthorized(effectiveAuth);

	// Width drives a CSS variable applied only at lg+; below that the sidebar stacks full-width.
	const { width: sidebarWidth, isResizing, startResizing, handleKeyDown } = useResizableSidebar();
	const sidebarWidthVar = { '--api-sidebar-width': `${sidebarWidth}px` } as CSSProperties;

	const filteredOperations = useMemo(
		() => allOperations.filter(op => operationMatchesFilter(op, filter)),
		[allOperations, filter],
	);
	const filteredTree = useMemo(() => buildEndpointTree(filteredOperations), [filteredOperations]);

	const selectedOp = allOperations.find(op => op.id === selectedId) ?? allOperations[0];

	function selectOperation(id: string) {
		setSelectedId(id);
		setView('operation');
	}

	return (
		// On lg this is a fixed-height app-shell (its parent sets the height): the header takes its
		// natural space and the two-pane row fills the rest, so the sidebar reaches the viewport bottom
		// exactly and the panes scroll internally instead of the page — no page-plus-tree double scroll.
		<div className="flex flex-col gap-5 lg:min-h-0 lg:flex-1">
			<header className="flex min-w-0 flex-col lg:shrink-0">
				<div className="flex items-center gap-2">
					<h1 className="font-radioGrotesk truncate text-2xl">{spec?.info?.title ?? 'API Explorer'}</h1>
					{spec?.info?.version && <Badge variant="secondary">v{spec.info.version}</Badge>}
				</div>
				{spec?.info?.description && <p className="text-muted-foreground mt-1 text-sm">{spec.info.description}</p>}
			</header>

			{allOperations.length === 0
				? (
					<div className="border-border text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
						This spec doesn&apos;t define any endpoints yet.
					</div>
				)
				: (
					<div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch">
						<aside
							style={sidebarWidthVar}
							// overflow-y-clip (not -hidden) so a broken min-h-0 chain can't paint the tree over the
							// detail pane, while the resize handle still extends horizontally into the gap.
							className="relative w-full shrink-0 overflow-y-clip lg:h-full lg:min-h-0 lg:w-[var(--api-sidebar-width)]"
						>
							<EndpointList
								tree={filteredTree}
								totalCount={allOperations.length}
								filteredCount={filteredOperations.length}
								isFiltering={filter.trim() !== ''}
								selectedId={view === 'operation' ? selectedOp?.id : undefined}
								onSelect={selectOperation}
								filter={filter}
								onFilterChange={setFilter}
								method={method}
								authorized={authorized}
								settingsActive={view === 'settings'}
								onOpenSettings={() => openAuthorize('docs')}
							/>
							{
								/* Drag (or focus + Arrow keys) to resize the sidebar — lg+ only; below that it stacks
								   full-width. The grab zone straddles the aside's right edge into the inter-pane gap so
								   it doesn't fight the tree's scrollbar; only the thin centered line shows (on
								   hover / drag / focus). */
							}
							<div
								role="separator"
								tabIndex={0}
								aria-orientation="vertical"
								aria-label="Resize sidebar"
								aria-valuenow={sidebarWidth}
								aria-valuemin={MIN_SIDEBAR_WIDTH}
								aria-valuemax={maxSidebarWidth(window.innerWidth)}
								onMouseDown={startResizing}
								onKeyDown={handleKeyDown}
								className="group absolute top-0 right-0 bottom-0 z-40 hidden w-4 translate-x-1/2 cursor-col-resize outline-none lg:block"
							>
								<div
									className={cn(
										'absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 transition-colors',
										'group-hover:bg-violet-400/60 dark:group-hover:bg-violet-500/60 group-focus-visible:bg-violet-500/80',
										isResizing && 'bg-violet-400/60 dark:bg-violet-500/60',
									)}
								/>
							</div>
						</aside>

						<main className="min-w-0 flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pb-6">
							{view === 'settings'
								? (
									<SettingsPanel
										spec={spec}
										method={method}
										auth={auth}
										authorized={authorized}
										tab={authorizeTab}
										onTabChange={setAuthorizeTab}
										onSelectMethod={selectMethod}
										onApplyBasic={applyBasic}
										onApplyBearer={applyBearer}
										onClearAuth={clearAuth}
										login={login}
										serverOptions={serverOptions}
										activeServer={activeServer ?? undefined}
										onServerChange={setSelectedServer}
										onCopyServer={copyServer}
									/>
								)
								: selectedOp
								? (
									<OperationDetail
										// Re-mount per operation so all try-it-out inputs reset cleanly on selection change.
										key={selectedOp.id}
										op={selectedOp}
										spec={spec}
										baseURL={activeServer ?? null}
										auth={effectiveAuth}
										authorized={authorized}
										onOpenAuthorize={() => openAuthorize('try')}
									/>
								)
								: <p className="text-muted-foreground text-sm">Select an endpoint to see its documentation.</p>}
						</main>
					</div>
				)}
		</div>
	);
}
