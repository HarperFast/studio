import { isCloning } from '@/components/ui/utils/badgeStatus';
import { type CloneProgress, cloneProgressOf, describeCloneProgress } from '@/features/cluster/cloneProgress';
import { useNow } from '@/hooks/useNow';
import type { Instance } from '@/integrations/api/api.patch';
import { byInstanceFqdnThenPort } from '@/lib/arrays/sort/byInstanceFqdnThenPort';
import { cn } from '@/lib/cn';
import { ClockIcon, RefreshCwIcon } from 'lucide-react';

export function InstanceCloneProgress({ instance, className }: { instance: Instance; className?: string }) {
	const progress = cloneProgressOf(instance);
	if (!progress) {
		return null;
	}
	// A pending copy has no age to show, so it skips the clock.
	return progress.waiting
		? <CloneProgressLine waiting description={describeCloneProgress(progress, Date.now())} className={className} />
		: <ActiveCloneProgress progress={progress} className={className} />;
}

function ActiveCloneProgress({ progress, className }: { progress: CloneProgress; className?: string }) {
	const now = useNow();
	return <CloneProgressLine description={describeCloneProgress(progress, now)} className={className} />;
}

function CloneProgressLine(
	{ description, waiting, className }: { description: string; waiting?: boolean; className?: string },
) {
	const Icon = waiting ? ClockIcon : RefreshCwIcon;
	return (
		<div className={cn('flex items-center gap-1.5 text-xs font-light text-muted-foreground', className)}>
			<Icon
				aria-hidden="true"
				className={cn(
					'size-3.5 shrink-0',
					waiting
						? 'text-muted-foreground'
						: 'text-yellow animate-[spin_2.5s_linear_infinite] motion-reduce:animate-none',
				)}
			/>
			<span>{description}</span>
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
