import { Server } from 'lucide-react';

export function PendingOwnerSetup() {
	return (
		<div className="text-center py-12">
			<Server className="size-12 text-muted-foreground mx-auto mb-4" />
			<h1 className="text-xl font-medium mb-2 text-foreground">Pending Owner Setup</h1>
			<p className="text-sm text-muted-foreground max-w-md mx-auto">
				This cluster needs an administrator to finish setup before it can be used.
			</p>
		</div>
	);
}
