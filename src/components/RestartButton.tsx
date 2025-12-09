import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/buttonVariants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useRestartClusterClick } from '@/hooks/useRestartClusterClick';
import { useRestartInstanceClick } from '@/hooks/useRestartInstanceClick';
import { cx, VariantProps } from 'class-variance-authority';
import { RotateCcwIcon } from 'lucide-react';

interface RestartButtonParams extends InstanceClientConfig, VariantProps<typeof buttonVariants> {
	className?: string;
	disabled?: boolean;
	hideText?: boolean;
	operation: 'restart_service' | 'restart';
	targetNoun: 'Instance' | 'Cluster';
	tooltip?: string;
}

export function RestartButton({
	className,
	disabled,
	hideText,
	instanceClient,
	operation,
	targetNoun,
	tooltip,
	variant,
}: RestartButtonParams) {
	const {
		onRestartClick: onRestartClusterClick,
		isRestartPending: isRestartClusterPending,
	} = useRestartClusterClick();
	const { onRestartClick, isRestartPending } = useRestartInstanceClick({ operation, instanceClient });
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant={variant || 'positiveOutline'}
					className={cx('mx-0 md:mx-4 rounded-full', className)}
					onClick={targetNoun === 'Cluster' && operation === 'restart' ? onRestartClusterClick : onRestartClick}
					disabled={disabled || isRestartPending || isRestartClusterPending}
				>
					<RotateCcwIcon className="pointer-events-none" />
					{hideText !== true && <span className="hidden md:inline-block pointer-events-none">Restart {targetNoun}
					</span>}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{tooltip
					? tooltip
					: operation === 'restart_service'
					? 'Restarts all service threads to apply changes. No downtime expected. Performance may be briefly slower during restart.'
					: 'This fully restarts the Harper service and causes downtime.'}
			</TooltipContent>
		</Tooltip>
	);
}
