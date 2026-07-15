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
			<main className="flex flex-col gap-4 md:flex-row md:items-start">
				<section
					style={sidebarWidthVar}
					// overflow-y-clip (not overflow-hidden) so the tree is still clipped vertically while the
					// resize handle can extend horizontally into the gap between the panes.
					className="relative text-foreground w-full md:w-[var(--db-sidebar-width)] md:shrink-0 md:border-r border-border flex flex-col min-h-0 md:sticky md:top-32 md:h-[calc(100vh-(--spacing(32)))] md:max-h-[calc(100vh-(--spacing(32)))] overflow-y-clip"
				>
					<DatabasesSidebar instanceDatabaseMap={instanceDatabaseMap} />
					{
						/* Drag (or focus + Arrow keys) to resize the sidebar (md+ only; mobile stacks full-width).
					    The grab zone straddles the edge into the inter-pane gap so it doesn't fight the tree's
					    scrollbar; only the thin centered line is visible (on hover / drag / focus). */
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
						className="group hidden md:block absolute top-0 bottom-0 right-0 w-4 translate-x-1/2 z-40 cursor-col-resize outline-none"
					>
						<div
							className={cn(
								'absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 transition-colors',
								'group-hover:bg-violet-400/60 dark:group-hover:bg-violet-500/60 group-focus-visible:bg-violet-500/80',
								isResizing && 'bg-violet-400/60 dark:bg-violet-500/60',
							)}
						/>
					</div>
				</section>
				<section className="text-foreground w-full md:flex-1 md:min-w-0 flex flex-col min-h-0">
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
							<DatabaseOverview
								instanceDatabaseMap={instanceDatabaseMap}
								databaseName={params.databaseName}
							/>
						)
						: null}
				</section>
			</main>
			{instanceDatabaseMap && <DatabaseActionModals instanceDatabaseMap={instanceDatabaseMap} />}
		</>
	);
}
