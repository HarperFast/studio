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
			<DialogContent resizable className="max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Deployment</DialogTitle>
				</DialogHeader>
				<DeploymentDetail deploymentId={deploymentId} />
			</DialogContent>
		</Dialog>
	);
}
