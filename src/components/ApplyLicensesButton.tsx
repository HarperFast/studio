import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useApplyLicensesClick } from '@/hooks/useApplyLicensesClick';
import { SchemaLicense } from '@/integrations/api/api.gen';
import { pluralize } from '@/lib/pluralize';
import { RotateCcwIcon } from 'lucide-react';

interface ApplyLicensesButtonParams {
	newLicenses: SchemaLicense[];
}

export function ApplyLicensesButton({
	newLicenses,
}: ApplyLicensesButtonParams) {
	const { onApplyLicensesClick, isApplyLicensesPending } = useApplyLicensesClick({
		licenses: newLicenses,
	});
	const countNewLicenses = pluralize(newLicenses.length, 'New License', 'New Licenses');
	const countNewLicensesAre = pluralize(newLicenses.length, 'new license is', 'new licenses are');
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="defaultOutline"
					className="mx-0 md:mx-4 rounded-full"
					onClick={onApplyLicensesClick}
					disabled={isApplyLicensesPending}
				>
					<RotateCcwIcon /> Apply {countNewLicenses}
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				{countNewLicensesAre} available for this instance. After applying, you will want to restart the instance.
			</TooltipContent>
		</Tooltip>
	);
}
