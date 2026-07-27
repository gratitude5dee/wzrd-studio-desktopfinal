import { appRoutes } from '@/lib/routes';

export interface InsufficientCreditsPayload {
  code: 'insufficient_credits';
  required: number;
  available: number;
  top_up_url: string;
  upgrade_url?: string;
  error?: string;
}

const DEFAULT_TOP_UP_URL = appRoutes.systemBilling;

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parsePayloadCandidate(value: unknown): InsufficientCreditsPayload | null {
  const payload = parseObject(value);
  const code = payload.code;
  if (code !== 'insufficient_credits') return null;

  return {
    code: 'insufficient_credits',
    required: asNumber(payload.required, 0),
    available: asNumber(payload.available, 0),
    top_up_url: typeof payload.top_up_url === 'string' ? payload.top_up_url : DEFAULT_TOP_UP_URL,
    upgrade_url: typeof payload.upgrade_url === 'string' ? payload.upgrade_url : undefined,
    error: typeof payload.error === 'string' ? payload.error : undefined,
  };
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  try {
    const cloned = response.clone();
    const text = await cloned.text();
    if (!text) return null;
    return parseJsonString(text);
  } catch {
    return null;
  }
}

export async function extractInsufficientCreditsFromResponse(
  response: Response
): Promise<InsufficientCreditsPayload | null> {
  if (response.status !== 402) return null;
  const parsed = await parseResponseBody(response);
  return parsePayloadCandidate(parsed);
}

export async function extractInsufficientCreditsError(
  error: unknown
): Promise<InsufficientCreditsPayload | null> {
  const direct = parsePayloadCandidate(error);
  if (direct) return direct;

  const parsedError = parseObject(error);

  if (parsedError.context instanceof Response) {
    const fromResponse = await extractInsufficientCreditsFromResponse(parsedError.context);
    if (fromResponse) return fromResponse;
  }

  if (parsedError.response instanceof Response) {
    const fromResponse = await extractInsufficientCreditsFromResponse(parsedError.response);
    if (fromResponse) return fromResponse;
  }

  const message = typeof parsedError.message === 'string' ? parsedError.message : '';
  if (message) {
    const parsedMessage = parseJsonString(message);
    const fromMessagePayload = parsePayloadCandidate(parsedMessage);
    if (fromMessagePayload) return fromMessagePayload;

    if (message.toLowerCase().includes('insufficient credits') || message.includes('402')) {
      return {
        code: 'insufficient_credits',
        required: 0,
        available: 0,
        top_up_url: DEFAULT_TOP_UP_URL,
      };
    }
  }

  return null;
}

export function routeToBillingTopUp(payload?: Partial<InsufficientCreditsPayload>): void {
  if (typeof window === 'undefined') return;

  // Event-first dispatch: surfaces in-app via the global
  // <InsufficientCreditsDialog> so users don't lose their current page state.
  try {
    window.dispatchEvent(
      new CustomEvent('billing:insufficient-credits', {
        detail: {
          required: payload?.required ?? 0,
          available: payload?.available ?? 0,
          topUpUrl: payload?.top_up_url || DEFAULT_TOP_UP_URL,
        },
      })
    );
  } catch {
    // ignore
  }

  const isBillingRoute = window.location.pathname.startsWith('/settings/billing');
  if (isBillingRoute) {
    // On the billing page already — also open the legacy in-page top-up modal.
    window.dispatchEvent(
      new CustomEvent('billing:open-topup', {
        detail: {
          required: payload?.required ?? 0,
          available: payload?.available ?? 0,
        },
      })
    );
  }
  // Note: navigation is now handled by the dialog's CTAs, not here.
}
