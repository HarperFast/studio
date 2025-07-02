import React, { useState, useEffect } from 'react';
import { Card, CardBody } from 'reactstrap';

import EntityManagerForm from './EntityManagerForm';
import EntityManagerRow from './EntityManagerRow';
import EntityManagerHeader from './EntityManagerHeader';

function EntityManager({ items, activeItem, baseUrl, restarting, itemType, project, showForm }) {
	const [isDropping, toggleDropItem] = useState(false);
	const [isCreating, toggleCreate] = useState(false);

	useEffect(() => {
		toggleCreate();
		toggleDropItem();
	}, [activeItem, items.length]);

	return (
		<div className="entity-manager">
			<EntityManagerHeader
				items={items}
				itemType={itemType}
				isDropping={isDropping}
				toggleDropItem={toggleDropItem}
				isCreating={isCreating}
				toggleCreate={toggleCreate}
				restarting={restarting}
				project={project}
				showForm={showForm}
			/>
			<Card className="my-3">
				{items && items.length ? (
					<CardBody className={`scrollable ${isCreating ? 'creating' : ''}`}>
						{items.map((item) => (
							<EntityManagerRow
								key={item}
								item={item}
								baseUrl={baseUrl}
								isActive={activeItem === item}
								isDropping={isDropping}
								toggleDropItem={toggleDropItem}
								itemType={itemType}
								restarting={restarting}
							/>
						))}
					</CardBody>
				) : null}

				{(showForm && items && !items.length) || isCreating ? (
					<CardBody>
						<EntityManagerForm
							items={items}
							itemType={itemType}
							baseUrl={baseUrl}
							isDropping={isDropping}
							toggleDropItem={toggleDropItem}
							isCreating={isCreating}
							toggleCreate={toggleCreate}
							restarting={restarting}
							project={project}
						/>
					</CardBody>
				) : items && !items.length && !isCreating ? (
					<CardBody>
						<div className="py-3 text-center no-content">no functions found</div>
					</CardBody>
				) : null}
			</Card>
		</div>
	);
}

export default EntityManager;
