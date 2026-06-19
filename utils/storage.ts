import AsyncStorage from '@react-native-async-storage/async-storage';

const DUMP_KEY = 'mombrain.latestDump';

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
}

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
