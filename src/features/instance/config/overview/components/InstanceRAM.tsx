import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';

export const InstanceRAM = ({
	loadingRegistration,
	ramAllocation,
}: {
	loadingRegistration?: boolean;
	ramAllocation: string;
}) => {
	return (
		<>
			<dt className="font-bold text-sm/6">RAM</dt>
			<dd className="text-sm/6 sm:mt-2">
				{loadingRegistration ? <TextLoadingSkeleton className="w-10" /> : ramAllocation}
			</dd>
		</>
	);
};
