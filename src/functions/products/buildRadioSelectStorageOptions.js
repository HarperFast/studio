import commaNumbers from '../util/commaNumbers';

const buildRadioSelectStorageOptions = (plans) => {
	const storageOptionsArray = [];

	plans.map(({ tiers, interval, active, id, subscription_id = undefined, name = undefined, available = undefined }) => {
		const freeTier = tiers.find((t) => !!t.up_to).up_to;
		const data_volume_sizes = [
			freeTier,
			10,
			100,
			250,
			500,
			1000,
			1500,
			2000,
			2500,
			3000,
			3500,
			4000,
			4500,
			5000,
			5500,
			6000,
			6500,
			7000,
			7500,
			8000,
			8500,
			9000,
			9500,
			10000,
		];
		const sizes = [...new Set(data_volume_sizes)].filter((s) => !subscription_id || s !== freeTier);

		return sizes.map((data_volume_size) => {
			const iops = 3000;
			const pricing_tier = tiers.find((p) => (p.up_to && data_volume_size <= p.up_to) || !p.up_to);
			const storage_price = subscription_id ? 0 : data_volume_size * (pricing_tier.unit_amount / 100);
			const storage_price_string = subscription_id
				? name
				: storage_price
					? `$${commaNumbers(storage_price.toFixed(2))}`
					: 'FREE';
			const storage_price_string_with_interval = subscription_id
				? name
				: storage_price
					? `$${commaNumbers(storage_price.toFixed(2))}/${interval}`
					: 'FREE';
			const data_volume_size_string =
				data_volume_size >= 1000 ? `${data_volume_size / 1000}TB` : `${data_volume_size}GB`;
			const prepaid_disk_space_available = !available
				? 0
				: available > 1000
					? `${(available / 1024).toFixed(2)}TB`
					: `${available}GB`;
			const label = `${data_volume_size_string}  •  ${
				subscription_id
					? `${name}  •  ${prepaid_disk_space_available} remaining`
					: storage_price
						? `$${commaNumbers(storage_price.toFixed(2))}/${interval}`
						: 'FREE'
			} ${!active ? '(legacy)' : ''}`;

			return storageOptionsArray.push({
				label,
				value: {
					active,
					data_volume_size,
					iops,
					storage_interval: interval,
					stripe_storage_plan_id: id,
					storage_subscription_id: subscription_id,
					storage_subscription_name: name,
					storage_quantity_available: available,
					storage_price,
					storage_price_string,
					storage_price_string_with_interval,
					data_volume_size_string,
				},
			});
		});
	});

	return storageOptionsArray.sort((a, b) => {
		if (a.value.data_volume_size === b.value.data_volume_size) {
			return a.value.storage_subscription_name > b.value.storage_subscription_name ? 1 : -1;
		}
		return a.value.data_volume_size - b.value.data_volume_size;
	});
};

export default buildRadioSelectStorageOptions;
