import { isCloning } from '@/components/ui/utils/badgeStatus';
import {
	clonePercent,
	type CloneProgress,
	cloneProgressOf,
	describeCloneProgress,
} from '@/features/cluster/cloneProgress';
import { useNow } from '@/hooks/useNow';
import type { Instance } from '@/integrations/api/api.patch';
import { byInstanceFqdnThenPort } from '@/lib/arrays/sort/byInstanceFqdnThenPort';
import { cn } from '@/lib/cn';

export function InstanceCloneProgress({ instance, className }: { instance: Instance; className?: string }) {
	const progress = cloneProgressOf(instance);
	// Checked before the clock subscribes, so non-cloning rows never re-render on its tick.
	return progress ? <CloneProgressBar progress={progress} className={className} /> : null;
}

function CloneProgressBar({ progress, className }: { progress: CloneProgress; className?: string }) {
	const now = useNow();
	const description = describeCloneProgress(progress, now);
	const percent = progress.ratio === undefined ? undefined : clonePercent(progress.ratio);
	return (
		<div className={cn('flex flex-col gap-1', className)}>
			<div
				role="progressbar"
				aria-label="Data sync progress"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={percent}
				aria-valuetext={description}
				className="h-1.5 w-full rounded-full overflow-clip bg-muted"
			>
				{percent === undefined
					// Hatched, not filled: a solid full-width bar would read as 100%.
					? (
						<div className="h-full w-full animate-pulse bg-[repeating-linear-gradient(-45deg,transparent,transparent_5px,var(--color-yellow)_5px,var(--color-yellow)_9px)] opacity-80 motion-reduce:animate-none" />
					)
					: (
						<div
							style={{ width: `${percent}%` }}
							className="h-full bg-yellow/80 transition-[width] duration-1000 ease-in-out motion-reduce:transition-none"
						/>
					)}
			</div>
			<span className="text-xs text-muted-foreground font-light">{description}</span>
		</div>
	);
}

export function CloneProgressList({ instances }: { instances: readonly Instance[] | undefined }) {
	const cloning = (instances ?? []).filter((instance) => isCloning(instance.status)).sort(byInstanceFqdnThenPort);
	if (!cloning.length) {
		return null;
	}
	return (
		<ul className="flex flex-col gap-3" aria-label="Instances syncing data">
			{cloning.map((instance) => (
				<li key={instance.id} className="flex flex-col gap-1">
					<span className="text-sm">{instance.name || instance.instanceFqdn}</span>
					<InstanceCloneProgress instance={instance} />
				</li>
			))}
		</ul>
	);
}
