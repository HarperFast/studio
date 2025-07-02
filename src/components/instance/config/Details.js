import React from 'react';
import { useStoreState } from 'pullstate';
import { Card, CardBody, Row, Col } from 'reactstrap';

import instanceState from '../../../functions/state/instanceState';
import ContentContainer from '../../shared/ContentContainer';
import CopyableText from '../../shared/CopyableText';
import config from '../../../config';

function Details({ clusterNodeName, instanceConfig }) {
	const url = useStoreState(instanceState, (s) => s.url);
	const auth = useStoreState(instanceState, (s) => s.auth);
	const totalPriceStringWithInterval = useStoreState(instanceState, (s) => s.totalPriceStringWithInterval);
	const compute = useStoreState(instanceState, (s) => s.compute);
	const prepaid_compute = useStoreState(instanceState, (s) => !!s.compute_subscription_id);
	const prepaid_storage = useStoreState(instanceState, (s) => !!s.storage_subscription_id);
	const creation_date = useStoreState(instanceState, (s) => s.creation_date);
	const instance_region = useStoreState(instanceState, (s) => s.instance_region);
	const storage = useStoreState(instanceState, (s) => s.storage);
	const is_local = useStoreState(instanceState, (s) => s.is_local);
	const authHeader = auth?.user ? `${btoa(`${auth.user}:${auth.pass}`)}` : '...';
	const iopsString = is_local ? 'HARDWARE LIMIT' : `${storage?.iops}`;
	const formatted_creation_date = creation_date ? new Date(creation_date).toLocaleDateString() : 'N/A';
	const { hostname, origin } = window.location;
	const urlObject = new URL(config.is_local_studio ? origin : url);

	const operationsApiURL = !config.is_local_studio
		? `${instanceConfig.operationsApi?.network?.securePort ? 'https://' : 'http://'}${urlObject.hostname}:${
				instanceConfig.operationsApi?.network?.securePort || instanceConfig.operationsApi?.network?.port
			}`
		: `${instanceConfig.operationsApi?.network?.securePort ? 'https://' : 'http://'}${hostname}:${
				instanceConfig.operationsApi?.network?.securePort || instanceConfig.operationsApi?.network?.port
			}`;
	const applicationsApiURL = !config.is_local_studio
		? `${instanceConfig.http?.securePort ? 'https://' : 'http://'}${urlObject.hostname}:${instanceConfig.http?.securePort || instanceConfig.http?.port}`
		: `${instanceConfig.http?.securePort ? 'https://' : 'http://'}${hostname}:${instanceConfig.http?.securePort || instanceConfig.http?.port}`;

	const version = useStoreState(instanceState, (s) => s.registration?.version);
	const [major, minor] = version?.split('.') || [];
	const versionAsFloat = parseFloat(`${major}.${minor}`);

	return (
		<>
			<span className="floating-card-header">instance overview</span>
			<Card className="mt-3 mb-4 instance-details">
				<CardBody>
					<Row>
						<Col md="4" xs="12">
							<ContentContainer header="Instance URL" className="mb-3">
								<div className="nowrap-scroll">
									<CopyableText text={operationsApiURL} />
								</div>
							</ContentContainer>
						</Col>
						<Col md="4" xs="12">
							<ContentContainer
								header={`${versionAsFloat >= 4.2 ? 'Applications' : 'Custom Functions'} URL`}
								className="mb-3"
							>
								<div className="nowrap-scroll">
									<CopyableText text={applicationsApiURL} />
								</div>
							</ContentContainer>
						</Col>
						<Col md="4" xs="12">
							<ContentContainer header="Instance Node Name (for clustering)" className="mb-3">
								<div className="nowrap-scroll">
									{clusterNodeName ? <CopyableText text={clusterNodeName} /> : 'clustering not enabled'}
								</div>
							</ContentContainer>
						</Col>
						{!config.is_local_studio && (
							<>
								<Col md="4" xs="12">
									<ContentContainer header="Instance API Auth Header (this user)" className="mb-3">
										<div className="nowrap-scroll">
											<CopyableText text={authHeader} beforeText="Basic " obscure />
										</div>
									</ContentContainer>
								</Col>

								<Col md="2" sm="4" xs="6">
									<ContentContainer header="Created" className="mb-3">
										<div className="nowrap-scroll">{formatted_creation_date}</div>
									</ContentContainer>
								</Col>
								{instance_region && (
									<Col md="2" sm="4" xs="6">
										<ContentContainer header="Region" className="mb-3">
											<div className="nowrap-scroll">{instance_region}</div>
										</ContentContainer>
									</Col>
								)}
								<Col md="2" sm="4" xs="6">
									<ContentContainer header="Total Price" className="mb-3">
										<div className="nowrap-scroll">{totalPriceStringWithInterval}</div>
									</ContentContainer>
								</Col>
								<Col md="2" sm="4" xs="6">
									<ContentContainer header="RAM" className="mb-3">
										<div className="nowrap-scroll">
											{compute?.compute_ram_string} {prepaid_compute && '(PREPAID)'}
										</div>
									</ContentContainer>
								</Col>
								{!is_local && (
									<>
										<Col md="2" sm="4" xs="6">
											<ContentContainer header="Storage" className="mb-3 text-nowrap">
												<div className="nowrap-scroll">
													{storage?.data_volume_size_string} {prepaid_storage && '(PREPAID)'}
												</div>
											</ContentContainer>
										</Col>
										<Col md="2" sm="4" xs="6">
											<ContentContainer header="Disk IOPS" className="mb-3 text-nowrap">
												<div className="nowrap-scroll">{iopsString}</div>
											</ContentContainer>
										</Col>
									</>
								)}
							</>
						)}
					</Row>
				</CardBody>
			</Card>
		</>
	);
}

export default Details;
