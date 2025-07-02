import React, { useState } from 'react';
import { Col, Row, Button, Card, CardBody } from 'reactstrap';
import useAsyncEffect from 'use-async-effect';
import { useParams, useNavigate } from 'react-router-dom';
import { useStoreState } from 'pullstate';

import appState from '../../../functions/state/appState';

import config from '../../../config';
import useNewInstance from '../../../functions/state/newInstance';
import CouponForm from '../../shared/CouponForm';
import RadioCheckbox from '../../shared/RadioCheckbox';
import commaNumbers from '../../../functions/util/commaNumbers';
import Unpaid from '../../shared/Unpaid';
import UnlimitedEnterprise from '../../shared/UnlimitedEnterprise';

function Confirm() {
	const navigate = useNavigate();
	const { customer_id } = useParams();
	const [newInstance, setNewInstance] = useNewInstance({});
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({ tc_version: newInstance.tc_version || false });
	const is_unpaid = useStoreState(appState, (s) => s.customer.is_unpaid);
	const unlimited_local_install = useStoreState(appState, (s) => s.customer.unlimited_local_install);
	const stripeCoupons = useStoreState(appState, (s) => s.customer?.stripe_coupons);
	const usedFreetrial = stripeCoupons.find((c) => c.name === 'FREETRIAL');
	const subdomain = useStoreState(appState, (s) => s.customer?.subdomain);
	const totalPrice = (newInstance?.compute_price || 0) + (newInstance?.storage_price || 0);
	const allPrePaid =
		newInstance.compute_subscription_id && (newInstance.is_local || newInstance.storage_subscription_id);
	const somePrePaid = newInstance.compute_subscription_id || newInstance.storage_subscription_id;
	const wavelengthRegions = useStoreState(appState, (s) => s.wavelengthRegions);
	const instance_region_label = newInstance.is_wavelength
		? wavelengthRegions.find((r) => r.value === newInstance.instance_region).label
		: newInstance.instance_region;
	const totalPriceString = allPrePaid
		? 'PREPAID'
		: totalPrice
			? `$${commaNumbers(totalPrice.toFixed(2))}/${newInstance.compute_interval}`
			: somePrePaid
				? 'PREPAID / FREE'
				: 'FREE';
	const analyticsProductsArray = [
		{ name: 'compute', id: newInstance.compute_ram_string, price: newInstance?.compute_price || 0 },
	];
	if (!newInstance.is_local) {
		analyticsProductsArray.push({
			name: 'storage',
			id: newInstance.data_volume_size_string,
			price: newInstance?.storage_price || 0,
		});
	}

	useAsyncEffect(() => {
		const { submitted } = formState;
		const { tc_version } = formData;
		if (submitted) {
			if (tc_version) {
				if (window._kmq)
					window._kmq.push([
						'record',
						totalPrice
							? 'purchased instance'
							: newInstance.is_local
								? 'registered local instance'
								: 'created free instance',
						analyticsProductsArray,
					]);
				setNewInstance({ ...newInstance, tc_version });
				setTimeout(() => navigate(`/o/${customer_id}/instances/new/status`), 0);
			} else {
				setFormState({ error: 'Please agree to the Privacy Policy and Cloud Terms of Service.' });
			}
		}
	}, [formState]);

	return (
		<>
			<Card>
				<CardBody>
					<Row>
						<Col sm="4" className="text-nowrap text-grey">
							Instance Name
						</Col>
						<Col sm="8" className="text-sm-end text-nowrap">
							{newInstance.instance_name}
						</Col>
					</Row>
					<hr />
					<Row>
						<Col sm="4" className="text-nowrap text-grey">
							Admin User
						</Col>
						<Col sm="8" className="text-sm-end text-nowrap">
							{newInstance.user}
						</Col>
					</Row>
					<hr />
					<Row>
						<Col sm="4" className="text-nowrap text-grey">
							Admin Password
						</Col>
						<Col sm="8" className="text-sm-end text-nowrap">
							********
						</Col>
					</Row>
					<hr />
					{newInstance.is_local ? (
						<>
							<Row>
								<Col sm="4" className="text-nowrap text-grey">
									Host
								</Col>
								<Col sm="8" className="text-sm-end text-nowrap">
									{newInstance.host}
								</Col>
							</Row>
							<hr />
							<Row>
								<Col sm="4" className="text-nowrap text-grey">
									Port
								</Col>
								<Col sm="8" className="text-sm-end text-nowrap">
									{newInstance.port}
								</Col>
							</Row>
							<hr />
							<Row>
								<Col sm="4" className="text-nowrap text-grey">
									Uses SSL
								</Col>
								<Col sm="8" className="text-sm-end text-nowrap">
									{newInstance.is_ssl ? 'yes' : 'no'}
								</Col>
							</Row>
							<hr />
						</>
					) : (
						<>
							<Row>
								<Col sm="4" className="text-nowrap text-grey">
									Instance URL
								</Col>
								<Col sm="8" className="text-sm-end text-nowrap">
									{newInstance.instance_name}-{subdomain}.harperdbcloud.com
								</Col>
							</Row>
							<hr />
							<Row>
								<Col sm="4" className="text-nowrap text-grey">
									Instance Region
								</Col>
								<Col sm="8" className="text-sm-end text-nowrap">
									{instance_region_label}
								</Col>
							</Row>
							<hr />
							<Row>
								<Col sm="6" className="text-nowrap text-grey">
									Instance Storage
								</Col>
								<Col xs="4" sm="2" className="text-sm-end text-nowrap">
									{newInstance.data_volume_size_string}
								</Col>
								<Col xs="8" sm="4" className="text-sm-end text-nowrap text-truncate">
									{newInstance.storage_price_string_with_interval}
								</Col>
							</Row>
							<hr />
						</>
					)}
					<Row>
						<Col sm="6" className="text-nowrap text-grey">
							Instance RAM
						</Col>
						<Col xs="4" sm="2" className="text-sm-end text-nowrap">
							{newInstance.compute_ram_string}
						</Col>
						<Col xs="8" sm="4" className="text-sm-end text-nowrap text-truncate">
							{newInstance.compute_price_string_with_interval}
						</Col>
					</Row>
					<hr />
					<Row>
						<Col sm="8" className="text-nowrap text-grey">
							Instance Total Price
						</Col>
						<Col sm="4" className="text-sm-end text-nowrap">
							<b>{totalPriceString}</b>
						</Col>
					</Row>
				</CardBody>
			</Card>
			<hr className="my-3" />
			{is_unpaid ? (
				<Unpaid />
			) : unlimited_local_install ? (
				<UnlimitedEnterprise />
			) : (
				<div className="px-2">
					{stripeCoupons?.length > 0 && (
						<div className="mb-3">
							This organization has <b>{stripeCoupons.length}</b> coupon{stripeCoupons.length > 1 && 's'} on file, good
							for a total product credit of{' '}
							<b>${stripeCoupons.reduce((total, coupon) => total + parseInt(coupon.amount_off / 100, 10), 0)}</b>.
							Charges beyond that amount will be billed to your card.
						</div>
					)}
					{!usedFreetrial && (
						<div className="mb-3">
							This organization is entitled to a credit equal to 1 month of 1GB RAM/1GB Disk (a $33 value) with coupon
							code <b className="text-success">FREETRIAL</b>. Enter the code into the form below to receive the credit.
						</div>
					)}
					<hr />
					<CouponForm />
				</div>
			)}
			<hr className="my-3" />
			<Row className="g-0">
				<Col xs="2" sm="1" className="text-nowrap overflow-hidden ps-2">
					<RadioCheckbox
						id="agreeToTermsAndConditions"
						className={formState.error ? 'error' : ''}
						type="radio"
						onChange={(value) => setFormData({ tc_version: value })}
						options={{ value: config.tc_version }}
					/>
				</Col>
				<Col xs="10" sm="11" className="text-small pt-1 pe-2">
					I agree to Harper&apos;s&nbsp;
					<a href="https://harperdb.io/legal/privacy-policy/" target="_blank" rel="noopener noreferrer">
						Privacy Policy
					</a>{' '}
					and{' '}
					<a
						href="https://harperdb.io/legal/harperdb-cloud-terms-of-service/"
						target="_blank"
						rel="noopener noreferrer"
					>
						Harper Cloud Terms of Service
					</a>
				</Col>
			</Row>
			<hr className="mt-3 mb-0" />
			<Row>
				<Col sm="6">
					<Button
						onClick={() =>
							navigate(`/o/${customer_id}/instances/new/details_${newInstance.is_local ? 'local' : 'cloud'}`)
						}
						title="Back to Instance Details"
						block
						className="mt-3"
						color="purple"
					>
						<i className="fa fa-chevron-circle-left me-2" />
						Instance Details
					</Button>
				</Col>
				<Col sm="6">
					<Button
						id="addInstance"
						onClick={() => setFormState({ submitted: true })}
						title="Confirm Instance Details"
						block
						className="mt-3"
						color="purple"
					>
						Add Instance
						<i className="fa fa-check-circle ms-2" />
					</Button>
				</Col>
			</Row>
			{formState.error && (
				<Card className="mt-3 error">
					<CardBody>{formState.error}</CardBody>
				</Card>
			)}
		</>
	);
}

export default Confirm;
