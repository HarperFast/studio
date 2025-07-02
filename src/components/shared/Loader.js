import { Card, CardBody, Row, Col } from 'reactstrap';
import React from 'react';
import { NavLink } from 'react-router-dom';

function Loader({ header, body, spinner, links = false, relative = false }) {
	return (
		<div className={`loader ${relative ? 'relative' : ''}`}>
			<Card className="mb-3">
				<CardBody className="text-center">
					<div className="mb-3">&nbsp;{header}&nbsp;</div>
					<div className="mt-2">&nbsp;{spinner && <i className="fa fa-spinner fa-spin" />}&nbsp;</div>
					<div className="mt-2">&nbsp;{body}&nbsp;</div>
				</CardBody>
			</Card>
			{!links ? (
				<div className="login-nav-link">&nbsp;</div>
			) : (
				<Row>
					{links.map((link) => (
						<Col key={link.to} className={`login-nav-link-holder ${link.className || ''}`}>
							<NavLink to={link.to} className="login-nav-link">
								{link.text}
							</NavLink>
						</Col>
					))}
				</Row>
			)}
		</div>
	);
}

export default Loader;
