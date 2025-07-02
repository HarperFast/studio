import queryLMS from '../queryLMS';

export default async ({ auth, customer_id, coupon_code }) =>
	queryLMS({
		endpoint: 'addCoupon',
		method: 'POST',
		auth,
		payload: { customer_id, coupon_code, user_id: auth.user_id },
	});
