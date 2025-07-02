import React, { useState, useEffect } from 'react';
import { Card, CardBody } from 'reactstrap';
import { useStoreState } from 'pullstate';

import EntityManagerForm from './EntityManagerForm';
import EntityManagerRow from './EntityManagerRow';
import EntityManagerHeader from './EntityManagerHeader';
import instanceState from '../../../functions/state/instanceState';

function EntityManager({ items, activeItem, activeSchema = false, showForm, baseUrl, itemType }) {
	const [isDropping, toggleDropItem] = useState(false);
	const [isCreating, toggleCreate] = useState(false);
	const registration = useStoreState(instanceState, (s) => s.registration);
	const [major, minor] = registration?.version?.split('.') || [];
	const versionAsFloat = parseFloat(`${major}.${minor}`);

	useEffect(() => {
		toggleCreate();
		toggleDropItem();
	}, [activeItem, activeSchema, items]);

	return (
		<div className="entity-manager">
			<EntityManagerHeader
				items={items}
				itemType={itemType}
				isDropping={isDropping}
				toggleDropItem={toggleDropItem}
				isCreating={isCreating}
				toggleCreate={toggleCreate}
				showForm={showForm}
			/>
			<Card className="my-3">
				{items && items.length ? (
					<CardBody className={`scrollable ${isCreating ? 'creating' : ''}`}>
						{items.map((item) => (
							<EntityManagerRow
								key={item}
								item={item}
								itemType={itemType}
								baseUrl={baseUrl}
								isActive={activeItem === item}
								isDropping={isDropping}
								toggleDropItem={toggleDropItem}
								activeSchema={activeSchema}
							/>
						))}
					</CardBody>
				) : null}

				{showForm && ((items && !items.length) || isCreating) ? (
					<CardBody>
						<EntityManagerForm
							items={items}
							itemType={itemType}
							baseUrl={baseUrl}
							activeSchema={activeSchema}
							isDropping={isDropping}
							toggleDropItem={toggleDropItem}
							isCreating={isCreating}
							toggleCreate={toggleCreate}
						/>
					</CardBody>
				) : items && !items.length && !showForm ? (
					<CardBody>
						<div className="py-3 text-center no-content">
							no visible {versionAsFloat >= 4.2 ? 'databases' : 'schemas'} or tables
						</div>
					</CardBody>
				) : null}
			</Card>
		</div>
	);
}

export default EntityManager;
