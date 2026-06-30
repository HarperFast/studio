import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DeploymentDetail } from '@/features/instance/config/deployments/components/DeploymentDetail';

export function DeploymentDetailModal({
	deploymentId,
	isModalOpen,
	closeModal,
}: {
	deploymentId: string;
	isModalOpen: boolean;
	closeModal: () => void;
}) {
	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			{
				/*
				No overflow/max-h on DialogContent itself: the resizable shell leaves the outer
				content unclipped so its resize handles (which extend past the edges) stay reachable.
				Clipping here swallows them. Scrolling lives on the inner flex-1/min-h-0 body instead.
			*/
			}
			<DialogContent resizable aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle>Deployment</DialogTitle>
				</DialogHeader>
				<div className="min-h-0 flex-1 overflow-y-auto">
					<DeploymentDetail deploymentId={deploymentId} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
