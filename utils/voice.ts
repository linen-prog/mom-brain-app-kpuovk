/**
 * voice.ts — permissions + transcription helpers for the Dump screen.
 *
 * Architecture note: expo-audio SDK 54 exposes recording via the `useAudioRecorder`
 * hook (not a class-based imperative API). Because hooks can only be called inside
 * React components, the recording lifecycle (prepareToRecordAsync / record / stop)
 * is handled directly in the Dump screen using `useAudioRecorder` and
 * `useAudioRecorderState`. This file handles:
 *   1. Permission requests (AudioModule.requestRecordingPermissionsAsync)
 *   2. Transcription upload (multipart POST to /api/transcribe)
 */

import { AudioModule } from 'expo-audio';
import { BACKEND_URL } from './api';

// ─── Error type ──────────────────────────────────────────────────────────────

export type VoiceErrorKind =
  | 'permission_denied'
  | 'recording_failed'
  | 'transcribe_failed'
  | 'rate_limited'
  | 'empty'
  | 'network';

export class VoiceError extends Error {
  kind: VoiceErrorKind;
  userMessage: string;

  constructor(kind: VoiceErrorKind, userMessage: string) {
    super(userMessage);
    this.name = 'VoiceError';
    this.kind = kind;
    this.userMessage = userMessage;
  }
}

// ─── Permission ──────────────────────────────────────────────────────────────

/**
 * Requests microphone permission via expo-audio's AudioModule.
 * Returns true if granted, false otherwise.
 */
export async function requestMicPermission(): Promise<boolean> {
  console.log('[Voice] Requesting microphone permission…');
  try {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    console.log('[Voice] Permission result:', status.status, '| granted:', status.granted);
    return status.granted;
  } catch (err) {
    console.error('[Voice] Permission request threw:', err);
    return false;
  }
}

// ─── Transcription ───────────────────────────────────────────────────────────

/**
 * Uploads the recorded audio file to /api/transcribe and returns the transcript.
 * Throws VoiceError on any failure.
 */
export async function transcribeAudio(uri: string): Promise<string> {
  console.log('[Voice] Starting transcription upload — uri:', uri);

  const form = new FormData();
  // React Native FormData accepts a plain object with uri/name/type as the file blob.
  form.append('audio', { uri, name: 'dump.m4a', type: 'audio/m4a' } as unknown as Blob);

  let response: Response;
  try {
    console.log('[Voice] POST', `${BACKEND_URL}/api/transcribe`);
    response = await fetch(`${BACKEND_URL}/api/transcribe`, {
      method: 'POST',
      body: form,
    });
  } catch (fetchErr) {
    console.error('[Voice] Network error during transcription upload:', fetchErr);
    throw new VoiceError(
      'network',
      "I couldn't reach the cloud. Check your connection and try again."
    );
  }

  if (response.status === 429) {
    console.warn('[Voice] Transcription rate-limited (429)');
    throw new VoiceError(
      'rate_limited',
      'Mom Brain needs a minute to catch up. Try again shortly.'
    );
  }

  if (!response.ok) {
    let errBody = '';
    try {
      errBody = await response.text();
    } catch {
      // ignore
    }
    console.error('[Voice] Transcription error:', response.status, errBody);
    throw new VoiceError(
      'transcribe_failed',
      'Something got tangled while listening. Try again.'
    );
  }

  let data: { text?: string; transcript?: string };
  try {
    data = await response.json();
  } catch (parseErr) {
    console.error('[Voice] Failed to parse transcription response:', parseErr);
    throw new VoiceError(
      'transcribe_failed',
      'Something got tangled while listening. Try again.'
    );
  }

  const transcript = (data.text ?? data.transcript ?? '').trim();
  console.log('[Voice] Transcript received — length:', transcript.length);

  if (!transcript) {
    throw new VoiceError(
      'empty',
      "I didn't catch any words. Try once more, or type it in."
    );
  }

  return transcript;
}
