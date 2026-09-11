import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getDescribeAllQueryOptions } from '@/integrations/api/instance/database/getDescribeAll';
import { cn } from '@/lib/cn';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from '@tanstack/react-router';
import { CSSProperties } from 'react';
import { DatabaseActionModals } from './components/DatabaseActionModals';
import { DatabaseOverview } from './components/DatabaseOverview';
import { DatabasesSidebar } from './components/DatabasesSidebar';
import { DatabaseTableView } from './components/DatabaseTableView';
import { resolveDatabasesRedirect } from './functions/resolveDatabasesRedirect';
import { maxSidebarWidth, MIN_SIDEBAR_WIDTH, useResizableDatabasesSidebar } from './hooks/useResizableDatabasesSidebar';

export function Databases() {
	const params: {
		clusterId?: string;
		instanceId?: string;
		databaseName?: string;
		tableName?: string;
	} = useParams({ strict: false });

	const instanceParams = useInstanceClientIdParams();
	// Skip the per-table record-count scan here: the sidebar and table view only need schema to render,
	// and the selected table's count is fetched separately (see DatabaseTableView / DatabaseOverview) so
	// a slow count never blocks the database tree or the first page of records from appearing.
	const { data: instanceDatabaseMap } = useQuery(
		getDescribeAllQueryOptions({ ...instanceParams, skipRecordCount: true }),
	);

	const { width: sidebarWidth, isResizing, startResizing, handleKeyDown } = useResizableDatabasesSidebar();
	// Drive the width through a CSS variable so it only applies at md+ (mobile stays full-width, stacked).
	const sidebarWidthVar = { '--db-sidebar-width': `${sidebarWidth}px` } as CSSProperties;

	// Land on the first database's overview when nothing is selected, and recover from stale links to a
	// dropped database/table (see resolveDatabasesRedirect for the exact rules + loop-freedom).
	const redirect = resolveDatabasesRedirect(instanceDatabaseMap, params);
	if (redirect) {
		return (
			<Navigate
				to={buildAbsoluteLinkToDatabasePage({ ...params, ...redirect })}
				replace={true}
			/>
		);
	}

	return (
		<>
			{
				/* gap only while stacked: from md up the table pane sits flush against the sidebar's
			    divider and insets its own toolbar/footer instead, so the grid itself is full-width. */
			}
			<main className="flex flex-col gap-4 md:gap-0 md:flex-row md:items-start">
				<section
					style={sidebarWidthVar}
					// overflow-y-clip (not overflow-hidden) so the tree is still clipped vertically while the
					// resize handle's line can extend horizontally over the divider.
					className="relative text-foreground w-full md:w-[var(--db-sidebar-width)] md:shrink-0 md:border-r-2 border-border flex flex-col min-h-0 md:sticky md:top-32 md:h-[calc(100vh-(--spacing(32)))] md:max-h-[calc(100vh-(--spacing(32)))] overflow-y-clip"
				>
					<DatabasesSidebar instanceDatabaseMap={instanceDatabaseMap} />
					{
						/* Drag (or focus + Arrow keys) to resize the sidebar (md+ only; mobile stacks full-width).
					    The grab zone sits entirely PAST the divider, in the table pane's first few pixels,
					    because both neighbouring strips are already spoken for: inside the sidebar is the
					    tree's own 10px scrollbar (`.app-tree-scroll`), which a handle over it would make
					    undraggable, and the pane is flush now, so reaching further in would shadow the
					    selection gutter's checkbox. 8px clears the checkbox (centred in a 32px gutter)
					    and leaves the scrollbar alone. Only the thin line over the divider is visible
					    (on hover / drag / focus). */
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
						className="group hidden md:block absolute top-0 bottom-0 left-full w-2 z-40 cursor-col-resize outline-none"
					>
						<div
							className={cn(
								'absolute inset-y-0 left-0 w-1 -translate-x-1/2 transition-colors',
								'group-hover:bg-violet-400/60 dark:group-hover:bg-violet-500/60 group-focus-visible:bg-violet-500/80',
								isResizing && 'bg-violet-400/60 dark:bg-violet-500/60',
							)}
						/>
					</div>
				</section>
				<section // Bounded to the viewport (like the sidebar beside it) so the table pane scrolls inside
				 // itself rather than growing the page: a wide table then scrolls horizontally in its own
				// container instead of widening the whole window.
				className="text-foreground w-full md:flex-1 md:min-w-0 flex flex-col min-h-0 h-[calc(100vh-(--spacing(32)))]">
					{params.databaseName && params.tableName
						? (
							<DatabaseTableView
								instanceDatabaseMap={instanceDatabaseMap}
								databaseName={params.databaseName}
								tableName={params.tableName}
							/>
						)
						: params.databaseName
						? (
							// The pane is viewport-height now, so the overview scrolls inside it.
							<div className="min-h-0 grow overflow-y-auto">
								<DatabaseOverview
									instanceDatabaseMap={instanceDatabaseMap}
									databaseName={params.databaseName}
								/>
							</div>
						)
						: null}
				</section>
			</main>
			{instanceDatabaseMap && <DatabaseActionModals instanceDatabaseMap={instanceDatabaseMap} />}
		</>
	);
}
