function bytesToHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let hex = '';
  for (let index = 0; index < view.length; index += 1) {
    hex += view[index].toString(16).padStart(2, '0');
  }
  return hex;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function createEditframeWebhookSignature(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return bytesToHex(signature);
}

export async function verifyEditframeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const normalizedSignature = signatureHeader.replace(/^sha256=/i, '').trim();
  const expected = await createEditframeWebhookSignature(rawBody, secret);
  return timingSafeEqual(normalizedSignature, expected);
}
