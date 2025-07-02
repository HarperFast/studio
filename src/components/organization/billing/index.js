import React, { useEffect } from 'react';
import { Row, Col } from 'reactstrap';
import { useParams } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import useAsyncEffect from 'use-async-effect';

import CreditCard from './Card';
import Invoices from './Invoices';
import Coupons from './Coupons';
import Unpaid from '../../shared/Unpaid';
import getCustomer from '../../../functions/api/lms/getCustomer';
import appState from '../../../functions/state/appState';
import getInstances from '../../../functions/api/lms/getInstances';

function BillingIndex() {
	const { customer_id } = useParams();
	const auth = useStoreState(appState, (s) => s.auth);
	const products = useStoreState(appState, (s) => s.products);
	const regions = useStoreState(appState, (s) => s.regions);
	const subscriptions = useStoreState(appState, (s) => s.subscriptions);
	const instances = useStoreState(appState, (s) => s.instances);
	const is_unpaid = useStoreState(appState, (s) => s.customer.is_unpaid);

	useEffect(
		() => {
			getCustomer({ auth, customer_id });
		},
		// eslint-disable-next-line
		[]
	);

	useAsyncEffect(() => {
		if (auth && products && regions && subscriptions && customer_id && !instances?.length) {
			getInstances({ auth, customer_id, products, regions, subscriptions, instanceCount: instances?.length });
		}
	}, [auth, products, regions, customer_id, subscriptions, instances]);

	return (
		<Row>
			{is_unpaid && (
				<Col xs="12">
					<Unpaid />
				</Col>
			)}
			<Col md="6">
				<span className="floating-card-header">card</span>
				<CreditCard />
			</Col>
			<Col md="6">
				<span className="floating-card-header">coupons</span>
				<Coupons />
				<br />
				<span className="floating-card-header">invoices</span>
				<Invoices />
			</Col>
		</Row>
	);
}

export default BillingIndex;
