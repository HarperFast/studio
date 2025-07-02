import React from 'react';
import { Row, Col, Button } from 'reactstrap';

import ActionNoConnection from './ActionNoConnection';
import ActionConnectionClosed from './ActionConnectionClosed';
import ActionConnectionOpen from './ActionConnectionOpen';
import ActionConnecting from './ActionConnecting';
import ActionUnconfigured from './ActionUnconfigured';

function InstanceManagerRow({
	setShowModal,
	item,
	itemType,
	loading,
	handleAddNode,
	handleRemoveNode,
	handleConfigureNode,
	refreshNetwork,
}) {
	const isLoading = item.compute_stack_id === loading;

	return (
		<Row className="item-row">
			<Col className={`item-label ${item.connection?.state === 'closed' ? 'text-danger' : ''}`}>
				{item.instance_name}
			</Col>
			<Col className="item-action">
				{itemType === 'incompatible/unreachable' ? null : itemType === 'unconfigured' ? (
					<ActionUnconfigured
						loading={isLoading}
						handleConfigureNode={() => handleConfigureNode({ compute_stack_id: item.compute_stack_id })}
					/>
				) : item.instance_status === 'CREATE_IN_PROGRESS' ? (
					<Button color="grey" className="round" title="Creating Instance" disabled>
						<i className="fa fa-spin fa-spinner" />
					</Button>
				) : !item.connection ? (
					<ActionNoConnection
						loading={isLoading}
						handleAddNode={() =>
							handleAddNode({
								compute_stack_id: item.compute_stack_id,
								instance_url: item.instance_url,
								instance_host: item.instance_host,
								clusterPort: item.clusterPort,
							})
						}
					/>
				) : item.connection?.state === 'closed' ? (
					<ActionConnectionClosed
						loading={isLoading}
						handleRemoveNode={() => handleRemoveNode({ compute_stack_id: item.compute_stack_id })}
						showModal={() => setShowModal(item.instance_name)}
					/>
				) : item.connection?.state === 'connecting' ? (
					<ActionConnecting refreshNetwork={refreshNetwork} />
				) : (
					<ActionConnectionOpen
						loading={isLoading}
						handleRemoveNode={() =>
							handleRemoveNode({
								compute_stack_id: item.compute_stack_id,
								instance_host: item.instance_host,
								clusterPort: item.clusterPort,
							})
						}
					/>
				)}
			</Col>
		</Row>
	);
}

export default InstanceManagerRow;
