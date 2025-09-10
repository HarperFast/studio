import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useRestartClusterClick } from '@/hooks/useRestartClusterClick';
import { useRestartInstanceClick } from '@/hooks/useRestartInstanceClick';
import { RotateCcwIcon } from 'lucide-react';

interface RestartButtonParams extends InstanceClientConfig {
	targetNoun: 'Instance' | 'Cluster';
	operation: 'restart_service' | 'restart';
}

export function RestartButton({
	targetNoun,
	instanceClient,
	operation,
}: RestartButtonParams) {
	const {
		onRestartClick: onRestartClusterClick,
		isRestartPending: isRestartClusterPending,
	} = useRestartClusterClick();
	const { onRestartClick, isRestartPending } = useRestartInstanceClick({ targetNoun, operation, instanceClient });
	return (<Tooltip>
		<TooltipTrigger asChild>
			<Button
				variant="positiveOutline"
				className="mx-0 md:mx-4 rounded-full cursor-pointer"
				onClick={targetNoun === 'Cluster' && operation === 'restart' ? onRestartClusterClick : onRestartClick}
				disabled={isRestartPending || isRestartClusterPending}
			>
			<RotateCcwIcon /> Restart {targetNoun}
			</Button>
		</TooltipTrigger>
		<TooltipContent>
			{operation === 'restart_service'
				? 'Restarts all service threads to apply changes. No downtime expected. Performance may be briefly slower during restart.'
				: 'This fully restarts the Harper service and causes downtime.'}
		</TooltipContent>
	</Tooltip>);
}
