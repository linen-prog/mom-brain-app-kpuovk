import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { BEARER_TOKEN_KEY } from "@/lib/auth";

export const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || "";

export const isBackendConfigured = (): boolean => {
  return !!BACKEND_URL && BACKEND_URL.length > 0;
};

export const getBearerToken = async (): Promise<string | null> => {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(BEARER_TOKEN_KEY);
    } else {
      return await SecureStore.getItemAsync(BEARER_TOKEN_KEY);
    }
  } catch (error) {
    console.error("[API] Error retrieving bearer token:", error);
    return null;
  }
};

export const apiCall = async <T = any>(
  endpoint: string,
  options?: RequestInit
): Promise<T> => {
  if (!isBackendConfigured()) {
    throw new Error("Backend URL not configured. Please rebuild the app.");
  }

  const url = `${BACKEND_URL}${endpoint}`;

  const fetchOptions: RequestInit = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  };

  const token = await getBearerToken();
  if (token) {
    fetchOptions.headers = {
      ...fetchOptions.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} - ${text}`);
  }

  return response.json();
};

export const apiGet = async <T = any>(endpoint: string): Promise<T> => {
  return apiCall<T>(endpoint, { method: "GET" });
};

export const apiPost = async <T = any>(endpoint: string, data: any): Promise<T> => {
  return apiCall<T>(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const apiPut = async <T = any>(endpoint: string, data: any): Promise<T> => {
  return apiCall<T>(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

export const apiPatch = async <T = any>(endpoint: string, data: any): Promise<T> => {
  return apiCall<T>(endpoint, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
};

export const apiDelete = async <T = any>(endpoint: string, data: any = {}): Promise<T> => {
  return apiCall<T>(endpoint, {
    method: "DELETE",
    body: JSON.stringify(data),
  });
};

export const authenticatedApiCall = async <T = any>(
  endpoint: string,
  options?: RequestInit
): Promise<T> => {
  const token = await getBearerToken();

  if (!token) {
    throw new Error("Authentication token not found. Please sign in.");
  }

  return apiCall<T>(endpoint, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
};

export const authenticatedGet = async <T = any>(endpoint: string): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, { method: "GET" });
};

export const authenticatedPost = async <T = any>(endpoint: string, data: any): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const authenticatedPut = async <T = any>(endpoint: string, data: any): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

export const authenticatedPatch = async <T = any>(endpoint: string, data: any): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
};

export const authenticatedDelete = async <T = any>(endpoint: string, data: any = {}): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    method: "DELETE",
    body: JSON.stringify(data),
  });
};

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
  taskMeta?: Array<{
    taskText: string;
    category: 'doToday' | 'thisWeek' | 'kids' | 'home' | 'errands' | 'meals' | 'messages' | 'work' | 'holdingForLater';
    childName?: string | null;
    delegation: 'me' | 'partner' | 'coparent' | 'kid';
    isPartnerTask: boolean;
  }>;
  trackingItems?: Array<{
    id: string;
    text: string;
    dueDate?: string | null;
    category: 'tracking';
  }>;
  rhythmInsights?: {
    topCategories: string[];
    recurringThemes: string[];
    momCheckIn: string;
  };
  noActionableContent?: boolean;
}

export class OrganizeError extends Error {
  kind: 'rate_limited' | 'network' | 'server';
  constructor(kind: 'rate_limited' | 'network' | 'server', message: string) {
    super(message);
    this.kind = kind;
    this.name = 'OrganizeError';
  }
}

export async function organizeText(
  text: string,
  options?: { kids?: Array<{ name: string; age?: number; grade?: string; nicknames?: string[] }>; partnerName?: string }
): Promise<OrganizeResponse> {
  console.log('[organizeText] Calling POST /api/organize', { textLength: text.length, options });
  try {
    const result = await apiPost<OrganizeResponse>('/api/organize', {
      text,
      kids: options?.kids,
      partnerName: options?.partnerName,
    });
    console.log('[organizeText] Success', { categories: Object.keys(result) });
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[organizeText] Error', msg);
    if (msg.includes('429') || msg.includes('rate')) {
      throw new OrganizeError('rate_limited', msg);
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('Network')) {
      throw new OrganizeError('network', msg);
    }
    throw new OrganizeError('server', msg);
  }
}

export async function organizeImages(
  images: Array<{ base64: string; mimeType: string }>,
  options?: { kids?: Array<{ name: string; age?: number; grade?: string; nicknames?: string[] }>; partnerName?: string }
): Promise<OrganizeResponse> {
  console.log('[organizeImages] Calling POST /api/organize-image', { imageCount: images.length, options });
  try {
    const result = await apiPost<OrganizeResponse>('/api/organize-image', {
      images,
      kids: options?.kids,
      partnerName: options?.partnerName,
    });
    console.log('[organizeImages] Success', { categories: Object.keys(result) });
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[organizeImages] Error', msg);
    if (msg.includes('429') || msg.includes('rate')) {
      throw new OrganizeError('rate_limited', msg);
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('Network')) {
      throw new OrganizeError('network', msg);
    }
    throw new OrganizeError('server', msg);
  }
}
