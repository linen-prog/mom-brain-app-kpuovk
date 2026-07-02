import { KidProfile, TaskMeta, TrackingItem, RhythmInsight } from '@/utils/storage';

export const BACKEND_URL = 'https://m2peqerqdjfgzaqymv2vasetgr2u3c3k.app.specular.dev';

export interface OrganizeResponse {
  doToday: string[];
  thisWeek: string[];
  kids: string[];
  home: string[];
  errands: string[];
  meals: string[];
  messages: string[];
  holdingForLater: string[];
  work?: string[];
  momCheckIn: string;
  taskMeta?: TaskMeta[];
  trackingItems?: TrackingItem[];
  rhythmInsights?: RhythmInsight;
}

export type CategoryKey = 'doToday' | 'thisWeek' | 'kids' | 'home' | 'errands' | 'meals' | 'messages' | 'work';

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

export async function organizeText(
  text: string,
  options?: { kids?: KidProfile[]; partnerName?: string }
): Promise<OrganizeResponse> {
  console.log('[API] POST /api/organize — sending brain dump, length:', text.length, '| kids:', options?.kids?.length ?? 0, '| partner:', options?.partnerName ?? 'none');

  const body: Record<string, unknown> = { text };
  if (options?.kids && options.kids.length > 0) body.kids = options.kids;
  if (options?.partnerName) body.partnerName = options.partnerName;

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/organize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    console.error('[API] /api/organize network failure:', fetchErr);
    throw new OrganizeError('network', "I couldn't reach the cloud. Check your connection and try again.");
  }

  if (!response.ok) {
    let errBody: { error?: string; message?: string } = {};
    try {
      errBody = await response.json();
    } catch {
      const raw = await response.text().catch(() => '');
      console.error('[API] /api/organize error (non-JSON):', response.status, raw);
    }
    console.error('[API] /api/organize error:', response.status, errBody);
    if (errBody.error === 'rate_limited') {
      throw new OrganizeError('rate_limited', errBody.message ?? "Mom Brain needs a minute to catch up. Try again shortly.");
    }
    throw new OrganizeError('server_error', errBody.message ?? "Something got tangled. Try again.");
  }

  const data = await response.json();
  console.log('[API] /api/organize success — categories received:', Object.keys(data));

  if (!Array.isArray(data?.doToday)) {
    console.error('[API] /api/organize unexpected shape:', data);
    throw new OrganizeError('server_error', "Something got tangled. Try again.");
  }

  return data as OrganizeResponse;
}

// ─── Draft email ──────────────────────────────────────────────────────────────

export interface DraftEmailParams {
  taskText: string;
  context: 'teacher' | 'pediatrician' | 'activity' | 'other_parent' | 'work' | 'admin';
  recipientName?: string;
  childName?: string;
  additionalNotes?: string;
}

export interface DraftEmailResponse {
  subject: string;
  body: string;
  recipientName?: string;
}

export async function draftEmail(params: DraftEmailParams): Promise<DraftEmailResponse> {
  console.log('[API] POST /api/draft-email — context:', params.context, '| task:', params.taskText.slice(0, 60));

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/draft-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch (fetchErr) {
    console.error('[API] /api/draft-email network failure:', fetchErr);
    throw new Error("I couldn't reach the cloud. Check your connection and try again.");
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    console.error('[API] /api/draft-email error:', response.status, raw);
    throw new Error("Couldn't draft the email. Try again in a moment.");
  }

  const data = await response.json();
  console.log('[API] /api/draft-email success — subject:', data.subject);
  return data as DraftEmailResponse;
}

// ─── Rhythm recap ─────────────────────────────────────────────────────────────

export interface RhythmRecapParams {
  completedTasks: string[];
  pendingTasks: string[];
  trackingItems: TrackingItem[];
}

export interface RhythmRecapResponse {
  doneThisWeek: string[];
  rollingOver: string[];
  comingUp: string[];
  momMessage: string;
  weekLabel: string;
}

// ─── Organize images ──────────────────────────────────────────────────────────

export interface OrganizeImageResponse extends OrganizeResponse {
  noActionableContent?: boolean;
  message?: string;
  source?: 'screenshot';
}

export async function organizeImages(
  images: { base64: string; mimeType: string }[],
  options?: { kids?: KidProfile[]; partnerName?: string }
): Promise<OrganizeImageResponse> {
  console.log('[API] POST /api/organize-image — images:', images.length, '| kids:', options?.kids?.length ?? 0, '| partner:', options?.partnerName ?? 'none');

  const body: Record<string, unknown> = { images };
  if (options?.kids && options.kids.length > 0) body.kids = options.kids;
  if (options?.partnerName) body.partnerName = options.partnerName;

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/organize-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    console.error('[API] /api/organize-image network failure:', fetchErr);
    throw new OrganizeError('network', "I couldn't reach the cloud. Check your connection and try again.");
  }

  if (!response.ok) {
    let errBody: { error?: string; message?: string } = {};
    try {
      errBody = await response.json();
    } catch {
      const raw = await response.text().catch(() => '');
      console.error('[API] /api/organize-image error (non-JSON):', response.status, raw);
    }
    console.error('[API] /api/organize-image error:', response.status, errBody);
    if (errBody.error === 'rate_limited') {
      throw new OrganizeError('rate_limited', errBody.message ?? "Mom Brain needs a minute to catch up. Try again shortly.");
    }
    throw new OrganizeError('server_error', errBody.message ?? "Something got tangled. Try again.");
  }

  const data = await response.json();
  console.log('[API] /api/organize-image success — noActionableContent:', data.noActionableContent ?? false, '| categories:', Object.keys(data));
  return data as OrganizeImageResponse;
}

// ─── Rhythm recap ─────────────────────────────────────────────────────────────

export async function getRhythmRecap(params: RhythmRecapParams): Promise<RhythmRecapResponse> {
  console.log('[API] POST /api/rhythm-recap — completed:', params.completedTasks.length, '| pending:', params.pendingTasks.length, '| tracking:', params.trackingItems.length);

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/rhythm-recap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch (fetchErr) {
    console.error('[API] /api/rhythm-recap network failure:', fetchErr);
    throw new Error("I couldn't reach the cloud. Check your connection and try again.");
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    console.error('[API] /api/rhythm-recap error:', response.status, raw);
    throw new Error("Couldn't generate your recap. Try again in a moment.");
  }

  const data = await response.json();
  console.log('[API] /api/rhythm-recap success — weekLabel:', data.weekLabel);
  return data as RhythmRecapResponse;
}
