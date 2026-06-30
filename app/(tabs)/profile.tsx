import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  Linking,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as StoreReview from 'expo-store-review';
import Constants from 'expo-constants';
import { Colors } from '@/constants/Colors';
import {
  clearAllData,
  getKids,
  saveKids,
  getPartnerName,
  savePartnerName,
  KidProfile,
} from '@/utils/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileRowProps {
  label: string;
  onPress: () => void;
  labelColor?: string;
  rightText?: string;
  showChevron?: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.sectionDot} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ProfileRow({ label, onPress, labelColor, rightText, showChevron = true }: ProfileRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <Text style={[styles.rowLabel, labelColor ? { color: labelColor } : undefined]}>
        {label}
      </Text>
      <View style={styles.rowRight}>
        {rightText ? <Text style={styles.rowRightText}>{rightText}</Text> : null}
        {showChevron && <Text style={styles.chevron}>›</Text>}
      </View>
    </Pressable>
  );
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [howItWorksVisible, setHowItWorksVisible] = useState(false);

  // Kids state
  const [kids, setKids] = useState<KidProfile[]>([]);
  const [kidModalVisible, setKidModalVisible] = useState(false);
  const [editingKid, setEditingKid] = useState<KidProfile | null>(null);
  const [kidName, setKidName] = useState('');
  const [kidAge, setKidAge] = useState('');
  const [kidGrade, setKidGrade] = useState('');
  const [kidNicknames, setKidNicknames] = useState('');

  // Partner name state
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [partnerModalVisible, setPartnerModalVisible] = useState(false);
  const [partnerNameInput, setPartnerNameInput] = useState('');

  const isSignedIn = false;
  const userEmail: string | null = null;
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    getKids().then(setKids);
    getPartnerName().then(setPartnerName);
  }, []);

  // ── Kids handlers ────────────────────────────────────────────────────────

  const openAddKid = useCallback(() => {
    console.log('[Profile] "+ Add a child" pressed');
    setEditingKid(null);
    setKidName('');
    setKidAge('');
    setKidGrade('');
    setKidNicknames('');
    setKidModalVisible(true);
  }, []);

  const openEditKid = useCallback((kid: KidProfile) => {
    console.log('[Profile] Edit kid pressed —', kid.name);
    setEditingKid(kid);
    setKidName(kid.name);
    setKidAge(kid.age !== undefined ? String(kid.age) : '');
    setKidGrade(kid.grade ?? '');
    setKidNicknames(kid.nicknames?.join(', ') ?? '');
    setKidModalVisible(true);
  }, []);

  const handleSaveKid = useCallback(async () => {
    if (!kidName.trim()) return;
    console.log('[Profile] Save kid pressed —', kidName.trim(), '| editing:', editingKid?.id ?? 'new');
    const nicknames = kidNicknames.trim()
      ? kidNicknames.split(',').map((n) => n.trim()).filter(Boolean)
      : undefined;
    const ageNum = kidAge.trim() ? parseInt(kidAge.trim(), 10) : undefined;

    let updated: KidProfile[];
    if (editingKid) {
      updated = kids.map((k) =>
        k.id === editingKid.id
          ? { ...k, name: kidName.trim(), age: ageNum, grade: kidGrade.trim() || undefined, nicknames }
          : k
      );
    } else {
      const newKid: KidProfile = {
        id: Date.now().toString(),
        name: kidName.trim(),
        age: ageNum,
        grade: kidGrade.trim() || undefined,
        nicknames,
      };
      updated = [...kids, newKid];
    }
    await saveKids(updated);
    setKids(updated);
    setKidModalVisible(false);
  }, [kids, editingKid, kidName, kidAge, kidGrade, kidNicknames]);

  const handleDeleteKid = useCallback(async () => {
    if (!editingKid) return;
    console.log('[Profile] Delete kid pressed —', editingKid.name);
    Alert.alert(
      `Remove ${editingKid.name}?`,
      'This will remove them from your kids list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            console.log('[Profile] Delete kid confirmed —', editingKid.name);
            const updated = kids.filter((k) => k.id !== editingKid.id);
            await saveKids(updated);
            setKids(updated);
            setKidModalVisible(false);
          },
        },
      ]
    );
  }, [editingKid, kids]);

  // ── Partner handlers ─────────────────────────────────────────────────────

  const openPartnerModal = useCallback(() => {
    console.log('[Profile] Partner name row pressed — current:', partnerName ?? 'none');
    setPartnerNameInput(partnerName ?? '');
    setPartnerModalVisible(true);
  }, [partnerName]);

  const handleSavePartner = useCallback(async () => {
    console.log('[Profile] Save partner name pressed —', partnerNameInput.trim());
    const name = partnerNameInput.trim();
    await savePartnerName(name);
    setPartnerName(name || null);
    setPartnerModalVisible(false);
  }, [partnerNameInput]);

  // ── Other handlers ───────────────────────────────────────────────────────

  const handleRateApp = useCallback(async () => {
    console.log('[Profile] Rate App pressed');
    const available = await StoreReview.isAvailableAsync();
    if (available) {
      await StoreReview.requestReview();
    } else {
      Alert.alert('Rate Mom Brain', 'Rating will be available once Mom Brain is live in the App Store.', [{ text: 'OK' }]);
    }
  }, []);

  const handleReportProblem = useCallback(() => {
    console.log('[Profile] Report a Problem pressed');
    const subject = encodeURIComponent('Mom Brain Problem Report');
    const body = encodeURIComponent('What happened?\n\n\nWhat screen were you on?\n\n\nDevice / App version if known:\n');
    Linking.openURL(`mailto:help@theosomatic.com?subject=${subject}&body=${body}`);
  }, []);

  const handleSuggestFeature = useCallback(() => {
    console.log('[Profile] Suggest a Feature pressed');
    const subject = encodeURIComponent('Mom Brain Feature Suggestion');
    const body = encodeURIComponent("I'd love Mom Brain to help with...\n\n");
    Linking.openURL(`mailto:help@theosomatic.com?subject=${subject}&body=${body}`);
  }, []);

  const handlePrivacyPolicy = useCallback(() => {
    console.log('[Profile] Privacy Policy pressed');
    Linking.openURL('https://theosomatic.com/privacy');
  }, []);

  const handleTermsOfUse = useCallback(() => {
    console.log('[Profile] Terms of Use pressed');
    Linking.openURL('https://theosomatic.com/terms');
  }, []);

  const handleClearDumps = useCallback(() => {
    console.log('[Profile] Clear Saved Brain Dumps pressed');
    Alert.alert(
      'Clear Saved Brain Dumps?',
      'This will remove your current organized plan from Today and all saved history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            console.log('[Profile] Clear confirmed — calling clearAllData');
            await clearAllData();
            Alert.alert('Cleared', 'Your brain dumps and history have been removed.');
          },
        },
      ]
    );
  }, []);

  const handleDeleteAccount = useCallback(() => {
    console.log('[Profile] Delete Account pressed');
    if (!isSignedIn) {
      Alert.alert('No Account Found', 'Account deletion will be available once you sign in. Your local data can be cleared using "Clear Saved Brain Dumps."', [{ text: 'OK' }]);
      return;
    }
    Alert.alert(
      'Delete Account?',
      'This will permanently delete your Mom Brain account and all associated data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Are you sure?', 'Your account and all data will be permanently deleted.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Yes, Delete',
                style: 'destructive',
                onPress: async () => {
                  console.log('[Profile] Delete Account confirmed');
                  await clearAllData();
                  Alert.alert('Account deletion will be available before public launch.');
                },
              },
            ]);
          },
        },
      ]
    );
  }, [isSignedIn]);

  const handleSignIn = useCallback(() => {
    console.log('[Profile] Sign In pressed');
    Alert.alert('Sign In', 'Account sign-in will be available in an upcoming update. Your lists are safely stored on this device.', [{ text: 'OK' }]);
  }, []);

  const handleSignOut = useCallback(() => {
    console.log('[Profile] Sign Out pressed');
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => {} },
    ]);
  }, []);

  const handleContactSupport = useCallback(() => {
    console.log('[Profile] Contact Support pressed');
    const subject = encodeURIComponent('Mom Brain Support');
    Linking.openURL(`mailto:help@theosomatic.com?subject=${subject}`);
  }, []);

  const handleHowItWorks = useCallback(() => {
    console.log('[Profile] How Mom Brain Works pressed');
    setHowItWorksVisible(true);
  }, []);

  const handleHowItWorksClose = useCallback(() => {
    console.log('[Profile] How Mom Brain Works modal closed');
    setHowItWorksVisible(false);
  }, []);

  const paddingTop = insets.top + 20;
  const paddingBottom = insets.bottom + 120;

  const partnerDisplayName = partnerName && partnerName.trim() ? partnerName.trim() : 'Not set';

  return (
    <View style={[styles.flex, { backgroundColor: Colors.background }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop, paddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Your account, support, and settings.</Text>

        {/* Kids card */}
        <SectionCard title="Kids">
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={openAddKid}
          >
            <Text style={[styles.rowLabel, { color: Colors.primaryDeepRose }]}>+ Add a child</Text>
          </Pressable>
          {kids.map((kid, index) => {
            const ageLabel = kid.age !== undefined ? `, age ${kid.age}` : '';
            const kidLabel = `${kid.name}${ageLabel}`;
            return (
              <View key={kid.id}>
                <RowDivider />
                <ProfileRow
                  label={kidLabel}
                  onPress={() => openEditKid(kid)}
                  rightText=""
                  showChevron
                />
              </View>
            );
          })}
        </SectionCard>

        {/* Account card */}
        <SectionCard title="Account">
          {isSignedIn && userEmail ? (
            <View style={styles.accountSignedIn}>
              <View style={styles.accountEmailRow}>
                <Text style={styles.accountEmail}>{userEmail}</Text>
                <View style={styles.signedInBadge}>
                  <Text style={{ fontSize: 14, color: Colors.sage }}>✓</Text>
                  <Text style={styles.signedInText}>Signed in</Text>
                </View>
              </View>
              <Text style={styles.accountHelper}>
                Mom Brain keeps your organized lists connected to your account.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.signOutButton, pressed && { opacity: 0.8 }]}
                onPress={handleSignOut}
              >
                <Text style={styles.signOutButtonText}>Sign Out</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.accountSignedOut}>
              <Text style={styles.accountSignedOutText}>Your lists are saved on this device.</Text>
              <Text style={styles.accountHelper}>
                Sign in to keep your organized lists connected across devices.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.signInButton, pressed && { opacity: 0.8 }]}
                onPress={handleSignIn}
              >
                <Text style={styles.signInButtonText}>Sign In</Text>
              </Pressable>
            </View>
          )}
          <RowDivider />
          <ProfileRow
            label="Partner's name"
            onPress={openPartnerModal}
            rightText={partnerDisplayName}
            showChevron
          />
        </SectionCard>

        {/* Support card */}
        <SectionCard title="Support">
          <ProfileRow label="Rate This App" onPress={handleRateApp} />
          <RowDivider />
          <ProfileRow label="Report a Problem" onPress={handleReportProblem} />
          <RowDivider />
          <ProfileRow label="Suggest a Feature" onPress={handleSuggestFeature} />
        </SectionCard>

        {/* Data & Privacy card */}
        <SectionCard title="Data & Privacy">
          <ProfileRow label="Privacy Policy" onPress={handlePrivacyPolicy} />
          <RowDivider />
          <ProfileRow label="Terms of Use" onPress={handleTermsOfUse} />
          <RowDivider />
          <ProfileRow label="Clear Saved Brain Dumps" onPress={handleClearDumps} />
          <RowDivider />
          <ProfileRow label="Delete Account" onPress={handleDeleteAccount} labelColor={Colors.primaryDeepRose} />
        </SectionCard>

        {/* About card */}
        <SectionCard title="About">
          <ProfileRow label="How Mom Brain Works" onPress={handleHowItWorks} />
          <RowDivider />
          <ProfileRow label="App Version" onPress={() => {}} rightText={appVersion} showChevron={false} />
          <RowDivider />
          <ProfileRow label="Contact Support" onPress={handleContactSupport} />
        </SectionCard>
      </ScrollView>

      {/* How Mom Brain Works modal */}
      <Modal visible={howItWorksVisible} transparent animationType="slide" onRequestClose={handleHowItWorksClose}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={handleHowItWorksClose} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>How Mom Brain Works</Text>
            <Text style={styles.modalBody}>
              Dump what's in your head by voice or text. Mom Brain organizes it into Today, This Week, Later, and helpful categories so you can see the next right thing.
            </Text>
            <Text style={styles.modalBody}>
              Your brain dump is sent to a secure AI that sorts it — nothing is stored on our servers beyond what's needed to organize your list.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.modalCloseButton, pressed && { opacity: 0.8 }]}
              onPress={handleHowItWorksClose}
            >
              <Text style={styles.modalCloseButtonText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Add / Edit Kid modal */}
      <Modal visible={kidModalVisible} transparent animationType="slide" onRequestClose={() => setKidModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => {
            console.log('[Profile] Kid modal dismissed');
            setKidModalVisible(false);
          }} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editingKid ? `Edit ${editingKid.name}` : 'Add a child'}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Emma"
                placeholderTextColor={Colors.textMuted}
                value={kidName}
                onChangeText={setKidName}
                autoFocus
              />
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Age</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 8"
                  placeholderTextColor={Colors.textMuted}
                  value={kidAge}
                  onChangeText={setKidAge}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Grade</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 3rd"
                  placeholderTextColor={Colors.textMuted}
                  value={kidGrade}
                  onChangeText={setKidGrade}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nicknames (comma-separated)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Em, Emmy"
                placeholderTextColor={Colors.textMuted}
                value={kidNicknames}
                onChangeText={setKidNicknames}
              />
            </View>

            <View style={styles.modalActions}>
              {editingKid && (
                <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteKid}>
                  <Text style={styles.deleteButtonText}>Remove</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.modalCancel} onPress={() => {
                console.log('[Profile] Kid modal cancel pressed');
                setKidModalVisible(false);
              }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, !kidName.trim() && styles.modalConfirmDisabled]}
                onPress={handleSaveKid}
                disabled={!kidName.trim()}
              >
                <Text style={styles.modalConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Partner name modal */}
      <Modal visible={partnerModalVisible} transparent animationType="slide" onRequestClose={() => setPartnerModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => {
            console.log('[Profile] Partner modal dismissed');
            setPartnerModalVisible(false);
          }} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Partner's name</Text>
            <Text style={styles.modalBody}>
              This helps Mom Brain know who to assign tasks to when you mention your partner.
            </Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Alex"
                placeholderTextColor={Colors.textMuted}
                value={partnerNameInput}
                onChangeText={setPartnerNameInput}
                autoFocus
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => {
                console.log('[Profile] Partner modal cancel pressed');
                setPartnerModalVisible(false);
              }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleSavePartner}>
                <Text style={styles.modalConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  title: {
    fontSize: 38,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 17,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    marginTop: -6,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    shadowColor: '#3F312C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primaryDeepRose,
  },
  cardTitle: {
    fontSize: 20,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  rowPressed: { opacity: 0.65 },
  rowLabel: {
    fontSize: 16,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMain,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowRightText: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  chevron: {
    fontSize: 20,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 22,
  },
  accountSignedIn: { gap: 10 },
  accountSignedOut: { gap: 10 },
  accountEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  accountEmail: {
    fontSize: 16,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textMain,
  },
  signedInBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  signedInText: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: Colors.sage,
  },
  accountHelper: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    lineHeight: 18,
  },
  accountSignedOutText: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryDeepRose,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  signOutButtonText: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.primaryDeepRose,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  signInButtonText: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
    color: Colors.primaryDeepRose,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(63, 49, 44, 0.35)',
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 14,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  modalBody: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    lineHeight: 23,
  },
  modalCloseButton: {
    backgroundColor: Colors.primaryDeepRose,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  modalCloseButtonText: {
    fontSize: 16,
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
  },
  inputGroup: {
    gap: 6,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textBody,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontSize: 16,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMain,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  deleteButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C8846044',
    backgroundColor: '#C8846014',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: '#C08060',
  },
  modalCancel: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textBody,
  },
  modalConfirm: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: Colors.primaryDeepRose,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalConfirmDisabled: { opacity: 0.45 },
  modalConfirmText: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
  },
});
