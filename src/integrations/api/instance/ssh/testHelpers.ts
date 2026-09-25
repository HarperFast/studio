/*
 * Stand-ins for SSH key files, assembled at runtime so that no key-shaped block sits in the repo for a
 * secret scanner to flag. They carry only the structure the validator reads: the armor lines, a PEM
 * body's outer DER length, and the OpenSSH container's fields.
 */

export const OPENSSH_LABEL = 'OPENSSH PRIVATE KEY';

export function beginLine(label: string) {
	return `-----BEGIN ${label}-----`;
}

export function endLine(label: string) {
	return `-----END ${label}-----`;
}

export function armored(label: string, bodyLines: readonly string[]) {
	return [beginLine(label), ...bodyLines, endLine(label)].join('\n');
}

interface OpenSSHKeyShape {
	cipherName?: string;
	keyType?: string;
	keyCount?: number;
	checkInts?: [number, number];
	blockSize?: number;
	trailing?: string;
}

export function openSSHKeyBody(
	{
		cipherName = 'none',
		keyType = 'ssh-ed25519',
		keyCount = 1,
		checkInts = [0x5ca1ab1e, 0x5ca1ab1e],
		blockSize = 8,
		trailing = '',
	}: OpenSSHKeyShape = {},
) {
	const uint32 = (value: number) =>
		String.fromCharCode((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
	const sshString = (value: string) => uint32(value.length) + value;
	let privateSection = uint32(checkInts[0]) + uint32(checkInts[1]) + 'private key material. '.repeat(11);
	for (let pad = 1; privateSection.length % blockSize !== 0; pad++) {
		privateSection += String.fromCharCode(pad);
	}
	const blob = 'openssh-key-v1\0'
		+ sshString(cipherName)
		+ sshString(cipherName === 'none' ? 'none' : 'bcrypt')
		+ sshString('')
		+ uint32(keyCount)
		+ sshString(sshString(keyType) + sshString('public key bytes'))
		+ sshString(privateSection)
		+ trailing;
	return btoa(blob).match(/.{1,70}/g) ?? [];
}

export function openSSHPrivateKey(shape: OpenSSHKeyShape = {}) {
	return armored(OPENSSH_LABEL, openSSHKeyBody(shape));
}

export function pemKeyBody(contents = '\0'.repeat(600)) {
	const der = String.fromCharCode(0x30, 0x82, contents.length >> 8, contents.length & 255) + contents;
	return btoa(der).match(/.{1,64}/g) ?? [];
}

export const ED25519_PUBLIC_KEY =
	'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGExampleExampleExampleExampleExampleExample me@laptop';
