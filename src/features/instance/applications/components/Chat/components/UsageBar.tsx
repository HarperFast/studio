import { useChatUsage } from '@/integrations/api/instance/status/getChatUsage';

export function UsageBar() {
	const { data, isLoading, error } = useChatUsage();

	if (isLoading || error || !data) {
		return null;
	}

	const { usageUSD, monthlyLimitUSD, usageBarPercent } = data;

	const formatUSD = (amount: number) =>
		new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
		}).format(amount);

	return (
		<div className="usage-container">
			<div className="usage-info">
				<span>Monthly Org Usage</span>
				<span>{formatUSD(usageUSD)} / {formatUSD(monthlyLimitUSD)}</span>
				<span>{Math.round(usageBarPercent)}%</span>
			</div>
			<div className="usage-bar-bg">
				<div
					className="usage-bar-fill"
					style={{ width: `${usageBarPercent}%` }}
				/>
			</div>
		</div>
	);
}
