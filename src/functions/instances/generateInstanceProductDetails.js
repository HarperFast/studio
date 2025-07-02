import commaNumbers from '../util/commaNumbers';
import chooseCompute from './chooseCompute';

export default ({ instance, products, regions, subscriptions }) => {
	try {
		const computeProducts = instance.compute_subscription_id
			? subscriptions[chooseCompute(instance)]
			: products[chooseCompute(instance)];

		const compute = computeProducts?.find(
			(p) =>
				p.value.stripe_plan_id === instance.stripe_plan_id &&
				(!instance.compute_subscription_id || p.value.compute_subscription_id === instance.compute_subscription_id)
		);

		const storageProducts = instance.storage_subscription_id ? subscriptions.cloud_storage : products.cloud_storage;

		const storage = instance.is_local
			? false
			: storageProducts?.find(
					(p) =>
						p.value.data_volume_size === instance.data_volume_size &&
						p.value.stripe_storage_plan_id === instance.stripe_storage_plan_id &&
						(!instance.storage_subscription_id || p.value.storage_subscription_id === instance.storage_subscription_id)
				);

		const totalPrice = parseFloat(compute?.value?.compute_price || 0) + parseFloat(storage?.value?.storage_price || 0);
		const totalPriceString = totalPrice ? `$${commaNumbers(totalPrice.toFixed(2))}` : 'FREE';
		const totalPriceStringWithInterval =
			instance.compute_subscription_id && instance.storage_subscription_id
				? 'PREPAID'
				: totalPrice
					? `${totalPriceString}/${compute.value.compute_interval}`
					: 'FREE';
		const region = instance.is_local ? false : regions.find((r) => r.value === instance.instance_region);

		return {
			compute: compute?.value,
			storage: storage?.value,
			totalPrice,
			totalPriceString,
			totalPriceStringWithInterval,
			region,
		};
	} catch (e) {
		// eslint-disable-next-line
		return console.log(e);
	}
};
