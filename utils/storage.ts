import AsyncStorage from '@react-native-async-storage/async-storage';

const DUMP_KEY = 'mombrain.latestDump';
const KIDS_KEY = 'mombrain.kids';
const PARTNER_KEY = 'mombrain.partnerName';
const ONBOARDING_KEY = 'mombrain.onboardingDone';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface KidProfile {
  id: string;
  name: string;
  age?: number;
  grade?: string;
  nicknames?: string[];
}

export interface TaskMeta {
  taskText: string;
  category: string;
  childName?: string | null;
  delegation: 'me' | 'partner' | 'coparent' | 'kid';
  isPartnerTask: boolean;
}

export interface TrackingItem {
  id: string;
  text: string;
  dueDate?: string | null;
  category: 'tracking';
}

export interface RhythmInsight {
  topCategories: string[];
  recurringThemes: string[];
  momCheckIn: string;
}

export interface OrganizedDump {
  id: string;
  createdAt: string;
  originalText: string;
  doToday: string[];
  thisWeek: string[];
  kids: string[];
  home: string[];
  errands: string[];
  meals: string[];
  messages: string[];
  holdingForLater: string[];
  work: string[];
  momCheckIn: string;
  completed: Record<string, boolean>;
  taskMeta?: TaskMeta[];
  trackingItems?: TrackingItem[];
  rhythmInsights?: RhythmInsight;
  inputSource?: 'voice' | 'typed' | 'screenshot';
}

// ─── Dump storage ─────────────────────────────────────────────────────────────

export async function getLatestDump(): Promise<OrganizedDump | null> {
  try {
    const raw = await AsyncStorage.getItem(DUMP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrganizedDump;
    // Backward-compat: older dumps won't have work
    if (!Array.isArray(parsed.work)) parsed.work = [];
    return parsed;
  } catch (err) {
    console.error('[Storage] getLatestDump error:', err);
    return null;
  }
}

export async function saveLatestDump(dump: OrganizedDump): Promise<void> {
  try {
    await AsyncStorage.setItem(DUMP_KEY, JSON.stringify(dump));
    console.log('[Storage] saveLatestDump — saved dump id:', dump.id);
  } catch (err) {
    console.error('[Storage] saveLatestDump error:', err);
  }
}

export async function updateCompleted(key: string, value: boolean): Promise<void> {
  try {
    const dump = await getLatestDump();
    if (!dump) return;
    const updated: OrganizedDump = {
      ...dump,
      completed: { ...dump.completed, [key]: value },
    };
    await AsyncStorage.setItem(DUMP_KEY, JSON.stringify(updated));
    console.log('[Storage] updateCompleted —', key, '=', value);
  } catch (err) {
    console.error('[Storage] updateCompleted error:', err);
  }
}

export async function addItemToCategory(
  category: 'doToday' | 'thisWeek' | 'kids' | 'home' | 'errands' | 'meals' | 'messages' | 'work',
  item: string
): Promise<OrganizedDump | null> {
  try {
    console.log('[Storage] addItemToCategory —', category, ':', item);
    const dump = await getLatestDump();
    if (!dump) return null;
    const updated: OrganizedDump = {
      ...dump,
      [category]: [...(dump[category] ?? []), item],
    };
    await saveLatestDump(updated);
    return updated;
  } catch (err) {
    console.error('[Storage] addItemToCategory error:', err);
    return null;
  }
}

const HISTORY_KEY = 'mombrain.dumpHistory';

export async function clearLatestDump(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DUMP_KEY);
    console.log('[Storage] clearLatestDump — cleared');
  } catch (err) {
    console.error('[Storage] clearLatestDump error:', err);
  }
}

export async function clearDumpHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
    console.log('[Storage] clearDumpHistory — cleared');
  } catch (err) {
    console.error('[Storage] clearDumpHistory error:', err);
  }
}

export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([DUMP_KEY, HISTORY_KEY]);
    console.log('[Storage] clearAllData — cleared both keys');
  } catch (err) {
    console.error('[Storage] clearAllData error:', err);
  }
}

// ─── Kids storage ─────────────────────────────────────────────────────────────

export async function getKids(): Promise<KidProfile[]> {
  try {
    const raw = await AsyncStorage.getItem(KIDS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as KidProfile[];
  } catch (err) {
    console.error('[Storage] getKids error:', err);
    return [];
  }
}

export async function saveKids(kids: KidProfile[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KIDS_KEY, JSON.stringify(kids));
    console.log('[Storage] saveKids — saved', kids.length, 'kids');
  } catch (err) {
    console.error('[Storage] saveKids error:', err);
  }
}

// ─── Partner name storage ─────────────────────────────────────────────────────

export async function getPartnerName(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PARTNER_KEY);
  } catch (err) {
    console.error('[Storage] getPartnerName error:', err);
    return null;
  }
}

export async function savePartnerName(name: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PARTNER_KEY, name);
    console.log('[Storage] savePartnerName — saved:', name);
  } catch (err) {
    console.error('[Storage] savePartnerName error:', err);
  }
}

// ─── Onboarding storage ───────────────────────────────────────────────────────

export async function getOnboardingDone(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_KEY);
    return val === 'true';
  } catch (err) {
    console.error('[Storage] getOnboardingDone error:', err);
    return false;
  }
}

export async function setOnboardingDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    console.log('[Storage] setOnboardingDone — marked complete');
  } catch (err) {
    console.error('[Storage] setOnboardingDone error:', err);
  }
}
