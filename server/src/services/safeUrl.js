import dns from 'dns/promises';
import net from 'net';

const allowPrivate = () => process.env.ALLOW_PRIVATE_WEBHOOKS === 'true';

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
}

// Throws an Error with a user-readable message if the URL is not safe to call from the server.
export async function assertSafeUrl(raw, { host, pathPrefix } = {}) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('That is not a valid link.');
  }
  if (host && !host.includes(u.hostname)) throw new Error(`The link must be on ${host.join(' or ')}.`);
  if (pathPrefix && !u.pathname.startsWith(pathPrefix)) throw new Error(`The link must start with ${host?.[0]}${pathPrefix}`);
  if (allowPrivate()) return u.toString();
  if (u.protocol !== 'https:') throw new Error('The link must start with https://');
  if (u.hostname === 'localhost' || net.isIP(u.hostname) ? isPrivateIp(u.hostname) : false)
    throw new Error('Links to private or local addresses are not allowed.');
  const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new Error('That address could not be found.');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('Links to private or local addresses are not allowed.');
  return u.toString();
}
