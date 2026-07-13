import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLatestDump, getDumpHistory, getKids, OrganizedDump } from '@/utils/storage';
import { authenticatedPost } from '@/utils/api';

const MIGRATION_KEY_PREFIX = 'mombrain.migrationDone.';

function fallbackId(): string {
  return `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ensureId(dump: OrganizedDump): OrganizedDump {
  if (!dump.id) {
    return { ...dump, id: fallbackId() };
  }
  return dump;
}

export async function runMigration(userId: string): Promise<void> {
  const migrationKey = `${MIGRATION_KEY_PREFIX}${userId}`;

  try {
    const alreadyDone = await AsyncStorage.getItem(migrationKey);
    if (alreadyDone === 'true') {
      console.log('[Migration] already done for user:', userId, '— skipping');
      return;
    }

    console.log('[Migration] starting for user:', userId);

    const [latestDumpRaw, historyRaw, kidsRaw, partnerName, onboardingDone] = await Promise.all([
      getLatestDump(),
      getDumpHistory(),
      getKids(),
      AsyncStorage.getItem('mombrain.partnerName'),
      AsyncStorage.getItem('mombrain.onboardingDone'),
    ]);

    console.log('[Migration] local data read — latestDump:', !!latestDumpRaw, 'history:', historyRaw.length, 'kids:', kidsRaw.length);

    const latestDump = latestDumpRaw ? ensureId(latestDumpRaw) : null;
    const history = historyRaw.map(ensureId);

    // Deduplicate: merge latestDump into history, latestDump takes precedence
    const byId = new Map<string, OrganizedDump>();
    for (const d of history) {
      byId.set(d.id, d);
    }
    if (latestDump) {
      byId.set(latestDump.id, latestDump);
    }

    const deduplicatedDumps = Array.from(byId.values()).slice(0, 12);

    const payload = {
      dumps: deduplicatedDumps.map(d => ({
        id: d.id,
        originalText: d.originalText,
        inputSource: d.inputSource ?? 'typed',
        momCheckIn: d.momCheckIn ?? null,
        rhythmInsights: d.rhythmInsights ?? null,
        isLatest: latestDump ? d.id === latestDump.id : false,
        createdAt: d.createdAt,
        taskMeta: d.taskMeta ?? [],
      })),
      kids: kidsRaw.map(k => ({
        id: k.id,
        name: k.name,
        age: k.age ?? null,
        grade: k.grade ?? null,
        nicknames: k.nicknames ?? null,
      })),
      partnerName: partnerName ?? null,
      onboardingDone: onboardingDone === 'true',
    };

    console.log('[Migration] sending payload — dumps:', payload.dumps.length, 'kids:', payload.kids.length);

    const response = await authenticatedPost<{
      migrated: boolean;
      reason?: string;
      dumpsInserted: number;
      tasksInserted: number;
      kidsInserted: number;
    }>('/api/migrate/local-data', payload);

    if (response.migrated === true || response.reason === 'already_migrated') {
      await AsyncStorage.setItem(migrationKey, 'true');
      console.log(
        `[Migration] complete — dumpsInserted: ${response.dumpsInserted}, tasksInserted: ${response.tasksInserted}, kidsInserted: ${response.kidsInserted}`
      );
    } else {
      console.warn('[Migration] server returned migrated=false, reason:', response.reason);
    }
  } catch (error) {
    console.error('[Migration] error (will retry next launch):', error);
    // Do NOT set migrationDone — allow retry on next launch
  }
}
