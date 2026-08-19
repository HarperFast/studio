import { Input } from '@/components/ui/input';
import { MethodBadge } from '@/features/instance/apis/explorer/MethodBadge';
import { ApiAuth } from '@/features/instance/apis/explorer/request';
import { EndpointResourceNode } from '@/features/instance/apis/explorer/types';
import { cn } from '@/lib/cn';
import { ChevronDown, ChevronRight, Lock, LockOpen, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

const AUTH_TYPE_LABEL: Record<ApiAuth['type'], string> = {
	cookie: 'Cookie',
	basic: 'Basic',
	bearer: 'Bearer',
};

/**
 * The searchable, hierarchical list of operations: resource → path → method, with an "Authorize"
 * item pinned above the filter. Presentational apart from its own collapse state — it receives an
 * already-filtered tree plus the current filter text and selection, and reports selection, filter,
 * and settings-open changes upward. While a filter is active every resource is force-expanded so
 * matches are always visible.
 */
export function EndpointList({
	tree,
	totalCount,
	filteredCount,
	isFiltering,
	selectedId,
	onSelect,
	filter,
	onFilterChange,
	authType,
	settingsActive,
	onOpenSettings,
}: {
	tree: EndpointResourceNode[];
	totalCount: number;
	filteredCount: number;
	isFiltering: boolean;
	selectedId: string | undefined;
	onSelect: (id: string) => void;
	filter: string;
	onFilterChange: (value: string) => void;
	authType: ApiAuth['type'];
	settingsActive: boolean;
	onOpenSettings: () => void;
}) {
	// Resources are expanded by default; this set tracks the ones the user has explicitly collapsed.
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const toggle = (resource: string) =>
		setCollapsed(prev => {
			const next = new Set(prev);
			if (next.has(resource)) {
				next.delete(resource);
			} else {
				next.add(resource);
			}
			return next;
		});

	const usingHeaderAuth = authType === 'basic' || authType === 'bearer';

	return (
		<div className="flex h-full flex-col gap-3">
			<button
				type="button"
				onClick={onOpenSettings}
				aria-pressed={settingsActive}
				className={cn(
					'flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors',
					settingsActive
						? 'border-primary bg-primary/10 text-foreground'
						: 'border-border hover:bg-accent/60',
				)}
			>
				{usingHeaderAuth
					? <Lock className="text-green size-4 shrink-0" />
					: <LockOpen className="text-muted-foreground size-4 shrink-0" />}
				<span className="flex-1 font-medium">Authorize</span>
				<span className="text-muted-foreground text-xs">{AUTH_TYPE_LABEL[authType]}</span>
			</button>

			<div className="relative">
				<Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
				<Input
					value={filter}
					onChange={e => onFilterChange(e.target.value)}
					placeholder="Filter endpoints…"
					className="pl-8"
					aria-label="Filter endpoints"
				/>
			</div>

			<div className="flex-1 overflow-y-auto pr-1">
				{filteredCount === 0
					? (
						<p className="text-muted-foreground px-1 py-6 text-center text-sm">
							{totalCount === 0 ? 'No endpoints found in this spec.' : 'No endpoints match your filter.'}
						</p>
					)
					: (
						<div className="flex flex-col gap-1">
							{tree.map(resource => (
								<ResourceGroup
									key={resource.resource}
									resource={resource}
									// A filter forces every group open so matches can't hide inside a collapsed group.
									expanded={isFiltering || !collapsed.has(resource.resource)}
									onToggle={() => toggle(resource.resource)}
									selectedId={selectedId}
									onSelect={onSelect}
								/>
							))}
						</div>
					)}
			</div>
		</div>
	);
}

function ResourceGroup({
	resource,
	expanded,
	onToggle,
	selectedId,
	onSelect,
}: {
	resource: EndpointResourceNode;
	expanded: boolean;
	onToggle: () => void;
	selectedId: string | undefined;
	onSelect: (id: string) => void;
}) {
	const containsSelected = useMemo(
		() => resource.paths.some(p => p.operations.some(op => op.id === selectedId)),
		[resource, selectedId],
	);
	return (
		<div>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={expanded}
				className="text-foreground hover:bg-accent/60 flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left"
			>
				{expanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
				<span className="flex-1 truncate text-sm font-semibold">{resource.resource}</span>
				<span className="text-muted-foreground text-xs">{resource.operationCount}</span>
			</button>

			{expanded && (
				<div className="border-border/60 ml-3 flex flex-col gap-2 border-l pt-1 pl-2">
					{resource.paths.map(pathNode => (
						<div key={pathNode.path} className="flex flex-col gap-0.5">
							<span
								className={cn(
									'truncate px-1 font-mono text-xs',
									containsSelected ? 'text-foreground' : 'text-muted-foreground',
								)}
								title={pathNode.path}
							>
								{pathNode.path}
							</span>
							<ul className="border-border/40 ml-2 flex flex-col gap-0.5 border-l pl-2">
								{pathNode.operations.map(op => (
									<li key={op.id}>
										<button
											type="button"
											onClick={() => onSelect(op.id)}
											className={cn(
												'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors',
												op.id === selectedId ? 'bg-primary/10 ring-primary/30 ring-1' : 'hover:bg-accent/60',
											)}
										>
											<MethodBadge method={op.method} className="min-w-14" />
											{op.operation.summary && (
												<span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
													{op.operation.summary}
												</span>
											)}
										</button>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
