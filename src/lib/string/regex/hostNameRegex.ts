// Matches one of:
// - "localhost"
// - IPv4 address (four 0–255 octets, no leading zeros for multi-digit values)
// - Domain with subdomains: labels 1–63 chars (alphanumeric and hyphen, not starting/ending with hyphen),
//   with a final TLD of 2+ letters. No ports, no paths, no IPv6.
export const hostNameRegex = /(^$|^(?:localhost|(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})$)/i;
