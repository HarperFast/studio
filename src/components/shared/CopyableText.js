import React, { useCallback } from 'react';
import { Button, Col, Row } from 'reactstrap';
import { useAlert } from 'react-alert';

function CopyableText({ text, beforeText, afterText, obscure = false }) {
	const alert = useAlert();
	const canCopyToClipboard = navigator.clipboard;

	const copyURL = useCallback(
		async (e) => {
			e.stopPropagation();
			await navigator.clipboard.writeText(text);
			alert.success('Text copied to clipboard');
		},
		[alert, text]
	);

	return (
		<Row className="copyable-text-holder g-0">
			{canCopyToClipboard && text && (
				<Col className="copy-icon">
					<Button title="Copy this value" onClick={copyURL} color="link">
						<i className="fa fa-copy text-small" />
					</Button>
				</Col>
			)}
			<Col className="text-container">
				{text ? (
					<>
						{beforeText}
						{obscure ? text.replace(/./g, '*') : text}
						{afterText}
					</>
				) : (
					<span>&nbsp;</span>
				)}
			</Col>
		</Row>
	);
}

export default CopyableText;
