import queryLMS from '../queryLMS';

export default async ({ auth, customer_id, compute_stack_id, is_verizon, is_akamai }) =>
	queryLMS({
		endpoint: is_verizon ? 'wl/removeWavelengthInstance' : is_akamai ? 'removeAkamaiInstance' : 'removeInstance',
		method: 'POST',
		payload: {
			customer_id,
			compute_stack_id,
			compute_stack_wl_id: compute_stack_id,
		},
		auth,
	});
