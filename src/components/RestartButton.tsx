import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/buttonVariants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useRestartClusterClick } from '@/hooks/useRestartClusterClick';
import { useRestartInstanceClick } from '@/hooks/useRestartInstanceClick';
import { cx, VariantProps } from 'class-variance-authority';
import { RotateCcwIcon } from 'lucide-react';

interface RestartButtonParams extends InstanceClientConfig, VariantProps<typeof buttonVariants> {
	targetNoun: 'Instance' | 'Cluster';
	operation: 'restart_service' | 'restart';
	className?: string;
	disabled?: boolean;
}

export function RestartButton({
	targetNoun,
	instanceClient,
	operation,
	variant,
	className,
	disabled,
}: RestartButtonParams) {
	const {
		onRestartClick: onRestartClusterClick,
		isRestartPending: isRestartClusterPending,
	} = useRestartClusterClick();
	const { onRestartClick, isRestartPending } = useRestartInstanceClick({ operation, instanceClient });
	return (<Tooltip>
		<TooltipTrigger asChild>
			<Button
				variant={variant || 'positiveOutline'}
				className={cx('mx-0 md:mx-4 rounded-full', className)}
				onClick={targetNoun === 'Cluster' && operation === 'restart' ? onRestartClusterClick : onRestartClick}
				disabled={disabled || isRestartPending || isRestartClusterPending}
			>
				<RotateCcwIcon />
				<span className="hidden md:inline-block">Restart {targetNoun}</span>
			</Button>
		</TooltipTrigger>
		<TooltipContent>
			{operation === 'restart_service'
				? 'Restarts all service threads to apply changes. No downtime expected. Performance may be briefly slower during restart.'
				: 'This fully restarts the Harper service and causes downtime.'}
		</TooltipContent>
	</Tooltip>);
}
