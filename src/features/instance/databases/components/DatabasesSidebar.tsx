import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { DatabasesTree } from './DatabasesTree';

export function DatabasesSidebar({ instanceDatabaseMap }: { instanceDatabaseMap?: InstanceDatabaseMap }) {
	const loading = !instanceDatabaseMap;

	return (
		<div className="pl-3 flex flex-col h-full min-h-0">
			<h1 className="pt-3 pb-3 text-3xl shrink-0">Databases</h1>
			{loading
				? <TextLoadingSkeleton className="w-full flex-1 min-h-0 rounded-md" />
				: (
					<div className="flex-1 min-h-0">
						<DatabasesTree instanceDatabaseMap={instanceDatabaseMap} />
					</div>
				)}
		</div>
	);
}
