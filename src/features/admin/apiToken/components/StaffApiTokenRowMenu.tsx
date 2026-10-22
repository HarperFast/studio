import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { useRevokeApiTokenMutation } from '@/features/admin/apiToken/mutations/useRevokeApiToken';
import { useCopyTextToClipboard } from '@/hooks/useCopyToClipboard';
import { StaffApiToken } from '@/integrations/api/api.patch';
import { BanIcon, CopyIcon, EllipsisVerticalIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

/** The row's "⋮" menu: copy the id for any token, revoke a live one behind a confirm. */
export function StaffApiTokenRowMenu({ token }: { token: StaffApiToken }) {
	const copyText = useCopyTextToClipboard();
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);
	const { mutate: revoke, isPending } = useRevokeApiTokenMutation();
	// isPending lags a second confirm by a render.
	const isRevoking = useRef(false);

	const onConfirm = () => {
		if (isRevoking.current) { return; }
		isRevoking.current = true;
		revoke(token.id, {
			onSuccess: () => {
				toast.success(`API token “${token.name}” revoked.`);
				setIsConfirmOpen(false);
			},
			onSettled: () => {
				isRevoking.current = false;
			},
		});
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${token.name}`}>
						<EllipsisVerticalIcon />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => copyText(token.id)}>
						<CopyIcon /> Copy token ID
					</DropdownMenuItem>
					{token.status === 'active' && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem variant="destructive" onSelect={() => setIsConfirmOpen(true)}>
								<BanIcon /> Revoke…
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
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
			/>
		</>
	);
}
