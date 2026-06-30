import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { draftEmail, DraftEmailParams } from '@/utils/api';

type EmailContext = 'teacher' | 'pediatrician' | 'activity' | 'other_parent' | 'work' | 'admin';

const CONTEXT_OPTIONS: { value: EmailContext; label: string }[] = [
  { value: 'teacher', label: 'Teacher / School' },
  { value: 'pediatrician', label: 'Doctor / Specialist' },
  { value: 'activity', label: 'Activity / Camp' },
  { value: 'other_parent', label: 'Other Parent' },
  { value: 'work', label: 'Work' },
  { value: 'admin', label: 'Other' },
];

export default function EmailDraftScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ taskText?: string; childName?: string; category?: string }>();

  const taskText = params.taskText ?? '';
  const childName = params.childName ?? '';

  const [recipientName, setRecipientName] = useState('');
  const [selectedContext, setSelectedContext] = useState<EmailContext>('teacher');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDraft = useCallback(async () => {
    console.log('[EmailDraft] "Draft Email" pressed — context:', selectedContext, '| task:', taskText.slice(0, 60), '| recipient:', recipientName || 'none', '| child:', childName || 'none');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setError(null);

    const draftParams: DraftEmailParams = {
      taskText,
      context: selectedContext,
      recipientName: recipientName.trim() || undefined,
      childName: childName.trim() || undefined,
      additionalNotes: additionalNotes.trim() || undefined,
    };

    try {
      const result = await draftEmail(draftParams);
      setDraftSubject(result.subject);
      setDraftBody(result.body);
      setHasDraft(true);
      console.log('[EmailDraft] Draft received — subject:', result.subject);
    } catch (err) {
      console.error('[EmailDraft] draftEmail error:', err);
      setError("Couldn't draft the email. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [taskText, selectedContext, recipientName, childName, additionalNotes]);

  const handleSendViaMail = useCallback(() => {
    const to = recipientName.trim() ? '' : '';
    const subject = encodeURIComponent(draftSubject);
    const body = encodeURIComponent(draftBody);
    const mailto = `mailto:${to}?subject=${subject}&body=${body}`;
    console.log('[EmailDraft] "Send via Mail App" pressed — subject:', draftSubject);
    Linking.openURL(mailto);
  }, [draftSubject, draftBody, recipientName]);

  const handleCopy = useCallback(async () => {
    const fullText = `Subject: ${draftSubject}\n\n${draftBody}`;
    console.log('[EmailDraft] "Copy to Clipboard" pressed');
    await Clipboard.setStringAsync(fullText);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [draftSubject, draftBody]);

  const handleBack = useCallback(() => {
    console.log('[EmailDraft] Back button pressed');
    router.back();
  }, [router]);

  const contextLabel = CONTEXT_OPTIONS.find((o) => o.value === selectedContext)?.label ?? '';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 80 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
          <Text style={styles.backArrow}>←</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Draft an Email</Text>
          <Text style={styles.titleSparkle}> ✦</Text>
        </View>

        {/* Task context card */}
        {taskText.length > 0 && (
          <View style={styles.contextCard}>
            <Text style={styles.contextCardLabel}>ABOUT</Text>
            <Text style={styles.contextCardText}>{taskText}</Text>
            {childName.length > 0 && (
              <View style={styles.childChip}>
                <Text style={styles.childChipText}>{childName}</Text>
              </View>
            )}
          </View>
        )}

        {/* Recipient name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Who is this to?</Text>
          <TextInput
            style={styles.input}
            placeholder="Recipient name (optional)"
            placeholderTextColor={Colors.textMuted}
            value={recipientName}
            onChangeText={setRecipientName}
          />
        </View>

        {/* Context picker */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>What's the context?</Text>
          <View style={styles.contextGrid}>
            {CONTEXT_OPTIONS.map((opt) => {
              const isSelected = selectedContext === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    styles.contextChip,
                    isSelected && styles.contextChipSelected,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => {
                    console.log('[EmailDraft] Context selected:', opt.value);
                    setSelectedContext(opt.value);
                  }}
                >
                  <Text style={[styles.contextChipText, isSelected && styles.contextChipTextSelected]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Additional notes */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Additional notes</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Anything else to include?"
            placeholderTextColor={Colors.textMuted}
            value={additionalNotes}
            onChangeText={setAdditionalNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Draft button */}
        {!hasDraft && (
          <TouchableOpacity
            style={[styles.draftButton, loading && styles.draftButtonDisabled]}
            onPress={handleDraft}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <View style={styles.draftButtonInner}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.draftButtonText}>Drafting…</Text>
              </View>
            ) : (
              <Text style={styles.draftButtonText}>Draft Email  ✦</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleDraft} activeOpacity={0.8}>
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Draft result */}
        {hasDraft && (
          <View style={styles.draftResult}>
            <View style={styles.draftResultHeader}>
              <Text style={styles.draftResultTitle}>Your draft is ready</Text>
              <Text style={styles.draftResultSubtitle}>Review and edit before sending.</Text>
            </View>

            {/* Subject */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Subject</Text>
              <TextInput
                style={styles.input}
                value={draftSubject}
                onChangeText={setDraftSubject}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Body */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Body</Text>
              <TextInput
                style={[styles.input, styles.bodyInput]}
                value={draftBody}
                onChangeText={setDraftBody}
                multiline
                textAlignVertical="top"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Actions */}
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSendViaMail}
              activeOpacity={0.85}
            >
              <Text style={styles.sendButtonText}>Send via Mail App  →</Text>
            </TouchableOpacity>
            {encodeURIComponent(draftSubject).length + encodeURIComponent(draftBody).length > 1800 && (
              <Text style={styles.mailtoWarning}>
                Tip: For long emails, use Copy to Clipboard and paste into your mail app for best results.
              </Text>
            )}

            <TouchableOpacity
              style={[styles.copyButton, copied && styles.copyButtonDone]}
              onPress={handleCopy}
              activeOpacity={0.85}
            >
              <Text style={[styles.copyButtonText, copied && styles.copyButtonTextDone]}>
                {copied ? 'Copied ✓' : 'Copy to Clipboard'}
              </Text>
            </TouchableOpacity>

            {/* Re-draft */}
            <TouchableOpacity
              style={styles.redraftButton}
              onPress={() => {
                console.log('[EmailDraft] "Re-draft" pressed');
                setHasDraft(false);
                setDraftSubject('');
                setDraftBody('');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.redraftButtonText}>Re-draft with different context</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 20,
    gap: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backArrow: {
    fontSize: 20,
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_400Regular',
  },
  backLabel: {
    fontSize: 16,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.primaryDeepRose,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 32,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
    letterSpacing: -0.4,
  },
  titleSparkle: {
    fontSize: 24,
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_700Bold',
    marginBottom: 2,
  },
  contextCard: {
    backgroundColor: Colors.primaryBlush + '18',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primaryBlush + '44',
    gap: 8,
  },
  contextCardLabel: {
    fontSize: 11,
    fontFamily: 'Nunito_700Bold',
    color: Colors.primaryDeepRose,
    letterSpacing: 1.2,
  },
  contextCardText: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMain,
    lineHeight: 22,
  },
  childChip: {
    backgroundColor: Colors.honey + '33',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  childChipText: {
    fontSize: 12,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textBody,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textMain,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontSize: 16,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMain,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  contextGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  contextChip: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: Colors.card,
  },
  contextChipSelected: {
    borderColor: Colors.primaryDeepRose,
    backgroundColor: Colors.primaryDeepRose + '18',
  },
  contextChipText: {
    fontSize: 14,
    fontFamily: 'Nunito_500Medium',
    color: Colors.textBody,
  },
  contextChipTextSelected: {
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_700Bold',
  },
  draftButton: {
    backgroundColor: Colors.primaryDeepRose,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primaryDeepRose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  draftButtonDisabled: {
    opacity: 0.7,
  },
  draftButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  draftButtonText: {
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
  },
  errorBox: {
    backgroundColor: '#C8846022',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#C8846044',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#C08060',
    fontFamily: 'Nunito_400Regular',
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryDeepRose + '22',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.primaryDeepRose + '44',
  },
  retryButtonText: {
    fontSize: 13,
    fontFamily: 'Nunito_700Bold',
    color: Colors.primaryDeepRose,
  },
  draftResult: {
    gap: 16,
  },
  draftResultHeader: {
    gap: 4,
  },
  draftResultTitle: {
    fontSize: 20,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  draftResultSubtitle: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  bodyInput: {
    minHeight: 220,
    textAlignVertical: 'top',
  },
  sendButton: {
    backgroundColor: Colors.primaryDeepRose,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: Colors.primaryDeepRose,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  sendButtonText: {
    fontSize: 16,
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
  },
  copyButton: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: Colors.card,
  },
  copyButtonDone: {
    borderColor: Colors.sage + '88',
    backgroundColor: Colors.sage + '18',
  },
  copyButtonText: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textBody,
  },
  copyButtonTextDone: {
    color: Colors.sage,
  },
  redraftButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  redraftButtonText: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
  mailtoWarning: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 6,
  },
});
