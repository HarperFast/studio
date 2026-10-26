import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useApplicationBranchedDatabases } from '@/features/instance/applications/hooks/useBranchedDatabases';
import { describeBranchedDatabases } from '@/integrations/api/instance/applications/branchedDatabases';
import { DatabaseIcon } from 'lucide-react';

export function PrivateCopyIndicator({ project }: { project: string }) {
	const { entityType } = useInstanceClientIdParams();
	const { setting } = useApplicationBranchedDatabases(project);
	if (!setting) {
		return null;
	}
	const databases = describeBranchedDatabases(setting);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button variant="ghost" type="button" className="cursor-help">
					<DatabaseIcon width={16} height={16} />
					<span className="hidden md:inline-block">Private copy: {databases}</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent className="max-w-sm">
				{project} runs on its own copy of{' '}
				{databases}. Its writes stay in the copy, and changes to the shared databases don&apos;t reach it.
				{entityType === 'cluster' && ' Each node keeps its own copy.'}
			</TooltipContent>
		</Tooltip>
	);
}
