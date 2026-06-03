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
  momCheckIn: string;
  completed: Record<string, boolean>;
}

export async function getLatestDump(): Promise<OrganizedDump | null> {
  try {
    const raw = await AsyncStorage.getItem(DUMP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OrganizedDump;
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
