import commaNumbers from '../util/commaNumbers';

export default (plans) => {
	const computeOptionsArray = [];

	plans.map(
		({
			id,
			amount_decimal,
			interval,
			amount,
			active,
			subscription_id = undefined,
			name = undefined,
			quantity = undefined,
			available = undefined,
			metadata: { ram_allocation, instance_type, has_gpus },
		}) => {
			const compute_price = subscription_id ? 0 : parseInt(amount_decimal, 10) / 100;
			const compute_comma_amount = commaNumbers(amount);
			const compute_price_string = subscription_id ? name : amount_decimal === '0' ? 'FREE' : `${compute_comma_amount}`;
			const compute_price_string_with_interval = subscription_id
				? name
				: amount_decimal === '0'
					? 'FREE'
					: `${compute_comma_amount}/${interval}`;
			const compute_ram = ram_allocation ? parseInt(ram_allocation, 10) : false;
			const compute_ram_string = `${compute_ram / 1024}GB`;
			const label = `${compute_ram_string} RAM  ${has_gpus ? '+ GPU Support ' : ''}•  ${
				subscription_id
					? `${name}  •  ${available} remaining`
					: amount_decimal !== '0'
						? `${compute_comma_amount}/${interval}`
						: 'FREE'
			} ${!active ? '(legacy)' : ''}`;

			return (
				compute_ram &&
				computeOptionsArray.push({
					label,
					value: {
						active,
						instance_type,
						stripe_plan_id: id,
						compute_interval: interval,
						compute_subscription_name: name,
						compute_subscription_id: subscription_id,
						compute_quantity: quantity,
						compute_quantity_available: available,
						compute_ram,
						compute_ram_string,
						compute_price,
						compute_comma_amount,
						compute_price_string,
						compute_price_string_with_interval,
					},
				})
			);
		}
	);

	return computeOptionsArray.sort((a, b) => {
		if (a.value.compute_ram === b.value.compute_ram) {
			return a.value.compute_subscription_name > b.value.compute_subscription_name ? 1 : -1;
		}
		return a.value.compute_ram - b.value.compute_ram;
	});
};
