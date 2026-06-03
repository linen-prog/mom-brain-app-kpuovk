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

export async function organizeText(text: string): Promise<OrganizeResponse> {
  console.log('[API] POST /api/organize — sending brain dump, length:', text.length);
  const response = await fetch(`${BACKEND_URL}/api/organize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[API] /api/organize error:', response.status, errorText);
    throw new Error(`Request failed with status ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  console.log('[API] /api/organize success — categories received:', Object.keys(data));
  return data as OrganizeResponse;
}
