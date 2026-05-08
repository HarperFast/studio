import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';

export const LastDeployedTimestamp = ({
	loading,
	timestamp,
}: {
	loading?: boolean;
	timestamp?: number | null;
}) => {
	const dateString = timestamp ? new Date(timestamp).toLocaleString() : 'Never';
	return (
		<>
			<dt className="font-bold text-sm/6">Last Deployed</dt>
			<dd className="text-sm/6 sm:mt-2">
				{loading ? <TextLoadingSkeleton className="w-24" /> : dateString}
			</dd>
		</>
	);
};
