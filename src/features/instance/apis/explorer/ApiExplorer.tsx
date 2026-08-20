import { Badge } from '@/components/ui/badge';
import { EndpointList } from '@/features/instance/apis/explorer/EndpointList';
import { OperationDetail } from '@/features/instance/apis/explorer/OperationDetail';
import { ApiAuth } from '@/features/instance/apis/explorer/request';
import { readEntitySettings, writeEntitySettings } from '@/features/instance/apis/explorer/settings';
import { SettingsPanel } from '@/features/instance/apis/explorer/SettingsPanel';
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
import { type CSSProperties, useEffect, useMemo, useState } from 'react';

/**
 * The custom Harper API explorer: a hierarchical, searchable list of the spec's operations alongside
 * a detail pane. The sidebar's "Authorize" item takes over the detail pane with Server + Auth
 * settings; selecting an endpoint shows its documentation and an interactive "Try it out" runner.
 * Built entirely from the in-house design system — this replaces the previous Swagger UI embed.
 *
 * The CORS warning/enable flow that wraps this component lives in the parent (`APIDocs`).
 */
export function ApiExplorer(
	{ spec, baseURL, entityId }: { spec: OpenApiSpec | undefined; baseURL: string | null; entityId: string },
) {
	const allOperations = useMemo(() => flattenOperations(spec), [spec]);
	const serverOptions = useMemo(() => buildServerOptions(spec, baseURL), [spec, baseURL]);
	const [filter, setFilter] = useState('');
	const [view, setView] = useState<'operation' | 'settings'>('operation');
	const [selectedId, setSelectedId] = useState<string | undefined>(() => allOperations[0]?.id);

	// Server + auth selections persist per entity, so credentials for one instance never apply to
	// another. Writes go straight to localStorage via a fresh read-merge-write (see settings.ts) so a
	// concurrent sign-out in another tab isn't clobbered; local state mirrors it for rendering and
	// refreshes on the cross-tab `storage` event. Ephemeral navigation state (filter, selected
	// endpoint, which pane is open) is deliberately not persisted.
	const [entitySettings, setEntitySettings] = useState(() => readEntitySettings(entityId));
	useEffect(() => {
		const refresh = () => setEntitySettings(readEntitySettings(entityId));
		window.addEventListener('storage', refresh);
		return () => window.removeEventListener('storage', refresh);
	}, [entityId]);
	const updateEntitySettings = (patch: { auth?: ApiAuth; server?: string }) => {
		writeEntitySettings(entityId, patch);
		setEntitySettings(prev => ({ ...prev, ...patch }));
	};

	const auth = entitySettings.auth ?? { type: 'cookie' };
	const setAuth = (next: ApiAuth) => updateEntitySettings({ auth: next });
	const setSelectedServer = (url: string) => updateEntitySettings({ server: url });

	const activeServer = serverOptions.find(s => s.url === entitySettings.server)?.url
		?? serverOptions[0]?.url
		?? baseURL;
	const [copyServer] = useCopyToClipboard(activeServer ?? '');

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
								authType={auth.type}
								settingsActive={view === 'settings'}
								onOpenSettings={() => setView('settings')}
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
										auth={auth}
										onAuthChange={setAuth}
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
										auth={auth}
									/>
								)
								: <p className="text-muted-foreground text-sm">Select an endpoint to see its documentation.</p>}
						</main>
					</div>
				)}
		</div>
	);
}
