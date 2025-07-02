import queryLMS from '../queryLMS';

export default async (props) =>
	queryLMS({
		endpoint: 'updateInstance',
		method: 'POST',
		payload: Object.entries({
			stripe_plan_id: props.stripe_plan_id,
			compute_stack_id: props.compute_stack_id,
			customer_id: props.customer_id,
			data_volume_size: props.data_volume_size,
			stripe_storage_plan_id: props.stripe_storage_plan_id,
			compute_subscription_id: props.compute_subscription_id,
			storage_subscription_id: props.storage_subscription_id,
		}).reduce((a, [k, v]) => (v == null ? a : ((a[k] = v), a)), {}),
		auth: props.auth,
	});
