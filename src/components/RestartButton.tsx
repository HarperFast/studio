import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useRestartClick } from '@/hooks/useRestartClick';

interface RestartButtonParams extends InstanceClientConfig {
	targetNoun: 'Instance' | 'Cluster';
	operation: 'restart_service' | 'restart';
}

export function RestartButton({
	targetNoun,
	instanceClient,
	operation,
}: RestartButtonParams) {
	const { onRestartClick, isRestartPending } = useRestartClick({ targetNoun, operation, instanceClient });
	return (<Tooltip>
		<TooltipTrigger asChild>
			<Button
				variant="positiveOutline"
				className="ml-4 rounded-full cursor-pointer"
				onClick={onRestartClick}
				disabled={isRestartPending}
			>
				Restart {targetNoun}
			</Button>
		</TooltipTrigger>
		<TooltipContent>
			{operation === 'restart_service'
				? 'Restarts all service threads to apply changes. No downtime expected. Performance may be briefly slower during restart.'
				: 'This fully restarts the Harper service and causes downtime.'}
		</TooltipContent>
	</Tooltip>);
}
