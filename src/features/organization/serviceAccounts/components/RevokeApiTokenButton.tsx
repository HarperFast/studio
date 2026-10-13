import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Button } from '@/components/ui/button';
import { useRevokeOrganizationApiTokenMutation } from '@/features/organization/serviceAccounts/mutations/revokeOrganizationApiToken';
import { OrganizationApiToken } from '@/integrations/api/api.patch';
import { BanIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

export function RevokeApiTokenButton({ token }: { token: OrganizationApiToken }) {
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);
	const { mutate: revokeToken, isPending } = useRevokeOrganizationApiTokenMutation(token.organizationId);
	// isPending lags a second confirm by a render.
	const isRevoking = useRef(false);

	const onConfirm = () => {
		if (isRevoking.current) { return; }
		isRevoking.current = true;
		revokeToken(
			{ tokenId: token.id },
			{
				onSuccess: () => {
					toast.success(`API token "${token.name}" revoked.`);
					setIsConfirmOpen(false);
				},
				onSettled: () => {
					isRevoking.current = false;
				},
			},
		);
	};

	return (
		<ConfirmDeletionModal
			typeOfThingBeingDeleted="API token"
			nameOfThingBeingDeleted={token.name}
			isModalOpen={isConfirmOpen}
			setIsModalOpen={setIsConfirmOpen}
			deletionConfirmed={onConfirm}
			deletionPending={isPending}
			hideDataLossWarning
			transitiveVerb="Revoke"
			presentParticiple="Revoking"
			trigger={
				<Button
					variant="destructiveGhost"
					size="sm"
					className="text-destructive/75 hover:text-destructive focus-visible:text-destructive"
					aria-label={`Revoke ${token.name}`}
				>
					<BanIcon /> Revoke
				</Button>
			}
		/>
	);
}
