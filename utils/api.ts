export const BACKEND_URL = 'https://dquu5k3ghhrbb3rjpvqbshwn8u7w2tkw.app.specular.dev';

export interface OrganizeResponse {
  doToday: string[];
  thisWeek: string[];
  kids: string[];
  home: string[];
  errands: string[];
  meals: string[];
  messages: string[];
  holdingForLater: string[];
  momCheckIn: string;
}

export type OrganizeErrorKind = 'rate_limited' | 'server_error' | 'network';

export class OrganizeError extends Error {
  kind: OrganizeErrorKind;
  userMessage: string;
  constructor(kind: OrganizeErrorKind, userMessage: string) {
    super(userMessage);
    this.kind = kind;
    this.userMessage = userMessage;
  }
}

export async function organizeText(text: string): Promise<OrganizeResponse> {
  console.log('[API] POST /api/organize — sending brain dump, length:', text.length);

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/organize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (fetchErr) {
    console.error('[API] /api/organize network failure:', fetchErr);
    throw new OrganizeError('network', "I couldn't reach the cloud. Check your connection and try again.");
  }

  if (!response.ok) {
    let body: { error?: string; message?: string } = {};
    try {
      body = await response.json();
    } catch {
      const raw = await response.text().catch(() => '');
      console.error('[API] /api/organize error (non-JSON):', response.status, raw);
    }
    console.error('[API] /api/organize error:', response.status, body);
    if (body.error === 'rate_limited') {
      throw new OrganizeError('rate_limited', body.message ?? "Mom Brain needs a minute to catch up. Try again shortly.");
    }
    throw new OrganizeError('server_error', body.message ?? "Something got tangled. Try again.");
  }

  const data = await response.json();
  console.log('[API] /api/organize success — categories received:', Object.keys(data));

  if (!Array.isArray(data?.doToday)) {
    console.error('[API] /api/organize unexpected shape:', data);
    throw new OrganizeError('server_error', "Something got tangled. Try again.");
  }

  return data as OrganizeResponse;
}
