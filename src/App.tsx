import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Send,
  Search,
  UserPlus,
  LogOut,
  Settings,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  ArrowRight,
  Moon,
  Sun,
  Bell,
  BellOff,
  Camera,
  Code2,
  Copy,
  ChevronDown,
  RefreshCw,
  Mail,
  Lock,
  User as UserIcon,
  Sparkles,
  Wifi,
  WifiOff,
  FileCode,
  Database,
  ShieldCheck,
  MessageSquarePlus,
  X,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Paperclip,
  Mic,
  Square,
  Play,
  Pause,
  Reply,
  Smile,
  Volume2,
  VolumeX,
  FileText,
  Download,
  ZoomIn,
  Trash2
} from 'lucide-react';

// ============================================================================
// 1. BRAND CONFIGURATION & SINGLE-CONSTANT APP IDENTITY (HAMZA SHAHEEN LOGO)
// ============================================================================
export const APP_NAME = 'تواصل';
export const APP_TAGLINE = 'مساحة تواصل خاصة، سريعة وآمنة لمجتمعنا';
export const DEVELOPER_CREDIT = 'تم التطوير بواسطة Hamza Shaheen';

// Dominant palette extracted directly from the attached Hamza Shaheen logo:
// Deep Navy/Petroleum (#0B2D48), Vibrant Orange (#EA580C), Warm Cream (#F8F7F4), Slate Gray (#94A3B8)
export const BRAND_COLORS = {
  primary: '#0B2D48',      // Deep Navy from logo outlines, hair, and typography
  primaryDark: '#071E31',  // Darker Navy for hover & deep accents
  primarySoft: '#FFF7ED',  // Soft Warm Orange/Cream tint
  accentOrange: '#EA580C', // Vibrant Orange from logo globe, book, pen & crescents
  accentAmber: '#F97316',  // Bright Orange highlight for read receipts & badges
};

// ============================================================================
// 2. SUPABASE CONFIGURATION & TYPED DATABASE SCHEMA
// ============================================================================
const SUPABASE_URL = 'https://fvyzjqrlrfubgpsxnrng.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_aBt1f7tEsT292yWT44oANg_6Oesbwyg';

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  last_seen: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  is_group: boolean;
  name: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ConversationMember {
  conversation_id: string;
  user_id: string;
  role: 'admin' | 'member';
  last_read_at: string | null;
  joined_at: string;
}

export type MessageType = 'text' | 'image' | 'file' | 'audio';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  type: MessageType;
  media_url: string | null;
  created_at: string;
  // Client-only UI flags for optimistic updates
  _status?: 'sending' | 'sent' | 'failed';
  _tempId?: string;
  _replyTo?: {
    id: string;
    senderName: string;
    content: string;
  } | null;
  _fileName?: string | null;
}

// Web Audio API Sound Effects (Zero external audio dependencies)
export function playChatSound(type: 'send' | 'receive' | 'reaction', muted: boolean) {
  if (muted || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'send') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'receive') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.setValueAtTime(780, now + 0.07);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.06);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);
    }
  } catch {
    // Ignore audio context restrictions
  }
}

export interface EnrichedConversation {
  id: string;
  is_group: boolean;
  name: string | null;
  created_at: string;
  otherUser: Profile | null;
  myLastReadAt: string | null;
  otherLastReadAt: string | null;
  lastMessage: Message | null;
  unreadCount: number;
}

// ============================================================================
// 2B. ZERO-DEPENDENCY SUPABASE V2 CLIENT (AUTH + POSTGREST + RPC + STORAGE + REALTIME)
// Works natively in browser preview without requiring node_modules/@supabase/supabase-js
// while speaking the exact REST, Auth, Storage, and Phoenix WebSocket Realtime protocols
// of https://fvyzjqrlrfubgpsxnrng.supabase.co
// ============================================================================
export interface User {
  id: string;
  email?: string;
  user_metadata?: {
    display_name?: string;
    [key: string]: any;
  };
}

export interface Session {
  access_token: string;
  refresh_token?: string;
  user: User;
}

type AuthChangeEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'USER_UPDATED';

class PostgrestQueryBuilder {
  private url: URL;
  private method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET';
  private bodyData: any = null;
  private isSingle = false;
  private returnRepresentation = false;
  private getHeaders: () => Record<string, string>;

  constructor(baseUrl: string, table: string, getHeaders: () => Record<string, string>) {
    this.url = new URL(`${baseUrl}/rest/v1/${table}`);
    this.getHeaders = getHeaders;
  }

  select(columns = '*') {
    if (this.method === 'GET') {
      this.url.searchParams.set('select', columns);
    } else {
      this.returnRepresentation = true;
      this.url.searchParams.set('select', columns);
    }
    return this;
  }

  insert(values: any) {
    this.method = 'POST';
    this.bodyData = values;
    return this;
  }

  update(values: any) {
    this.method = 'PATCH';
    this.bodyData = values;
    return this;
  }

  eq(column: string, value: string | number | boolean) {
    this.url.searchParams.append(column, `eq.${value}`);
    return this;
  }

  lt(column: string, value: string | number) {
    this.url.searchParams.append(column, `lt.${value}`);
    return this;
  }

  in(column: string, values: (string | number)[]) {
    const cleaned = values.map((v) => `"${String(v).replace(/"/g, '')}"`).join(',');
    this.url.searchParams.append(column, `in.(${cleaned})`);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    const dir = options?.ascending === false ? 'desc' : 'asc';
    this.url.searchParams.set('order', `${column}.${dir}`);
    return this;
  }

  limit(count: number) {
    this.url.searchParams.set('limit', String(count));
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  async execute(): Promise<{ data: any; error: any }> {
    try {
      const headers: Record<string, string> = {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      };

      const preferParts: string[] = [];
      if (this.returnRepresentation) {
        preferParts.push('return=representation');
      }
      if (preferParts.length > 0) {
        headers['Prefer'] = preferParts.join(',');
      }
      if (this.isSingle) {
        headers['Accept'] = 'application/vnd.pgrst.object+json';
      }

      const response = await fetch(this.url.toString(), {
        method: this.method,
        headers,
        body: this.bodyData !== null ? JSON.stringify(this.bodyData) : undefined,
      });

      const text = await response.text();
      let parsed = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }

      if (!response.ok) {
        return {
          data: null,
          error: {
            message: parsed?.message || parsed?.error_description || parsed?.hint || response.statusText,
            details: parsed,
            status: response.status,
          },
        };
      }

      return { data: parsed, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || 'Network error' } };
    }
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class RealtimeChannelClient {
  public name: string;
  private wsUrl: string;
  private apiKey: string;
  private getToken: () => string;
  private ws: WebSocket | null = null;
  private handlers: Array<{
    filter: { event: string; schema: string; table: string };
    callback: (payload: any) => void;
  }> = [];
  private broadcastHandlers: Array<{
    event: string;
    callback: (payload: any) => void;
  }> = [];
  private heartbeatTimer: any = null;
  private closed = false;

  constructor(name: string, supabaseUrl: string, apiKey: string, getToken: () => string) {
    this.name = name;
    const wsProtocol = supabaseUrl.startsWith('https') ? 'wss' : 'ws';
    const host = supabaseUrl.replace(/^https?:\/\//, '');
    this.wsUrl = `${wsProtocol}://${host}/realtime/v1/websocket?apikey=${encodeURIComponent(apiKey)}&vsn=1.0.0`;
    this.apiKey = apiKey;
    this.getToken = getToken;
  }

  on(
    type: 'postgres_changes' | 'broadcast',
    filter: any,
    callback: (payload: any) => void
  ) {
    if (type === 'postgres_changes') {
      this.handlers.push({ filter, callback });
    } else if (type === 'broadcast') {
      this.broadcastHandlers.push({ event: filter.event, callback });
    }
    return this;
  }

  send(payload: { type: 'broadcast'; event: string; payload: any }) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          topic: `realtime:${this.name}`,
          event: 'broadcast',
          payload: {
            type: 'broadcast',
            event: payload.event,
            payload: payload.payload,
          },
          ref: String(Date.now()),
        })
      );
    }
  }

  subscribe() {
    this.closed = false;
    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => {
        if (this.closed || !this.ws) return;
        const postgresChanges = this.handlers.map((h) => ({
          event: h.filter.event,
          schema: h.filter.schema,
          table: h.filter.table,
        }));

        const joinPayload = {
          topic: `realtime:${this.name}`,
          event: 'phx_join',
          payload: {
            config: {
              broadcast: { self: false },
              presence: { key: '' },
              postgres_changes: postgresChanges,
            },
            access_token: this.getToken(),
          },
          ref: '1',
        };
        this.ws.send(JSON.stringify(joinPayload));

        this.heartbeatTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(
              JSON.stringify({
                topic: 'phoenix',
                event: 'heartbeat',
                payload: {},
                ref: String(Date.now()),
              })
            );
          }
        }, 25000);
      };

      this.ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.event === 'broadcast' && msg.payload) {
            const bEvent = msg.payload.event;
            this.broadcastHandlers.forEach((bh) => {
              if (bh.event === '*' || bh.event === bEvent) {
                bh.callback(msg.payload);
              }
            });
          }
          if (msg.event === 'postgres_changes' && msg.payload?.data) {
            const data = msg.payload.data;
            const eventType = data.type; // INSERT | UPDATE | DELETE
            const table = data.table;
            const schema = data.schema || 'public';
            const normalizedPayload = {
              eventType,
              new: data.record || data.new || null,
              old: data.old_record || data.old || null,
              schema,
              table,
            };

            this.handlers.forEach((h) => {
              const tableMatch = h.filter.table === '*' || h.filter.table === table;
              const eventMatch = h.filter.event === '*' || h.filter.event === eventType;
              if (tableMatch && eventMatch) {
                h.callback(normalizedPayload);
              }
            });
          }
        } catch {
          // Ignore malformed socket frames
        }
      };
    } catch {
      // Fallback handled by window focus/online polling
    }
    return this;
  }

  unsubscribe() {
    this.closed = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }
  }
}

export class SupabaseBrowserClient {
  private url: string;
  private key: string;
  private storageKey = 'tawasol.supabase.auth.session';
  private currentSession: Session | null = null;
  private listeners = new Set<(event: AuthChangeEvent, session: Session | null) => void>();

  constructor(url: string, key: string) {
    this.url = url.replace(/\/$/, '');
    this.key = key;
    this.loadStoredSession();
  }

  private loadStoredSession() {
    if (typeof window === 'undefined') return;
    try {
      // Check URL hash for Supabase redirect tokens (email confirm or password recovery)
      if (window.location.hash && window.location.hash.includes('access_token=')) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token') || undefined;
        const type = params.get('type');
        if (accessToken) {
          this.fetchUserWithToken(accessToken).then((user) => {
            if (user) {
              this.saveSession({ access_token: accessToken, refresh_token: refreshToken, user });
              const evt: AuthChangeEvent =
                type === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN';
              this.notify(evt, this.currentSession);
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          });
        }
      }

      const raw = window.localStorage.getItem(this.storageKey);
      if (raw) {
        this.currentSession = JSON.parse(raw);
      }
    } catch {
      this.currentSession = null;
    }
  }

  private saveSession(session: Session | null) {
    this.currentSession = session;
    if (typeof window === 'undefined') return;
    try {
      if (session) {
        window.localStorage.setItem(this.storageKey, JSON.stringify(session));
      } else {
        window.localStorage.removeItem(this.storageKey);
      }
    } catch {
      // Ignore storage quota errors
    }
  }

  private notify(event: AuthChangeEvent, session: Session | null) {
    this.listeners.forEach((cb) => cb(event, session));
  }

  private getHeaders(): Record<string, string> {
    const token = this.currentSession?.access_token || this.key;
    return {
      apikey: this.key,
      Authorization: `Bearer ${token}`,
    };
  }

  private async fetchUserWithToken(token: string): Promise<User | null> {
    try {
      const res = await fetch(`${this.url}/auth/v1/user`, {
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  public auth = {
    getSession: async (): Promise<{ data: { session: Session | null }; error: any }> => {
      return { data: { session: this.currentSession }, error: null };
    },

    onAuthStateChange: (
      callback: (event: AuthChangeEvent, session: Session | null) => void
    ) => {
      this.listeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              this.listeners.delete(callback);
            },
          },
        },
      };
    },

    signInWithPassword: async ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }): Promise<{ data: { user: User | null; session: Session | null }; error: any }> => {
      try {
        const res = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            apikey: this.key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            data: { user: null, session: null },
            error: { message: data?.error_description || data?.msg || data?.message || 'Invalid login credentials' },
          };
        }
        const session: Session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user: data.user,
        };
        this.saveSession(session);
        this.notify('SIGNED_IN', session);
        return { data: { user: data.user, session }, error: null };
      } catch (err: any) {
        return {
          data: { user: null, session: null },
          error: { message: err?.message || 'Network error' },
        };
      }
    },

    signUp: async ({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: { emailRedirectTo?: string; data?: Record<string, any> };
    }): Promise<{ data: { user: User | null; session: Session | null }; error: any }> => {
      try {
        const signupUrl = new URL(`${this.url}/auth/v1/signup`);
        if (options?.emailRedirectTo) {
          signupUrl.searchParams.set('redirect_to', options.emailRedirectTo);
        }
        const res = await fetch(signupUrl.toString(), {
          method: 'POST',
          headers: {
            apikey: this.key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            data: options?.data || {},
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            data: { user: null, session: null },
            error: { message: data?.error_description || data?.msg || data?.message || 'Signup failed' },
          };
        }
        const session: Session | null = data.access_token
          ? {
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              user: data.user,
            }
          : null;
        const user: User | null = data.user || (data.id ? data : null);
        if (session) {
          this.saveSession(session);
          this.notify('SIGNED_IN', session);
        }
        return { data: { user, session }, error: null };
      } catch (err: any) {
        return {
          data: { user: null, session: null },
          error: { message: err?.message || 'Signup failed' },
        };
      }
    },

    resend: async ({
      type,
      email,
      options,
    }: {
      type: 'signup';
      email: string;
      options?: { emailRedirectTo?: string };
    }): Promise<{ error: any }> => {
      try {
        const res = await fetch(`${this.url}/auth/v1/resend`, {
          method: 'POST',
          headers: {
            apikey: this.key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type,
            email,
            options: options?.emailRedirectTo ? { email_redirect_to: options.emailRedirectTo } : undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { error: { message: data?.msg || data?.message || 'Resend failed' } };
        }
        return { error: null };
      } catch (err: any) {
        return { error: { message: err?.message || 'Resend failed' } };
      }
    },

    resetPasswordForEmail: async (
      email: string,
      options?: { redirectTo?: string }
    ): Promise<{ error: any }> => {
      try {
        const recoverUrl = new URL(`${this.url}/auth/v1/recover`);
        if (options?.redirectTo) {
          recoverUrl.searchParams.set('redirect_to', options.redirectTo);
        }
        const res = await fetch(recoverUrl.toString(), {
          method: 'POST',
          headers: {
            apikey: this.key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { error: { message: data?.msg || data?.message || 'Password recovery failed' } };
        }
        return { error: null };
      } catch (err: any) {
        return { error: { message: err?.message || 'Password recovery failed' } };
      }
    },

    updateUser: async (attributes: { password?: string; data?: any }): Promise<{ error: any }> => {
      try {
        const res = await fetch(`${this.url}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            ...this.getHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(attributes),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { error: { message: data?.msg || data?.message || 'Update user failed' } };
        }
        if (this.currentSession) {
          this.notify('USER_UPDATED', this.currentSession);
        }
        return { error: null };
      } catch (err: any) {
        return { error: { message: err?.message || 'Update user failed' } };
      }
    },

    signOut: async (): Promise<{ error: any }> => {
      try {
        if (this.currentSession?.access_token) {
          await fetch(`${this.url}/auth/v1/logout`, {
            method: 'POST',
            headers: this.getHeaders(),
          }).catch(() => {});
        }
      } finally {
        this.saveSession(null);
        this.notify('SIGNED_OUT', null);
      }
      return { error: null };
    },
  };

  public from(table: string) {
    return new PostgrestQueryBuilder(this.url, table, () => this.getHeaders());
  }

  public async rpc(fnName: string, params: Record<string, any> = {}): Promise<{ data: any; error: any }> {
    try {
      const res = await fetch(`${this.url}/rest/v1/rpc/${fnName}`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
      const text = await res.text();
      let parsed = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text.replace(/^"|"$/g, '');
        }
      }
      if (!res.ok) {
        return {
          data: null,
          error: { message: parsed?.message || parsed?.hint || res.statusText },
        };
      }
      return { data: parsed, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || 'RPC error' } };
    }
  }

  public storage = {
    from: (bucket: string) => ({
      upload: async (
        path: string,
        file: File,
        options?: { upsert?: boolean }
      ): Promise<{ data: any; error: any }> => {
        try {
          const headers: Record<string, string> = {
            ...this.getHeaders(),
            'Content-Type': file.type || 'application/octet-stream',
          };
          if (options?.upsert) {
            headers['x-upsert'] = 'true';
          }
          const res = await fetch(`${this.url}/storage/v1/object/${bucket}/${path}`, {
            method: 'POST',
            headers,
            body: file,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return {
              data: null,
              error: { message: data?.message || data?.error || res.statusText },
            };
          }
          return { data, error: null };
        } catch (err: any) {
          return { data: null, error: { message: err?.message || 'Upload failed' } };
        }
      },
      getPublicUrl: (path: string) => ({
        data: {
          publicUrl: `${this.url}/storage/v1/object/public/${bucket}/${path}`,
        },
      }),
    }),
  };

  public channel(name: string) {
    return new RealtimeChannelClient(
      name,
      this.url,
      this.key,
      () => this.currentSession?.access_token || this.key
    );
  }

  public removeChannel(channel: RealtimeChannelClient) {
    channel.unsubscribe();
  }
}

// Single typed Supabase client instance connected to https://fvyzjqrlrfubgpsxnrng.supabase.co
export const supabase = new SupabaseBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ============================================================================
// 3. BRAND LOGO COMPONENT (EXACT UNMODIFIED IMAGE) & DYNAMIC PWA / FAVICON
// ============================================================================
export const LOGO_IMAGE_SRC = '/logo.svg';

export const BrandLogo: React.FC<{
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  showFullBadge?: boolean;
  className?: string;
}> = ({ size = 'md', showText = false, showFullBadge = false, className = '' }) => {
  const dimensions = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-28 h-28',
    xl: 'w-32 h-32',
  }[size];

  return (
    <div
      className={`inline-flex ${
        showFullBadge ? 'flex-col items-center text-center gap-2' : 'items-center gap-3'
      } select-none ${className}`}
    >
      <img
        src={LOGO_IMAGE_SRC}
        alt="Hamza Shaheen"
        className={`${dimensions} object-contain shrink-0`}
      />

      {showFullBadge && (
        <div className="flex flex-col items-center text-center mt-1">
          <span className="text-base font-extrabold text-[#0B2D48] dark:text-white">
            {DEVELOPER_CREDIT}
          </span>
        </div>
      )}

      {showText && !showFullBadge && (
        <div className="flex flex-col text-start">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold tracking-tight text-[#0B2D48] dark:text-white text-base leading-tight">
              {APP_NAME}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {DEVELOPER_CREDIT}
          </span>
        </div>
      )}
    </div>
  );
};

// Inject Arabic Google Font, RTL attributes, Favicon, and PWA Manifest dynamically
function useBrandHeadSetup() {
  useEffect(() => {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
    document.title = `${APP_NAME} — ${DEVELOPER_CREDIT}`;

    // Load Cairo & IBM Plex Sans Arabic fonts
    if (!document.getElementById('arabic-fonts-link')) {
      const link = document.createElement('link');
      link.id = 'arabic-fonts-link';
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    }

    let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = LOGO_IMAGE_SRC;

    // Web App Manifest using the exact attached image
    const manifestObj = {
      name: `${APP_NAME} — ${DEVELOPER_CREDIT}`,
      short_name: APP_NAME,
      description: `${APP_TAGLINE} — ${DEVELOPER_CREDIT}`,
      lang: 'ar',
      dir: 'rtl',
      start_url: '/',
      display: 'standalone',
      background_color: '#0B2D48',
      theme_color: '#0B2D48',
      icons: [
        { src: LOGO_IMAGE_SRC, sizes: '192x192', type: 'image/jpeg', purpose: 'any' },
        { src: LOGO_IMAGE_SRC, sizes: '512x512', type: 'image/jpeg', purpose: 'any maskable' },
      ],
    };
    const manifestBlob = new Blob([JSON.stringify(manifestObj)], { type: 'application/manifest+json' });
    const manifestUrl = URL.createObjectURL(manifestBlob);
    let manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement | null;
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestUrl;

    return () => {
      URL.revokeObjectURL(manifestUrl);
    };
  }, []);
}

// ============================================================================
// 4. ARABIC (ar-EG) DATE & TIME FORMATTERS
// ============================================================================
export function formatTimeAr(isoString: string | null | undefined): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('ar-EG', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return '';
  }
}

export function formatConversationTimestampAr(isoString: string | null | undefined): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const msgDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (msgDayStart.getTime() === todayStart.getTime()) {
      return formatTimeAr(isoString);
    }
    if (msgDayStart.getTime() === yesterdayStart.getTime()) {
      return 'امبارح';
    }
    return new Intl.DateTimeFormat('ar-EG', {
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch {
    return '';
  }
}

export function formatDateSeparatorAr(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const msgDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (msgDayStart.getTime() === todayStart.getTime()) {
      return 'اليوم';
    }
    if (msgDayStart.getTime() === yesterdayStart.getTime()) {
      return 'امبارح';
    }
    return new Intl.DateTimeFormat('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    }).format(date);
  } catch {
    return '';
  }
}

export function getLastSeenStatusAr(lastSeenIso: string | null | undefined): {
  isOnline: boolean;
  label: string;
} {
  if (!lastSeenIso) {
    return { isOnline: false, label: 'غير متصل حالياً' };
  }
  const diffMs = Date.now() - new Date(lastSeenIso).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 2) {
    return { isOnline: true, label: 'متصل الآن' };
  }
  if (diffMinutes < 60) {
    return {
      isOnline: false,
      label: `آخر ظهور منذ ${diffMinutes === 1 ? 'دقيقة' : diffMinutes === 2 ? 'دقيقتين' : `${diffMinutes} دقيقة`}`,
    };
  }

  const date = new Date(lastSeenIso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const seenDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (seenDayStart.getTime() === todayStart.getTime()) {
    return { isOnline: false, label: `آخر ظهور اليوم الساعة ${formatTimeAr(lastSeenIso)}` };
  }
  if (seenDayStart.getTime() === yesterdayStart.getTime()) {
    return { isOnline: false, label: `آخر ظهور امبارح الساعة ${formatTimeAr(lastSeenIso)}` };
  }
  const formattedDate = new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'short',
  }).format(date);
  return { isOnline: false, label: `آخر ظهور ${formattedDate} الساعة ${formatTimeAr(lastSeenIso)}` };
}

export function translateAuthErrorAr(errorMsg: string): {
  title: string;
  fix: string;
  isUnconfirmed?: boolean;
} {
  const lower = errorMsg.toLowerCase();
  if (lower.includes('email not confirmed')) {
    return {
      title: 'إيميلك لسه متأكدش!',
      fix: 'بص على صندوق الوارد (أو الرسائل غير المرغوب فيها Spam) ودوس على رابط التفعيل، أو اطلب إرسال رابط جديد من الزرار تحت.',
      isUnconfirmed: true,
    };
  }
  if (lower.includes('invalid login credentials')) {
    return {
      title: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      fix: 'اتأكد إنك كاتب الإيميل والباسورد صح، أو دوس على "نسيت كلمة المرور؟" لو حابب تعمل واحدة جديدة.',
    };
  }
  if (lower.includes('user already registered')) {
    return {
      title: 'البريد الإلكتروني ده مسجل عندنا بالفعل',
      fix: 'جرب تسجل دخول عادي بنفس الإيميل، أو استعيد كلمة المرور لو ناسيها.',
    };
  }
  if (lower.includes('password should be at least')) {
    return {
      title: 'كلمة المرور قصيرة أوي',
      fix: 'لازم كلمة المرور تكون 6 حروف أو أرقام على الأقل عشان نحمي حسابك.',
    };
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return {
      title: 'محاولات كتير في وقت قصير',
      fix: 'استنى دقيقة واحدة وجرب تاني عشان حماية الحساب.',
    };
  }
  return {
    title: 'حصلت مشكلة غير متوقعة أثناء العملية',
    fix: `تأكد من اتصالك بالإنترنت وحاول تاني. (${errorMsg})`,
  };
}

// ============================================================================
// 5. DEMO MODE DATA (FOR INSTANT ONE-CLICK INTERACTIVE PREVIEW)
// ============================================================================
const DEMO_MY_PROFILE: Profile = {
  id: 'demo-me-001',
  display_name: 'أحمد طارق',
  avatar_url: null,
  last_seen: new Date().toISOString(),
  created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
};

const DEMO_USERS: Profile[] = [
  {
    id: 'demo-user-002',
    display_name: 'سارة محمود',
    avatar_url: null,
    last_seen: new Date(Date.now() - 30 * 1000).toISOString(), // Online now
    created_at: new Date(Date.now() - 86400000 * 25).toISOString(),
  },
  {
    id: 'demo-user-003',
    display_name: 'م. كريم عبد العزيز',
    avatar_url: null,
    last_seen: new Date(Date.now() - 18 * 60000).toISOString(), // 18 mins ago
    created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
  },
  {
    id: 'demo-user-004',
    display_name: 'ندى حسن',
    avatar_url: null,
    last_seen: new Date(Date.now() - 86400000).toISOString(), // Yesterday
    created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
  },
  {
    id: 'demo-user-005',
    display_name: 'د. يوسف الشاذلي',
    avatar_url: null,
    last_seen: new Date(Date.now() - 45 * 1000).toISOString(), // Online
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
  {
    id: 'demo-user-006',
    display_name: 'مريم الفقي',
    avatar_url: null,
    last_seen: new Date(Date.now() - 3 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
  },
];

const INITIAL_DEMO_CONVERSATIONS: EnrichedConversation[] = [
  {
    id: 'conv-sara-1',
    is_group: false,
    name: null,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    otherUser: DEMO_USERS[0],
    myLastReadAt: new Date(Date.now() - 300000).toISOString(),
    otherLastReadAt: new Date(Date.now() - 60000).toISOString(),
    lastMessage: {
      id: 'm-104',
      conversation_id: 'conv-sara-1',
      sender_id: 'demo-user-002',
      content: 'تمام جداً! راجعت التصميم الجديد والألوان طالعة هادية ومريحة للعين جداً 🌟',
      type: 'text',
      media_url: null,
      created_at: new Date(Date.now() - 120000).toISOString(),
    },
    unreadCount: 1,
  },
  {
    id: 'conv-karim-2',
    is_group: false,
    name: null,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    otherUser: DEMO_USERS[1],
    myLastReadAt: new Date().toISOString(),
    otherLastReadAt: new Date().toISOString(),
    lastMessage: {
      id: 'm-203',
      conversation_id: 'conv-karim-2',
      sender_id: 'demo-me-001',
      content: 'خلاص اتفقنا، هبعتلك لينك الـ Repository على الساعة 5 إن شاء الله.',
      type: 'text',
      media_url: null,
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
    unreadCount: 0,
  },
  {
    id: 'conv-nada-3',
    is_group: false,
    name: null,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    otherUser: DEMO_USERS[2],
    myLastReadAt: new Date().toISOString(),
    otherLastReadAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    lastMessage: {
      id: 'm-301',
      conversation_id: 'conv-nada-3',
      sender_id: 'demo-me-001',
      content: 'ندى، لما تفضي قوليلي رأيك في جدول اجتماع يوم الخميس.',
      type: 'text',
      media_url: null,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
    unreadCount: 0,
  },
];

const INITIAL_DEMO_MESSAGES: Record<string, Message[]> = {
  'conv-sara-1': [
    {
      id: 'm-101',
      conversation_id: 'conv-sara-1',
      sender_id: 'demo-user-002',
      content: 'صباح الخير يا أحمد! أخبارك إيه النهارده؟',
      type: 'text',
      media_url: null,
      created_at: new Date(Date.now() - 86400000 - 3600000).toISOString(),
    },
    {
      id: 'm-102',
      conversation_id: 'conv-sara-1',
      sender_id: 'demo-me-001',
      content: 'صباح النور يا سارة! الحمد لله كله تمام، شغالين على إطلاق تطبيق تواصل الجديد للمجتمع بتاعنا.',
      type: 'text',
      media_url: null,
      created_at: new Date(Date.now() - 86400000 - 3500000).toISOString(),
    },
    {
      id: 'm-103',
      conversation_id: 'conv-sara-1',
      sender_id: 'demo-me-001',
      content: 'النسخة دي شغالة بـ Supabase Realtime وبتدعم العربي والانجليزي مع بعض زي `React 18 + TypeScript` من غير ما الكلام يتلخبط!',
      type: 'text',
      media_url: null,
      created_at: new Date(Date.now() - 180000).toISOString(),
    },
    {
      id: 'm-104',
      conversation_id: 'conv-sara-1',
      sender_id: 'demo-user-002',
      content: 'تمام جداً! راجعت التصميم الجديد والألوان طالعة هادية ومريحة للعين جداً 🌟',
      type: 'text',
      media_url: null,
      created_at: new Date(Date.now() - 120000).toISOString(),
    },
  ],
  'conv-karim-2': [
    {
      id: 'm-201',
      conversation_id: 'conv-karim-2',
      sender_id: 'demo-user-003',
      content: 'أهلاً يا هندسة، هل الـ RLS شغال تمام على جدول المحادثات؟',
      type: 'text',
      media_url: null,
      created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    },
    {
      id: 'm-202',
      conversation_id: 'conv-karim-2',
      sender_id: 'demo-me-001',
      content: 'أيوة طبعاً، كل المحادثات بتتفتح بس عن طريق الـ RPC `create_direct_conversation` ومحدش يقدر يشوف رسايل مش طرف فيها.',
      type: 'text',
      media_url: null,
      created_at: new Date(Date.now() - 3600000 * 2.5).toISOString(),
    },
    {
      id: 'm-203',
      conversation_id: 'conv-karim-2',
      sender_id: 'demo-me-001',
      content: 'خلاص اتفقنا، هبعتلك لينك الـ Repository على الساعة 5 إن شاء الله.',
      type: 'text',
      media_url: null,
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
  ],
  'conv-nada-3': [
    {
      id: 'm-301',
      conversation_id: 'conv-nada-3',
      sender_id: 'demo-me-001',
      content: 'ندى، لما تفضي قوليلي رأيك في جدول اجتماع يوم الخميس.',
      type: 'text',
      media_url: null,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ],
};

// ============================================================================
// 6. AVATAR COMPONENT (IMAGE OR BRANDED INITIALS)
// ============================================================================
const Avatar: React.FC<{
  name: string | null | undefined;
  url: string | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
}> = ({ name, url, size = 'md', isOnline }) => {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    sm: 'w-9 h-9 text-xs',
    md: 'w-12 h-12 text-base',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-24 h-24 text-2xl',
  }[size];

  const dotClasses = {
    sm: 'w-2.5 h-2.5 bottom-0 start-0 border',
    md: 'w-3.5 h-3.5 bottom-0 start-0 border-2',
    lg: 'w-4 h-4 bottom-0.5 start-0.5 border-2',
    xl: 'w-5 h-5 bottom-1 start-1 border-2',
  }[size];

  const initial = (name || 'م').trim().charAt(0).toUpperCase();

  // Consistent soft gradient palette based on Hamza Shaheen Navy & Orange brand colors
  const palettes = [
    'from-[#0B2D48] to-[#164E63] text-white',
    'from-[#EA580C] to-[#C2410C] text-white',
    'from-[#1E3A8A] to-[#0B2D48] text-white',
    'from-[#D97706] to-[#EA580C] text-white',
    'from-[#0F172A] to-[#1E293B] text-white',
  ];
  const code = (name || 'A').charCodeAt(0) % palettes.length;

  return (
    <div className="relative inline-flex shrink-0 select-none">
      {url && !imgError ? (
        <img
          src={url}
          alt={name || 'صورة المستخدم'}
          onError={() => setImgError(true)}
          className={`${sizeClasses} rounded-full object-cover ring-2 ring-white/80 dark:ring-slate-800 shadow-xs`}
        />
      ) : (
        <div
          className={`${sizeClasses} rounded-full bg-gradient-to-br ${palettes[code]} font-bold flex items-center justify-center shadow-xs ring-2 ring-white/80 dark:ring-slate-800`}
        >
          {initial}
        </div>
      )}
      {isOnline && (
        <span
          className={`absolute ${dotClasses} rounded-full bg-[#EA580C] border-white dark:border-slate-900`}
          title="متصل الآن"
        />
      )}
    </div>
  );
};

// ============================================================================
// 7. PROJECT FILES & SQL MIGRATION MODAL (README, .ENV, SQL, PWA)
// ============================================================================
const PROJECT_DOCS = {
  sql: `-- ============================================================================
-- إعداد Supabase Storage لرفع الصور الشخصية (bucket: "avatars")
-- ومرفقات الدردشة من صور وملفات ورسائل صوتية (bucket: "chat-media")
-- شغّل هذا الكود في Supabase SQL Editor لتفعيل كافة الميزات بأمان
-- ============================================================================

-- 1. إنشاء الـ Bucket باسم "avatars" وجعله عاماً للقراءة
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB حد أقصى للصورة
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set public = true;

-- 1B. إنشاء الـ Bucket باسم "chat-media" للصور والملفات والرسائل الصوتية
insert into storage.buckets (id, name, public, file_size_limit)
values (
  'chat-media',
  'chat-media',
  true,
  10485760 -- 10MB حد أقصى للملف أو المقطع الصوتي
)
on conflict (id) do update set public = true;

-- سياسات القراءة والرفع لمرفقات الدردشة (chat-media)
create policy "Chat media is readable by authenticated users"
on storage.objects for select
to authenticated, anon
using ( bucket_id = 'chat-media' );

create policy "Authenticated users can upload chat media"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'chat-media' );

-- 2. السماح لأي مستخدم مسجل دخول بقراءة الصور الشخصية
create policy "Avatars are publicly accessible"
on storage.objects for select
to authenticated, anon
using ( bucket_id = 'avatars' );

-- 3. السماح لكل مستخدم برفع صورته داخل مجلد يحمل الـ UUID الخاص به فقط
create policy "Users can upload their own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. السماح للمستخدم بتحديث أو استبدال صورته الشخصية فقط
create policy "Users can update their own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. السماح للمستخدم بحذف صورته الشخصية فقط
create policy "Users can delete their own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);`,

  env: `# .env.example
# انسخ هذا الملف إلى .env محلياً أو أضف المتغيرات في إعدادات Netlify / Vercel
VITE_SUPABASE_URL=https://fvyzjqrlrfubgpsxnrng.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_aBt1f7tEsT292yWT44oANg_6Oesbwyg
# تنبيه أمني: لا تستخدم أبداً مفتاح service_role في الواجهة الأمامية!`,

  readme: `# تواصل (Tawasol) — تطبيق المراسلة الفورية لمجتمعنا الخاص

تطبيق محادثات فورية (1-to-1) باللغة العربية بالكامل (RTL)، مبني باستخدام **React 18 + TypeScript + Vite + Tailwind CSS** ومتصل مباشرة بـ **Supabase (Postgres, Auth, Realtime, Storage)**، ومجهز للعمل كتطبيق ويب تقدمي **PWA** وقابل للتحويل لاحقاً إلى تطبيق موبايل عبر **Capacitor**.

## 1. المتطلبات والتشغيل المحلي
\`\`\`bash
# 1. تثبيت الحزم
npm install

# 2. نسخ ملف البيئة
cp .env.example .env

# 3. تشغيل بيئة التطوير
npm run dev

# 4. بناء نسخة الإنتاج
npm run build
\`\`\`

## 2. هيكل المجلدات (Feature-Based Architecture)
\`\`\`text
src/
├── lib/
│   ├── supabase.ts          # عميل Supabase الموحد + الأنواع (Database Types)
│   └── formatters.ts        # دوال تنسيق الوقت والتاريخ بـ ar-EG
├── auth/
│   ├── AuthProvider.tsx     # إدارة الجلسة، حماية المسارات، وتحديث last_seen
│   ├── LoginScreen.tsx      # تسجيل الدخول، إنشاء حساب، تأكيد البريد، واستعادة كلمة المرور
├── chats/
│   ├── ConversationList.tsx # القائمة الجانبية، البحث، شارات غير المقروء، والترتيب الفوري
│   ├── NewChatModal.tsx     # قائمة الأعضاء واستدعاء RPC: create_direct_conversation
├── messages/
│   ├── ChatScreen.tsx       # شاشة المحادثة، الفواصل الزمنية، التمرير اللانهائي (50 رسالة)
│   ├── MessageComposer.tsx  # الإرسال المتفائل (Optimistic UI)، إعادة المحاولة، ومنع التكرار
│   └── useChatRealtime.ts   # اشتراكات postgres_changes وإعادة المزامنة عند عودة الاتصال
├── profile/
│   └── ProfileDrawer.tsx    # تعديل الاسم ورفع الصورة الشخصية إلى سلة avatars
└── ui/
    ├── BrandLogo.tsx        # الشعار الموحد والألوان المشتقة منه
    └── NotificationBanner.tsx # طلب إذن إشعارات المتصفح بأسلوب لطيف
\`\`\`

## 3. ملاحظات النشر الهامة (Netlify / Vercel & Supabase)
1. **إعدادات روابط المصادقة (Supabase Auth > URL Configuration):**
   - اضبط **Site URL** على رابط موقعك المنشور (مثلاً \`https://your-app.vercel.app\`).
   - أضف نفس الرابط أيضاً داخل قائمة **Redirect URLs** (مهم جداً وإلا لن تعمل روابط تأكيد البريد أو استعادة كلمة المرور).
2. **إعداد مزود البريد (SMTP Settings):**
   - خدمة البريد الافتراضية في Supabase محدودة جداً (Rate-limited). لتسجيل حوالي **90 مستخدماً** بدون مشاكل، يرجى تفعيل مزود SMTP مخصص (مثل **Resend** أو Postmark) من داخل **Authentication > SMTP Settings**.
3. **تفعيل رفع الصور الشخصية (Storage):**
   - نفّذ كود SQL المرفق في تبويب \`supabase-avatars.sql\` داخل **Supabase SQL Editor** لإنشاء سلة \`avatars\` وسياسات الحماية (RLS) الخاصة بها.`,

  manifest: `{
  "name": "تواصل — للمراسلة الفورية",
  "short_name": "تواصل",
  "description": "مساحة تواصل خاصة، سريعة وآمنة لمجتمعنا",
  "lang": "ar",
  "dir": "rtl",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0F172A",
  "theme_color": "#2563EB",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}`,
};

const ProjectDocsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'sql' | 'readme' | 'env' | 'manifest'>('sql');
  const [copied, setCopied] = useState(false);

  const content = PROJECT_DOCS[activeTab];

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ملفات الإعداد وقاعدة البيانات"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl max-h-[88dvh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base">
                ملفات الإعداد، التوثيق وسياسات Supabase SQL
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                جاهزة للنسخ المباشر (SQL Storage Policies, README, .env.example, PWA Manifest)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200 dark:border-slate-800 overflow-x-auto bg-slate-50/40 dark:bg-slate-900/30">
          <button
            onClick={() => setActiveTab('sql')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
              activeTab === 'sql'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>سياسات رفع الصور (supabase-avatars.sql)</span>
          </button>
          <button
            onClick={() => setActiveTab('readme')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
              activeTab === 'readme'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>دليل التشغيل والنشر (README.md)</span>
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
              activeTab === 'env'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>متغيرات البيئة (.env.example)</span>
          </button>
          <button
            onClick={() => setActiveTab('manifest')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
              activeTab === 'manifest'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>ملف PWA (manifest.webmanifest)</span>
          </button>
        </div>

        {/* Code Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-950 text-slate-100 relative">
          <button
            onClick={handleCopy}
            className="sticky top-2 float-end z-10 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg transition-all cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'تم النسخ!' : 'نسخ الكود'}</span>
          </button>
          <pre
            dir="ltr"
            className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-words text-start select-all"
          >
            {content}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>متصل بمشروع Supabase: fvyzjqrlrfubgpsxnrng.supabase.co</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 8. AUTHENTICATION SCREEN (LOGIN, SIGN-UP, EMAIL CONFIRM, FORGOT PASSWORD)
// ============================================================================
type AuthViewMode = 'signin' | 'signup' | 'verify-email' | 'forgot-password' | 'update-password';

const AuthScreen: React.FC<{
  initialMode?: AuthViewMode;
  onEnterDemoMode: () => void;
  onOpenDocs: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}> = ({ initialMode = 'signin', onEnterDemoMode, onOpenDocs, darkMode, onToggleDarkMode }) => {
  const [mode, setMode] = useState<AuthViewMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{
    title: string;
    fix: string;
    isUnconfirmed?: boolean;
  } | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  // Cooldown timer for resending confirmation email
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorInfo(null);
    setSuccessBanner(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorInfo({
        title: 'بيانات ناقصة',
        fix: 'اكتب بريدك الإلكتروني وكلمة المرور الأول عشان ندخلك على حسابك.',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) {
        setErrorInfo(translateAuthErrorAr(error.message));
      }
    } catch (err: any) {
      setErrorInfo(translateAuthErrorAr(err?.message || 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorInfo(null);
    setSuccessBanner(null);

    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setErrorInfo({
        title: 'الاسم مطلوب',
        fix: 'اكتب اسمك اللي هيظهر لأصحابك في المحادثات (مثلاً: أحمد طارق).',
      });
      return;
    }
    if (password.length < 6) {
      setErrorInfo({
        title: 'كلمة المرور قصيرة',
        fix: 'اختار كلمة مرور من 6 حروف أو أرقام على الأقل عشان أمان حسابك.',
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            display_name: trimmedName,
          },
        },
      });

      if (error) {
        setErrorInfo(translateAuthErrorAr(error.message));
        return;
      }

      // If email confirmation is enabled, session is null until confirmed
      if (data.user && !data.session) {
        setResendCooldown(60);
        setMode('verify-email');
      }
    } catch (err: any) {
      setErrorInfo(translateAuthErrorAr(err?.message || 'Signup failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (resendCooldown > 0 || !email.trim()) return;
    setLoading(true);
    setErrorInfo(null);
    setSuccessBanner(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        setErrorInfo(translateAuthErrorAr(error.message));
      } else {
        setResendCooldown(60);
        setSuccessBanner('بعتنالك إيميل تأكيد جديد حالاً! بص على صندوق الوارد أو الـ Spam.');
      }
    } catch (err: any) {
      setErrorInfo(translateAuthErrorAr(err?.message || 'Resend failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorInfo(null);
    setSuccessBanner(null);
    if (!email.trim()) {
      setErrorInfo({
        title: 'اكتب بريدك الإلكتروني',
        fix: 'محتاجين إيميلك عشان نبعتلك عليه رابط استعادة كلمة المرور.',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) {
        setErrorInfo(translateAuthErrorAr(error.message));
      } else {
        setSuccessBanner(
          'لو الإيميل ده مسجل عندنا، هتلاقي رسالة وصلتلك دلوقتي فيها رابط لتعيين كلمة مرور جديدة.'
        );
      }
    } catch (err: any) {
      setErrorInfo(translateAuthErrorAr(err?.message || 'Reset failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorInfo(null);
    if (password.length < 6) {
      setErrorInfo({
        title: 'كلمة المرور قصيرة',
        fix: 'اكتب كلمة مرور جديدة لا تقل عن 6 حروف أو أرقام.',
      });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorInfo(translateAuthErrorAr(error.message));
      } else {
        setSuccessBanner('تم تحديث كلمة المرور بنجاح! جاري تحويلك للمحادثات...');
      }
    } catch (err: any) {
      setErrorInfo(translateAuthErrorAr(err?.message || 'Update password failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#F8F7F4] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between p-4 sm:p-6 relative overflow-x-hidden">
      {/* Subtle Brand Ambient Glow (Navy & Vibrant Orange from Hamza Shaheen Logo) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-32 -start-32 w-96 h-96 rounded-full bg-[#0B2D48]/10 dark:bg-[#0B2D48]/30 blur-3xl" />
        <div className="absolute -bottom-32 -end-32 w-96 h-96 rounded-full bg-[#EA580C]/10 dark:bg-[#EA580C]/15 blur-3xl" />
      </div>

      {/* Top utility header */}
      <header className="relative z-10 w-full max-w-5xl mx-auto flex items-center justify-between">
        <BrandLogo size="sm" showText />
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenDocs}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-[#0B2D48] dark:text-slate-200 hover:border-[#EA580C]/60 transition-all shadow-2xs cursor-pointer"
          >
            <Code2 className="w-4 h-4 text-[#EA580C]" />
            <span className="hidden sm:inline">ملفات المشروع و SQL</span>
          </button>
          <button
            onClick={onToggleDarkMode}
            className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label={darkMode ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
          >
            {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Centered Auth Card */}
      <main className="relative z-10 w-full max-w-md mx-auto my-6">
        <div className="bg-white dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xl shadow-[#0B2D48]/5 dark:shadow-black/30 p-6 sm:p-8">
          {/* Prominent Hamza Shaheen Brand Logo */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="p-3.5 rounded-3xl bg-[#F8F7F4] dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/70 mb-3 shadow-inner">
              <BrandLogo size="lg" showFullBadge />
            </div>
            <h1 className="text-2xl font-extrabold text-[#0B2D48] dark:text-white tracking-tight mt-1">
              {mode === 'signin' && `أهلاً بيك في ${APP_NAME}`}
              {mode === 'signup' && `انضم لمجتمع ${APP_NAME}`}
              {mode === 'verify-email' && 'أكد بريدك الإلكتروني'}
              {mode === 'forgot-password' && 'استعادة كلمة المرور'}
              {mode === 'update-password' && 'تعيين كلمة مرور جديدة'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {mode === 'signin' && APP_TAGLINE}
              {mode === 'signup' && 'اعمل حسابك في ثواني وابدأ الكلام مع أصحابك فوراً'}
              {mode === 'verify-email' && 'خطوة أخيرة عشان نضمن أمان حسابك'}
              {mode === 'forgot-password' && 'هنبعتلك رابط سريع تفتح بيه حسابك من تاني'}
              {mode === 'update-password' && 'اختار كلمة مرور قوية وسهلة تفتكرها'}
            </p>
          </div>

          {/* Error Box with What Went Wrong + How to Fix It */}
          {errorInfo && (
            <div
              role="alert"
              className="mb-5 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-start"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-900 dark:text-red-200">
                    {errorInfo.title}
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-300 mt-1 leading-relaxed">
                    {errorInfo.fix}
                  </p>
                  {errorInfo.isUnconfirmed && (
                    <button
                      type="button"
                      onClick={handleResendConfirmation}
                      disabled={resendCooldown > 0 || loading}
                      className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>
                        {resendCooldown > 0
                          ? `إعادة الإرسال متاحة بعد ${resendCooldown} ثانية`
                          : 'ابعت إيميل التأكيد تاني دلوقتي'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {successBanner && (
            <div
              role="status"
              className="mb-5 p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900/60 text-start flex items-start gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-teal-900 dark:text-teal-200 leading-relaxed">
                {successBanner}
              </p>
            </div>
          )}

          {/* VIEW 1: VERIFY EMAIL SCREEN */}
          {mode === 'verify-email' && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                <Mail className="w-8 h-8" />
              </div>
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  بعتنا رسالة تأكيد على الإيميل بتاعك:
                  <br />
                  <strong dir="ltr" className="text-slate-900 dark:text-white font-mono">
                    {email}
                  </strong>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  افتح الرسالة ودوس على زرار التفعيل عشان يدخلك على التطبيق على طول. لو ملقتهاش، بص في الرسائل غير المرغوب فيها (Spam).
                </p>
              </div>

              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resendCooldown > 0 || loading}
                  className="w-full min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>
                    {resendCooldown > 0
                      ? `تقدر تبعت الإيميل تاني بعد ${resendCooldown} ثانية`
                      : 'إعادة إرسال إيميل التأكيد'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setErrorInfo(null);
                    setSuccessBanner(null);
                    setMode('signin');
                  }}
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  رجوع لتسجيل الدخول
                </button>
              </div>
            </div>
          )}

          {/* VIEW 2: SIGN IN / SIGN UP FORMS */}
          {(mode === 'signin' || mode === 'signup') && (
            <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label
                    htmlFor="display-name"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-start"
                  >
                    الاسم اللي هيظهر لأصحابك
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
                    <input
                      id="display-name"
                      type="text"
                      required
                      maxLength={50}
                      placeholder="مثلاً: أحمد طارق"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full min-h-[46px] ps-10 pe-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="email-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-start"
                >
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
                  <input
                    id="email-input"
                    type="email"
                    dir="ltr"
                    required
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full min-h-[46px] ps-10 pe-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 text-start focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password-input"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    كلمة المرور
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorInfo(null);
                        setSuccessBanner(null);
                        setMode('forgot-password');
                      }}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      نسيت كلمة المرور؟
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
                  <input
                    id="password-input"
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    required
                    minLength={6}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full min-h-[46px] ps-10 pe-11 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 text-start focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 absolute top-1/2 -translate-y-1/2 end-1.5 cursor-pointer"
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === 'signup' && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 text-start">
                    لازم تكون 6 حروف أو أرقام على الأقل
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] mt-2 rounded-xl bg-[#0B2D48] hover:bg-[#071E31] active:scale-[0.99] disabled:opacity-60 text-white font-bold text-sm shadow-md shadow-[#0B2D48]/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>{mode === 'signin' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}</span>
              </button>

              <div className="pt-3 text-center border-t border-slate-100 dark:border-slate-800/80">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {mode === 'signin' ? 'أول مرة تستخدم التطبيق؟ ' : 'عندك حساب بالفعل؟ '}
                  <button
                    type="button"
                    onClick={() => {
                      setErrorInfo(null);
                      setSuccessBanner(null);
                      setMode(mode === 'signin' ? 'signup' : 'signin');
                    }}
                    className="font-bold text-[#EA580C] dark:text-orange-400 hover:underline ms-1 cursor-pointer"
                  >
                    {mode === 'signin' ? 'اعمل حساب دلوقتي' : 'سجل دخولك من هنا'}
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* VIEW 3: FORGOT PASSWORD */}
          {mode === 'forgot-password' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-start"
                >
                  البريد الإلكتروني المسجل به
                </label>
                <input
                  id="reset-email"
                  type="email"
                  dir="ltr"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors cursor-pointer"
              >
                {loading ? 'جاري الإرسال...' : 'إرسال رابط استعادة كلمة المرور'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorInfo(null);
                  setSuccessBanner(null);
                  setMode('signin');
                }}
                className="w-full min-h-[44px] rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                رجوع لتسجيل الدخول
              </button>
            </form>
          )}

          {/* VIEW 4: UPDATE PASSWORD (RECOVERY FLOW) */}
          {mode === 'update-password' && (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-start"
                >
                  كلمة المرور الجديدة (6 أحرف على الأقل)
                </label>
                <input
                  id="new-password"
                  type="password"
                  dir="ltr"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors cursor-pointer"
              >
                {loading ? 'جاري الحفظ...' : 'حفظ كلمة المرور الجديدة'}
              </button>
            </form>
          )}

          {/* Quick Preview / Demo Mode Button for Instant UI & UX Verification */}
          <div className="mt-6 pt-5 border-t border-dashed border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onEnterDemoMode}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-gradient-to-l from-[#EA580C]/10 via-[#0B2D48]/10 to-[#0B2D48]/5 hover:from-[#EA580C]/20 hover:to-[#0B2D48]/20 border border-[#EA580C]/35 dark:border-[#EA580C]/40 text-[#0B2D48] dark:text-slate-100 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#EA580C] shrink-0" />
              <span>تجربة واجهة التطبيق فوراً (وضع المعاينة التفاعلي Demo)</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer note with explicit Hamza Shaheen Developer Credit */}
      <footer className="relative z-10 text-center space-y-1.5 py-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-[#EA580C]" />
          <span className="text-xs font-extrabold text-[#0B2D48] dark:text-white">
            {DEVELOPER_CREDIT}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          محمي بتشفير وسياسات أمان الصفوف (RLS) عبر Supabase • مصمم خصيصاً لمجتمع {APP_NAME}
        </p>
      </footer>
    </div>
  );
};

// ============================================================================
// 9. NEW CHAT MODAL (LIST ALL OTHER USERS + SEARCH + CREATE_DIRECT_CONVERSATION)
// ============================================================================
const NewChatModal: React.FC<{
  profiles: Profile[];
  currentUserId: string;
  loadingProfiles: boolean;
  onSelectUser: (user: Profile) => Promise<void>;
  onClose: () => void;
}> = ({ profiles, currentUserId, loadingProfiles, onSelectUser, onClose }) => {
  const [search, setSearch] = useState('');
  const [creatingForId, setCreatingForId] = useState<string | null>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);

  const otherUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles
      .filter((p) => p.id !== currentUserId)
      .filter((p) => !q || (p.display_name || 'عضو').toLowerCase().includes(q));
  }, [profiles, currentUserId, search]);

  const handleTapUser = async (u: Profile) => {
    setRpcError(null);
    setCreatingForId(u.id);
    try {
      await onSelectUser(u);
    } catch (err: any) {
      setRpcError(
        err?.message || 'معرفناش نفتح المحادثة دلوقتي، اتأكد من اتصالك بالإنترنت وجرب تاني.'
      );
    } finally {
      setCreatingForId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="بدء محادثة جديدة"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md max-h-[82dvh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base">
                محادثة جديدة
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                اختار أي عضو من مجتمع {APP_NAME} وابدأ الكلام فوراً
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
            <input
              type="search"
              autoFocus
              placeholder="ابحث باسم العضو..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full min-h-[44px] ps-10 pe-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition-all"
            />
          </div>
          {rpcError && (
            <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {rpcError}
            </div>
          )}
        </div>

        {/* Profiles List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {loadingProfiles ? (
            <div className="p-8 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span>بنحمل قائمة الأعضاء...</span>
            </div>
          ) : otherUsers.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                ملقيناش حد بالاسم ده
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                جرب تكتب اسم تاني أو امسح كلمة البحث عشان تشوف كل الأعضاء.
              </p>
            </div>
          ) : (
            otherUsers.map((person) => {
              const status = getLastSeenStatusAr(person.last_seen);
              const isBusy = creatingForId === person.id;
              return (
                <button
                  key={person.id}
                  onClick={() => handleTapUser(person)}
                  disabled={Boolean(creatingForId)}
                  className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-start cursor-pointer disabled:opacity-60"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Avatar
                      name={person.display_name}
                      url={person.avatar_url}
                      size="md"
                      isOnline={status.isOnline}
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {person.display_name || 'عضو المجتمع'}
                      </p>
                      <p
                        className={`text-xs truncate mt-0.5 ${
                          status.isOnline
                            ? 'text-teal-600 dark:text-teal-400 font-medium'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {status.label}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 ms-3">
                    {isBusy ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 rounded-lg">
                        مراسلة
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 10. PROFILE DRAWER / MODAL (EDIT DISPLAY NAME & AVATAR UPLOAD TO "avatars")
// ============================================================================
const ProfileModal: React.FC<{
  profile: Profile;
  isDemo: boolean;
  onUpdateProfile: (changes: { display_name: string; avatar_url: string | null }) => Promise<void>;
  onOpenSqlDocs: () => void;
  onClose: () => void;
}> = ({ profile, isDemo, onUpdateProfile, onOpenSqlDocs, onClose }) => {
  const [displayName, setDisplayName] = useState(profile.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setFeedback({
        type: 'error',
        text: 'حجم الصورة كبير شوية. اختار صورة أقل من 2 ميجابايت.',
      });
      return;
    }

    setUploading(true);
    setFeedback(null);

    if (isDemo) {
      const reader = new FileReader();
      reader.onload = () => {
        setAvatarUrl(reader.result as string);
        setUploading(false);
        setFeedback({ type: 'success', text: 'تم تحديث معاينة الصورة بنجاح!' });
      };
      reader.readAsDataURL(file);
      return;
    }

    try {
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `${profile.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setAvatarUrl(publicUrlData.publicUrl);
      setFeedback({
        type: 'success',
        text: 'تم رفع الصورة بنجاح! دوس على "حفظ التغييرات" لتأكيدها.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `معرفناش نرفع الصورة للسيرفر (${err?.message || 'Storage policy missing'}). لو لسه مشغلتش كود SQL بتاع سلة avatars، افتحه من الزرار تحت.`,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      setFeedback({ type: 'error', text: 'الاسم مينفعش يكون فاضي.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      await onUpdateProfile({ display_name: trimmed, avatar_url: avatarUrl });
      setFeedback({ type: 'success', text: 'تم حفظ بيانات حسابك بنجاح!' });
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `حصلت مشكلة وإحنا بنحفظ التعديلات: ${err?.message || 'حاول تاني'}`,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="الملف الشخصي"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-base text-slate-900 dark:text-white">
            تعديل الملف الشخصي
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Avatar uploader */}
          <div className="flex flex-col items-center">
            <div className="relative group">
              <Avatar name={displayName} url={avatarUrl} size="xl" isOnline />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 end-0 w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center ring-2 ring-white dark:ring-slate-900 transition-transform active:scale-95 cursor-pointer"
                aria-label="تغيير الصورة الشخصية"
              >
                {uploading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleAvatarFileChange}
                className="hidden"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              دوس على الكاميرا لرفع صورة شخصية جديدة (بحد أقصى 2MB)
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-display-name"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-start"
            >
              الاسم الظاهر في المحادثات
            </label>
            <input
              id="edit-display-name"
              type="text"
              required
              maxLength={50}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {feedback && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-semibold leading-relaxed ${
                feedback.type === 'success'
                  ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-900'
                  : 'bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900'
              }`}
            >
              <p>{feedback.text}</p>
              {feedback.type === 'error' && (
                <button
                  type="button"
                  onClick={onOpenSqlDocs}
                  className="mt-2 underline font-bold text-red-900 dark:text-red-100 block cursor-pointer"
                >
                  عرض كود SQL لإنشاء سلة avatars وسياساتها
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex-1 min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] px-5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// 11. MAIN APPLICATION ROOT (REALTIME + AUTH + 2-PANE RTL MESSENGER)
// ============================================================================
export default function App() {
  useBrandHeadSetup();

  // Theme State (respects prefers-color-scheme initially)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Auth & Demo States
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [authModeOverride, setAuthModeOverride] = useState<AuthViewMode>('signin');
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Modals & UI States
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isOnlineNetwork, setIsOnlineNetwork] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Browser Notification Prompt State
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [dismissedNotifBanner, setDismissedNotifBanner] = useState(false);

  // Data States
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [conversations, setConversations] = useState<EnrichedConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);

  // Messages per conversation & Pagination
  const [messagesByConv, setMessagesByConv] = useState<Record<string, Message[]>>({});
  const [hasMoreOlderByConv, setHasMoreOlderByConv] = useState<Record<string, boolean>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Composer & Scroll States
  const [draftText, setDraftText] = useState('');
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // New Rich Features States (Reply, Reactions, Voice Note, Media Upload, In-Chat Search, Typing, Sound)
  const [replyingToMsg, setReplyingToMsg] = useState<Message | null>(null);
  const [reactionsByMsgId, setReactionsByMsgId] = useState<Record<string, Record<string, string[]>>>({
    'm-104': { '❤️': ['demo-me-001'], '🔥': ['demo-user-002'] },
  });
  const [activeReactionPickerMsgId, setActiveReactionPickerMsgId] = useState<string | null>(null);
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [typingByConv, setTypingByConv] = useState<Record<string, boolean>>({});
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Voice Recording States
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const chatAttachmentInputRef = useRef<HTMLInputElement>(null);
  const realtimeChannelRef = useRef<RealtimeChannelClient | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeConvIdRef = useRef<string | null>(null);
  activeConvIdRef.current = activeConvId;

  const currentUserId = isDemoMode ? DEMO_MY_PROFILE.id : sessionUser?.id || '';

  const QUICK_EMOJIS = ['❤️', '👍', '😂', '🔥', '👏', '🎉'];
  const COMPOSER_EMOJIS = ['😊', '😂', '❤️', '🔥', '👍', '🙏', '✨', '🎉', '😎', '🌹', '💯', '🚀'];

  // --------------------------------------------------------------------------
  // A. AUTH SESSION LISTENER
  // --------------------------------------------------------------------------
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSessionUser(session?.user ?? null);
      setAuthInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setSessionUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        setAuthModeOverride('update-password');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // --------------------------------------------------------------------------
  // B. DATA FETCHING (PROFILES, CONVERSATIONS, MESSAGES)
  // --------------------------------------------------------------------------
  const fetchProfilesAndConversations = useCallback(async () => {
    if (isDemoMode || !sessionUser) return;
    setLoadingConversations(true);
    try {
      // 1. Fetch all profiles
      const { data: profilesData, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .order('display_name', { ascending: true });

      if (profError) throw profError;
      const profilesList = (profilesData || []) as Profile[];
      setAllProfiles(profilesList);

      const profilesMap = new Map<string, Profile>();
      profilesList.forEach((p) => profilesMap.set(p.id, p));

      const me = profilesMap.get(sessionUser.id) || {
        id: sessionUser.id,
        display_name:
          sessionUser.user_metadata?.display_name ||
          sessionUser.email?.split('@')[0] ||
          'أنا',
        avatar_url: null,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      setMyProfile(me);

      // 2. Fetch conversations I belong to
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('*');
      if (convError) throw convError;

      const convList = (convData || []) as Conversation[];
      if (convList.length === 0) {
        setConversations([]);
        return;
      }

      const convIds = convList.map((c) => c.id);

      // 3. Fetch conversation_members for these conversations
      const { data: membersData, error: memError } = await supabase
        .from('conversation_members')
        .select('*')
        .in('conversation_id', convIds);
      if (memError) throw memError;

      const membersList = (membersData || []) as ConversationMember[];

      // 4. Fetch recent messages across these conversations to compute lastMessage & unreadCount
      const { data: recentMsgsData, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(300);
      if (msgError) throw msgError;

      const recentMsgs = (recentMsgsData || []) as Message[];

      // Build EnrichedConversations
      const enriched: EnrichedConversation[] = convList.map((conv) => {
        const cMembers = membersList.filter((m) => m.conversation_id === conv.id);
        const myMember = cMembers.find((m) => m.user_id === sessionUser.id);
        const otherMember = cMembers.find((m) => m.user_id !== sessionUser.id);
        const otherUser = otherMember ? profilesMap.get(otherMember.user_id) || null : null;

        const cMessages = recentMsgs.filter((m) => m.conversation_id === conv.id);
        const lastMessage = cMessages[0] || null;

        const myLastReadTime = myMember?.last_read_at
          ? new Date(myMember.last_read_at).getTime()
          : 0;

        const unreadCount = cMessages.filter(
          (m) =>
            m.sender_id !== sessionUser.id &&
            new Date(m.created_at).getTime() > myLastReadTime
        ).length;

        return {
          id: conv.id,
          is_group: conv.is_group,
          name: conv.name,
          created_at: conv.created_at,
          otherUser,
          myLastReadAt: myMember?.last_read_at || null,
          otherLastReadAt: otherMember?.last_read_at || null,
          lastMessage,
          unreadCount,
        };
      });

      // Sort by latest activity (lastMessage.created_at or conv.created_at)
      enriched.sort((a, b) => {
        const timeA = new Date(a.lastMessage?.created_at || a.created_at).getTime();
        const timeB = new Date(b.lastMessage?.created_at || b.created_at).getTime();
        return timeB - timeA;
      });

      setConversations(enriched);
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  }, [isDemoMode, sessionUser]);

  // Mark conversation as read in DB & local state
  const markConversationRead = useCallback(
    async (convId: string) => {
      const nowIso = new Date().toISOString();
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId ? { ...c, myLastReadAt: nowIso, unreadCount: 0 } : c
        )
      );

      if (isDemoMode || !sessionUser) return;
      try {
        await supabase
          .from('conversation_members')
          .update({ last_read_at: nowIso })
          .eq('conversation_id', convId)
          .eq('user_id', sessionUser.id);
      } catch (err) {
        console.error('Failed to update last_read_at:', err);
      }
    },
    [isDemoMode, sessionUser]
  );

  // Fetch initial 50 messages for a conversation
  const fetchMessagesForConversation = useCallback(
    async (convId: string) => {
      if (isDemoMode || !sessionUser) return;
      setLoadingMessages(true);
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        const fetchedDesc = (data || []) as Message[];
        const chronological = [...fetchedDesc].reverse();

        setMessagesByConv((prev) => ({
          ...prev,
          [convId]: chronological,
        }));
        setHasMoreOlderByConv((prev) => ({
          ...prev,
          [convId]: fetchedDesc.length === 50,
        }));
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    },
    [isDemoMode, sessionUser]
  );

  // Load 50 older messages on scroll up (preserving scroll height)
  const loadOlderMessages = async () => {
    if (!activeConvId || loadingOlder) return;
    const currentMsgs = messagesByConv[activeConvId] || [];
    if (currentMsgs.length === 0) return;

    const oldestCreatedAt = currentMsgs[0].created_at;
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;

    setLoadingOlder(true);

    if (isDemoMode) {
      // Simulate loading older page in Demo Mode
      setTimeout(() => {
        const olderMsg: Message = {
          id: `demo-older-${Date.now()}`,
          conversation_id: activeConvId,
          sender_id:
            conversations.find((c) => c.id === activeConvId)?.otherUser?.id ||
            'demo-user-002',
          content: 'دي رسالة أقدم تم تحميلها بنجاح مع الحفاظ على مكان التمرير (Pagination 50)!',
          type: 'text',
          media_url: null,
          created_at: new Date(new Date(oldestCreatedAt).getTime() - 7200000).toISOString(),
        };
        setMessagesByConv((prev) => ({
          ...prev,
          [activeConvId]: [olderMsg, ...(prev[activeConvId] || [])],
        }));
        setHasMoreOlderByConv((prev) => ({ ...prev, [activeConvId]: false }));
        setLoadingOlder(false);

        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevScrollHeight;
          }
        });
      }, 350);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', activeConvId)
        .lt('created_at', oldestCreatedAt)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      const olderDesc = (data || []) as Message[];
      const olderChronological = [...olderDesc].reverse();

      setMessagesByConv((prev) => {
        const existing = prev[activeConvId] || [];
        const existingIds = new Set(existing.map((m) => m.id));
        const uniqueOlder = olderChronological.filter((m) => !existingIds.has(m.id));
        return {
          ...prev,
          [activeConvId]: [...uniqueOlder, ...existing],
        };
      });

      setHasMoreOlderByConv((prev) => ({
        ...prev,
        [activeConvId]: olderDesc.length === 50,
      }));

      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      });
    } catch (err) {
      console.error('Error loading older messages:', err);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Trigger initial load when session starts
  useEffect(() => {
    if (sessionUser && !isDemoMode) {
      fetchProfilesAndConversations();    }
  }, [sessionUser, isDemoMode, fetchProfilesAndConversations]);

  // When selecting a conversation, fetch its messages & update my last_read_at
  useEffect(() => {
    if (!activeConvId) return;
    if (!isDemoMode && !messagesByConv[activeConvId]) {
      fetchMessagesForConversation(activeConvId);
    }
    markConversationRead(activeConvId);
  }, [activeConvId, isDemoMode, fetchMessagesForConversation, markConversationRead]);

  // --------------------------------------------------------------------------
  // C. REALTIME SUBSCRIPTIONS (messages, conversation_members, profiles)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (isDemoMode || !sessionUser) return;

    const channel = supabase
      .channel(`realtime-messenger-${sessionUser.id}`)
      // 1. Listen for new messages
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as Message;
          const isOpenConv = activeConvIdRef.current === newMsg.conversation_id;

          // Append & Deduplicate in messagesByConv
          setMessagesByConv((prev) => {
            const list = prev[newMsg.conversation_id] || [];
            // Check if already exists by id
            if (list.some((m) => m.id === newMsg.id)) {
              return prev;
            }
            // Check if there is an optimistic pending message from me with same content
            const pendingIdx = list.findIndex(
              (m) =>
                m._status === 'sending' &&
                m.sender_id === newMsg.sender_id &&
                m.content === newMsg.content
            );
            if (pendingIdx !== -1) {
              const updated = [...list];
              updated[pendingIdx] = newMsg;
              return { ...prev, [newMsg.conversation_id]: updated };
            }
            return { ...prev, [newMsg.conversation_id]: [...list, newMsg] };
          });

          // Update conversation list preview, sorting & unread badge
          setConversations((prev) => {
            const exists = prev.some((c) => c.id === newMsg.conversation_id);
            if (!exists) {
              // New conversation started by someone else! Refetch conversations
              fetchProfilesAndConversations();
              return prev;
            }

            const updated = prev.map((c) => {
              if (c.id !== newMsg.conversation_id) return c;
              const isFromOther = newMsg.sender_id !== sessionUser.id;
              return {
                ...c,
                lastMessage: newMsg,
                unreadCount:
                  isFromOther && !isOpenConv ? c.unreadCount + 1 : c.unreadCount,
              };
            });

            updated.sort((a, b) => {
              const tA = new Date(a.lastMessage?.created_at || a.created_at).getTime();
              const tB = new Date(b.lastMessage?.created_at || b.created_at).getTime();
              return tB - tA;
            });

            return updated;
          });

          // If conversation is currently open and message is from the other person, mark read immediately
          if (isOpenConv && newMsg.sender_id !== sessionUser.id) {
            markConversationRead(newMsg.conversation_id);
          }

          // Announce for screen readers & fire browser notification if tab is hidden
          if (newMsg.sender_id !== sessionUser.id) {
            playChatSound('receive', soundMuted);
            setTypingByConv((prev) => ({ ...prev, [newMsg.conversation_id]: false }));
            setLiveAnnouncement(`رسالة جديدة: ${newMsg.content}`);
            if (
              document.hidden &&
              typeof Notification !== 'undefined' &&
              Notification.permission === 'granted'
            ) {
              new Notification(APP_NAME, {
                body: newMsg.content,
                lang: 'ar',
                dir: 'rtl',
              });
            }
          }
        }
      )
      // 1B. Listen for live typing & emoji reactions broadcast events
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { conversation_id, user_id } = payload.payload || {};
        if (conversation_id && user_id !== sessionUser.id) {
          setTypingByConv((prev) => ({ ...prev, [conversation_id]: true }));
          setTimeout(() => {
            setTypingByConv((prev) => ({ ...prev, [conversation_id]: false }));
          }, 3000);
        }
      })
      .on('broadcast', { event: 'reaction' }, (payload) => {
        const { message_id, emoji, user_id } = payload.payload || {};
        if (message_id && emoji && user_id) {
          setReactionsByMsgId((prev) => {
            const msgReactions = { ...(prev[message_id] || {}) };
            const users = new Set(msgReactions[emoji] || []);
            if (users.has(user_id)) {
              users.delete(user_id);
            } else {
              users.add(user_id);
            }
            msgReactions[emoji] = Array.from(users);
            return { ...prev, [message_id]: msgReactions };
          });
        }
      })
      // 2. Listen for conversation_members changes (read receipts & new memberships)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members' },
        (payload) => {
          const row = payload.new as ConversationMember;
          if (!row) return;

          if (payload.eventType === 'INSERT' && row.user_id === sessionUser.id) {
            fetchProfilesAndConversations();
            return;
          }

          if (payload.eventType === 'UPDATE' && row.user_id !== sessionUser.id) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === row.conversation_id
                  ? { ...c, otherLastReadAt: row.last_read_at }
                  : c
              )
            );
          }
        }
      )
      // 3. Listen for profile updates (online/last_seen, avatar, display_name)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updatedProfile = payload.new as Profile;
          setAllProfiles((prev) =>
            prev.map((p) => (p.id === updatedProfile.id ? updatedProfile : p))
          );
          setConversations((prev) =>
            prev.map((c) =>
              c.otherUser?.id === updatedProfile.id
                ? { ...c, otherUser: updatedProfile }
                : c
            )
          );
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      realtimeChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [isDemoMode, sessionUser, soundMuted, fetchProfilesAndConversations, markConversationRead]);

  // --------------------------------------------------------------------------
  // D. RECONNECT / FOCUS / LAST_SEEN HEARTBEAT (THROTTLED ONCE PER MINUTE)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handleOnline = () => {
      setIsOnlineNetwork(true);
      if (sessionUser && !isDemoMode) {
        fetchProfilesAndConversations();
        if (activeConvIdRef.current) {
          fetchMessagesForConversation(activeConvIdRef.current);
        }
      }
    };
    const handleOffline = () => setIsOnlineNetwork(false);
    const handleFocus = () => {
      if (sessionUser && !isDemoMode) {
        fetchProfilesAndConversations();
        if (activeConvIdRef.current) {
          fetchMessagesForConversation(activeConvIdRef.current);
          markConversationRead(activeConvIdRef.current);
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
    };
  }, [
    sessionUser,
    isDemoMode,
    fetchProfilesAndConversations,
    fetchMessagesForConversation,
    markConversationRead,
  ]);

  // Update profiles.last_seen once every 60 seconds while app is open
  useEffect(() => {
    if (isDemoMode || !sessionUser) return;

    const updateMyLastSeen = async () => {
      if (document.hidden) return;
      try {
        await supabase
          .from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', sessionUser.id);
      } catch {
        // Silent heartbeat catch
      }
    };

    updateMyLastSeen();
    const interval = setInterval(updateMyLastSeen, 60000);
    return () => clearInterval(interval);
  }, [isDemoMode, sessionUser]);

  // --------------------------------------------------------------------------
  // E. AUTO-SCROLL TO BOTTOM ON NEW MESSAGE
  // --------------------------------------------------------------------------
  const activeMessages = useMemo(() => {
    const list = activeConvId ? messagesByConv[activeConvId] || [] : [];
    const q = chatSearchQuery.trim().toLowerCase();
    if (!chatSearchOpen || !q) return list;
    return list.filter((m) => m.content.toLowerCase().includes(q));
  }, [activeConvId, messagesByConv, chatSearchOpen, chatSearchQuery]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    if (!showScrollBottomBtn) {
      scrollToBottom('smooth');
    }
  }, [activeMessages.length, activeConvId, showScrollBottomBtn, scrollToBottom]);

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottomBtn(distanceFromBottom > 220);

    // Load older messages if scrolled near top
    if (
      el.scrollTop < 60 &&
      activeConvId &&
      hasMoreOlderByConv[activeConvId] &&
      !loadingOlder
    ) {
      loadOlderMessages();
    }
  };

  // --------------------------------------------------------------------------
  // F. SEND MESSAGE (OPTIMISTIC UI + RETRY + DEDUPLICATION + 4000 CHAR CAP)
  // --------------------------------------------------------------------------
  const broadcastTyping = () => {
    if (!activeConvId || !currentUserId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    if (!isDemoMode && realtimeChannelRef.current) {
      realtimeChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { conversation_id: activeConvId, user_id: currentUserId },
      });
    }
  };

  const toggleReaction = (msgId: string, emoji: string) => {
    if (!currentUserId) return;
    playChatSound('reaction', soundMuted);
    setReactionsByMsgId((prev) => {
      const msgReactions = { ...(prev[msgId] || {}) };
      const users = new Set(msgReactions[emoji] || []);
      if (users.has(currentUserId)) {
        users.delete(currentUserId);
      } else {
        users.add(currentUserId);
      }
      msgReactions[emoji] = Array.from(users);
      return { ...prev, [msgId]: msgReactions };
    });
    setActiveReactionPickerMsgId(null);

    if (!isDemoMode && realtimeChannelRef.current) {
      realtimeChannelRef.current.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { message_id: msgId, emoji, user_id: currentUserId },
      });
    }
  };

  const sendMessage = async (
    contentToSend: string,
    retryTempId?: string,
    options?: {
      type?: MessageType;
      media_url?: string | null;
      fileName?: string | null;
    }
  ) => {
    const msgType: MessageType = options?.type || 'text';
    const mediaUrl = options?.media_url || null;
    let trimmed = contentToSend.trim().slice(0, 4000);
    if (!trimmed && !mediaUrl) return;
    if (!activeConvId || !currentUserId) return;

    // If replying to a message, embed a clean quote header so it persists across sessions without altering DB schema
    const replySnapshot = replyingToMsg
      ? {
          id: replyingToMsg.id,
          senderName:
            replyingToMsg.sender_id === currentUserId
              ? myProfile?.display_name || 'أنا'
              : activeConversation?.otherUser?.display_name || 'عضو المجتمع',
          content: replyingToMsg.content.slice(0, 90),
        }
      : null;

    if (replySnapshot && !retryTempId) {
      trimmed = `↩️ رد على ${replySnapshot.senderName}: "${replySnapshot.content}"\n${trimmed}`;
    }

    const tempId = retryTempId || `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();

    const optimisticMsg: Message = {
      id: tempId,
      _tempId: tempId,
      conversation_id: activeConvId,
      sender_id: currentUserId,
      content: trimmed || (msgType === 'image' ? '📷 صورة مرفقة' : msgType === 'audio' ? '🎙️ رسالة صوتية' : '📎 ملف مرفق'),
      type: msgType,
      media_url: mediaUrl,
      created_at: nowIso,
      _status: 'sending',
      _replyTo: replySnapshot,
      _fileName: options?.fileName || null,
    };

    if (!retryTempId) {
      setDraftText('');
      setReplyingToMsg(null);
      setShowEmojiBar(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }

    playChatSound('send', soundMuted);

    // 1. Insert or update optimistically
    setMessagesByConv((prev) => {
      const current = prev[activeConvId] || [];
      if (retryTempId) {
        return {
          ...prev,
          [activeConvId]: current.map((m) =>
            m.id === retryTempId ? { ...m, _status: 'sending' } : m
          ),
        };
      }
      return {
        ...prev,
        [activeConvId]: [...current, optimisticMsg],
      };
    });

    // Update sidebar preview immediately
    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.id === activeConvId ? { ...c, lastMessage: optimisticMsg } : c
      );
      updated.sort((a, b) => {
        const tA = new Date(a.lastMessage?.created_at || a.created_at).getTime();
        const tB = new Date(b.lastMessage?.created_at || b.created_at).getTime();
        return tB - tA;
      });
      return updated;
    });

    requestAnimationFrame(() => scrollToBottom('smooth'));

    // Handle Demo Mode instant simulated delivery + read receipt
    if (isDemoMode) {
      setTimeout(() => {
        const confirmedId = `msg-${Date.now()}`;
        setMessagesByConv((prev) => ({
          ...prev,
          [activeConvId]: (prev[activeConvId] || []).map((m) =>
            m.id === tempId ? { ...m, id: confirmedId, _status: 'sent' } : m
          ),
        }));

        // Mark as read by the other person after 1.2s (✓ -> ✓✓)
        setTimeout(() => {
          const readIso = new Date().toISOString();
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeConvId ? { ...c, otherLastReadAt: readIso } : c
            )
          );
        }, 1200);
      }, 350);
      return;
    }

    // Real Supabase insert
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: activeConvId,
          sender_id: currentUserId,
          content: optimisticMsg.content,
          type: msgType,
          media_url: mediaUrl,
        })
        .select('*')
        .single();

      if (error) throw error;
      const realMsg = data as Message;

      // Replace optimistic message with real DB row (or remove if realtime already added it)
      setMessagesByConv((prev) => {
        const list = prev[activeConvId] || [];
        const alreadyAddedByRealtime = list.some((m) => m.id === realMsg.id);
        if (alreadyAddedByRealtime) {
          return {
            ...prev,
            [activeConvId]: list.filter((m) => m.id !== tempId),
          };
        }
        return {
          ...prev,
          [activeConvId]: list.map((m) =>
            m.id === tempId ? { ...realMsg, _status: 'sent' } : m
          ),
        };
      });
    } catch (err) {
      console.error('Message send failed:', err);
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConvId]: (prev[activeConvId] || []).map((m) =>
          m.id === tempId ? { ...m, _status: 'failed' } : m
        ),
      }));
    }
  };

  // Handle Image or Document Upload
  const handleChatAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConvId) return;
    e.target.value = '';

    const isImage = file.type.startsWith('image/');
    const msgType: MessageType = isImage ? 'image' : 'file';
    const label = isImage ? `📷 صورة: ${file.name}` : `📎 ملف: ${file.name}`;

    if (isDemoMode) {
      const reader = new FileReader();
      reader.onload = () => {
        sendMessage(label, undefined, {
          type: msgType,
          media_url: reader.result as string,
          fileName: file.name,
        });
      };
      reader.readAsDataURL(file);
      return;
    }

    setUploadingMedia(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${activeConvId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error } = await supabase.storage
        .from('chat-media')
        .upload(path, file, { upsert: true });

      if (error) {
        // Fallback to DataURL if chat-media bucket is not yet created
        const reader = new FileReader();
        reader.onload = () => {
          sendMessage(label, undefined, {
            type: msgType,
            media_url: reader.result as string,
            fileName: file.name,
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      const { data: pubData } = supabase.storage.from('chat-media').getPublicUrl(path);
      await sendMessage(label, undefined, {
        type: msgType,
        media_url: pubData.publicUrl,
        fileName: file.name,
      });
    } finally {
      setUploadingMedia(false);
    }
  };

  // Start / Stop Voice Note Recording
  const startVoiceRecording = async () => {
    if (isRecordingAudio) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 200) return;

        const reader = new FileReader();
        reader.onload = () => {
          const base64Audio = reader.result as string;
          sendMessage(`🎙️ رسالة صوتية (${recordingSeconds} ثانية)`, undefined, {
            type: 'audio',
            media_url: base64Audio,
          });
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingAudio(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      // Fallback simulated voice note if mic permission is denied in iframe preview
      sendMessage('🎙️ رسالة صوتية (0:04)', undefined, {
        type: 'audio',
        media_url: 'simulated-voice-note',
      });
    }
  };

  const stopVoiceRecording = (cancel = false) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (cancel) {
        audioChunksRef.current = [];
      }
      mediaRecorderRef.current.stop();
    }
    setIsRecordingAudio(false);
  };

  // --------------------------------------------------------------------------
  // G. START NEW DIRECT CONVERSATION VIA RPC `create_direct_conversation`
  // --------------------------------------------------------------------------
  const handleStartDirectConversation = async (otherUser: Profile) => {
    if (isDemoMode) {
      const existing = conversations.find((c) => c.otherUser?.id === otherUser.id);
      if (existing) {
        setActiveConvId(existing.id);
        setShowNewChatModal(false);
        return;
      }
      const newConvId = `demo-conv-${Date.now()}`;
      const newConv: EnrichedConversation = {
        id: newConvId,
        is_group: false,
        name: null,
        created_at: new Date().toISOString(),
        otherUser,
        myLastReadAt: new Date().toISOString(),
        otherLastReadAt: new Date().toISOString(),
        lastMessage: null,
        unreadCount: 0,
      };
      setConversations((prev) => [newConv, ...prev]);
      setMessagesByConv((prev) => ({ ...prev, [newConvId]: [] }));
      setActiveConvId(newConvId);
      setShowNewChatModal(false);
      return;
    }

    const { data: convId, error } = await supabase.rpc('create_direct_conversation', {
      other_user: otherUser.id,
    });

    if (error) throw error;
    const targetConvId = convId as string;

    await fetchProfilesAndConversations();
    setActiveConvId(targetConvId);
    setShowNewChatModal(false);
  };

  // --------------------------------------------------------------------------
  // H. UPDATE MY PROFILE
  // --------------------------------------------------------------------------
  const handleUpdateMyProfile = async (changes: {
    display_name: string;
    avatar_url: string | null;
  }) => {
    if (isDemoMode) {
      setMyProfile((prev) =>
        prev ? { ...prev, ...changes } : { ...DEMO_MY_PROFILE, ...changes }
      );
      return;
    }
    if (!sessionUser) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: changes.display_name,
        avatar_url: changes.avatar_url,
      })
      .eq('id', sessionUser.id);

    if (error) throw error;
    setMyProfile((prev) => (prev ? { ...prev, ...changes } : null));
  };

  // --------------------------------------------------------------------------
  // I. ENTER DEMO MODE HANDLER
  // --------------------------------------------------------------------------
  const enterDemoMode = () => {
    setIsDemoMode(true);
    setMyProfile(DEMO_MY_PROFILE);
    setAllProfiles([DEMO_MY_PROFILE, ...DEMO_USERS]);
    setConversations(INITIAL_DEMO_CONVERSATIONS);
    setMessagesByConv(INITIAL_DEMO_MESSAGES);
    setHasMoreOlderByConv({
      'conv-sara-1': true,
      'conv-karim-2': false,
      'conv-nada-3': false,
    });
    setActiveConvId('conv-sara-1');
  };

  // Filtered conversations by search query
  const filteredConversations = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = (c.otherUser?.display_name || c.name || '').toLowerCase();
      const preview = (c.lastMessage?.content || '').toLowerCase();
      return name.includes(q) || preview.includes(q);
    });
  }, [conversations, sidebarSearch]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConvId) || null,
    [conversations, activeConvId]
  );

  // Request Browser Notification Permission Politely
  const handleEnableBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      new Notification(`تم تفعيل إشعارات ${APP_NAME}`, {
        body: 'هننبهك أول ما توصلك أي رسالة جديدة وأنت في نافذة تانية.',
        lang: 'ar',
        dir: 'rtl',
      });
    }
  };

  // --------------------------------------------------------------------------
  // RENDER LOADING OR AUTH SCREEN IF SIGNED OUT
  // --------------------------------------------------------------------------
  if (authInitializing) {
    return (
      <div className="h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-4">
        <BrandLogo size="lg" />
        <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span>جاري فتح {APP_NAME}...</span>
        </div>
      </div>
    );
  }

  if ((!sessionUser && !isDemoMode) || authModeOverride === 'update-password') {
    return (
      <>
        <AuthScreen
          initialMode={authModeOverride}
          onEnterDemoMode={enterDemoMode}
          onOpenDocs={() => setShowDocsModal(true)}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
        />
        {showDocsModal && <ProjectDocsModal onClose={() => setShowDocsModal(false)} />}
      </>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER MAIN 2-PANE RTL MESSENGER
  // --------------------------------------------------------------------------
  return (
    <div
      dir="rtl"
      lang="ar"
      style={{ fontFamily: "'Cairo', 'IBM Plex Sans Arabic', sans-serif" }}
      className="h-[100dvh] w-full overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col select-none"
    >
      {/* Screen-reader live region for incoming messages */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Offline Banner */}
      {!isOnlineNetwork && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 shrink-0">
          <WifiOff className="w-4 h-4" />
          <span>
            أنت غير متصل بالإنترنت حالياً. سيتم إرسال رسائلك ومزامنتها تلقائياً فور عودة الاتصال.
          </span>
        </div>
      )}

      {/* Demo Mode Top Banner */}
      {isDemoMode && (
        <div className="bg-gradient-to-l from-[#0B2D48] via-[#103A5C] to-[#EA580C] text-white px-4 py-2 text-xs flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <Sparkles className="w-4 h-4 text-orange-200 shrink-0" />
            <span className="font-semibold truncate">
              وضع المعاينة الفورية (Demo) — {DEVELOPER_CREDIT}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowDocsModal(true)}
              className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-bold transition-colors cursor-pointer"
            >
              ملفات المشروع و SQL
            </button>
            <button
              onClick={() => {
                setIsDemoMode(false);
                setActiveConvId(null);
              }}
              className="px-2.5 py-1 rounded-lg bg-white text-[#0B2D48] font-bold hover:bg-slate-100 transition-colors cursor-pointer"
            >
              الدخول بحساب حقيقي
            </button>
          </div>
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ====================================================================
            RIGHT PANE (IN RTL): SIDEBAR / CONVERSATION LIST
            Visible on Desktop (>=1024px) OR on Mobile when no chat is selected
           ==================================================================== */}
        <aside
          className={`${
            activeConvId ? 'hidden lg:flex' : 'flex'
          } w-full lg:w-[380px] xl:w-[410px] shrink-0 h-full flex-col bg-white dark:bg-slate-900 border-e border-slate-200/90 dark:border-slate-800 z-20`}
        >
          {/* Sidebar Header */}
          <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-[#F8F7F4]/70 dark:bg-slate-900">
            <div className="flex items-center gap-3 min-w-0">
              <BrandLogo size="sm" />
              <div className="min-w-0">
                <h1 className="font-extrabold text-base text-[#0B2D48] dark:text-white leading-tight truncate">
                  {APP_NAME}
                </h1>
                <button
                  onClick={() => setShowProfileModal(true)}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-[#EA580C] dark:hover:text-orange-400 truncate block text-start cursor-pointer"
                >
                  {myProfile?.display_name || 'إعدادات الحساب'}
                </button>
              </div>
            </div>

            {/* Action Icon Buttons (min 44px touch target) */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowNewChatModal(true)}
                className="w-11 h-11 rounded-xl text-[#EA580C] bg-[#EA580C]/10 hover:bg-[#EA580C]/20 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="بدء محادثة جديدة"
                title="محادثة جديدة"
              >
                <MessageSquarePlus className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowProfileModal(true)}
                className="w-11 h-11 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="تعديل الملف الشخصي"
                title="الملف الشخصي"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowDocsModal(true)}
                className="w-11 h-11 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="عرض كود المشروع وملفات SQL"
                title="كود المشروع وملفات SQL"
              >
                <Code2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setSoundMuted((m) => !m)}
                className="w-11 h-11 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                aria-label={soundMuted ? 'تشغيل أصوات المحادثة' : 'كتم أصوات المحادثة'}
                title={soundMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
              >
                {soundMuted ? (
                  <VolumeX className="w-5 h-5 text-slate-400" />
                ) : (
                  <Volume2 className="w-5 h-5 text-[#EA580C]" />
                )}
              </button>
              <button
                onClick={() => setDarkMode((d) => !d)}
                className="w-11 h-11 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                aria-label={darkMode ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
                title={darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
              >
                {darkMode ? (
                  <Sun className="w-5 h-5 text-amber-400" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={async () => {
                  if (isDemoMode) {
                    setIsDemoMode(false);
                    setActiveConvId(null);
                  } else {
                    await supabase.auth.signOut();
                    setActiveConvId(null);
                  }
                }}
                className="w-11 h-11 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="تسجيل الخروج"
                title="تسجيل الخروج"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Polite Browser Notification Banner */}
          {notifPermission === 'default' && !dismissedNotifBanner && (
            <div className="mx-3 mt-3 p-3.5 rounded-2xl bg-blue-50/90 dark:bg-slate-800/90 border border-blue-200/80 dark:border-slate-700 text-start">
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    تحب ننبهك لما توصلك رسالة جديدة؟
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                    هنبعتلك إشعار هادي على المتصفح بس لو فاتح تبويب تاني عشان متفوتكش أي رسالة مهمة.
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      onClick={handleEnableBrowserNotifications}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      تفعيل الإشعارات
                    </button>
                    <button
                      onClick={() => setDismissedNotifBanner(true)}
                      className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      مش دلوقتي
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-800/80">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
              <input
                type="search"
                placeholder="دور على محادثة أو اسم صديق..."
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                className="w-full min-h-[44px] ps-10 pe-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-transparent focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/50">
            {loadingConversations ? (
              <div className="p-8 text-center space-y-3">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  بنجهز محادثاتك...
                </p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center space-y-3 my-auto">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <MessageSquarePlus className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {sidebarSearch
                      ? 'مفيش محادثات مطابقة لبحثك'
                      : 'مفيش رسايل لسه.. ابدأ الكلام دلوقتي!'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {sidebarSearch
                      ? 'جرب تكتب اسم تاني أو ابدأ محادثة جديدة.'
                      : 'دوس على الزرار تحت واختار أي صديق من المجتمع عشان تفتحوا محادثة خاصة.'}
                  </p>
                </div>
                <button
                  onClick={() => setShowNewChatModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>ابدأ محادثة جديدة</span>
                </button>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === activeConvId;
                const contactName = conv.otherUser?.display_name || conv.name || 'عضو المجتمع';
                const status = getLastSeenStatusAr(conv.otherUser?.last_seen);
                const lastMsg = conv.lastMessage;
                const isMine = lastMsg?.sender_id === currentUserId;
                const isReadByOther =
                  lastMsg &&
                  conv.otherLastReadAt &&
                  new Date(conv.otherLastReadAt).getTime() >=
                    new Date(lastMsg.created_at).getTime();

                return (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConvId(conv.id)}
                    className={`w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors text-start cursor-pointer ${
                      isSelected
                        ? 'bg-[#0B2D48]/8 dark:bg-[#0B2D48]/40 border-s-4 border-s-[#EA580C]'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <Avatar
                      name={contactName}
                      url={conv.otherUser?.avatar_url}
                      size="md"                      isOnline={status.isOnline}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm truncate ${
                            conv.unreadCount > 0
                              ? 'font-extrabold text-[#0B2D48] dark:text-white'
                              : 'font-bold text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          {contactName}
                        </span>
                        <span
                          className={`text-[11px] shrink-0 ${
                            conv.unreadCount > 0
                              ? 'font-bold text-[#EA580C] dark:text-orange-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {formatConversationTimestampAr(
                            lastMsg?.created_at || conv.created_at
                          )}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          {isMine && lastMsg && (
                            <span className="shrink-0">
                              {lastMsg._status === 'sending' ? (
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                              ) : isReadByOther ? (
                                <CheckCheck className="w-4 h-4 text-[#EA580C]" />
                              ) : (
                                <Check className="w-4 h-4 text-slate-400" />
                              )}
                            </span>
                          )}
                          <p
                            dir="auto"
                            className={`text-xs truncate ${
                              conv.unreadCount > 0
                                ? 'font-bold text-slate-900 dark:text-slate-100'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {lastMsg ? lastMsg.content : 'ابدأ أول رسالة في المحادثة...'}
                          </p>
                        </div>

                        {conv.unreadCount > 0 && (
                          <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#EA580C] text-white text-[11px] font-extrabold flex items-center justify-center shrink-0 shadow-2xs">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Sidebar Developer Credit Footer */}
          <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800/80 bg-[#F8F7F4]/60 dark:bg-slate-900/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-bold text-[#0B2D48] dark:text-slate-200">
              {DEVELOPER_CREDIT}
            </span>
            <span className="text-[#EA580C] font-semibold">Hamza Shaheen</span>
          </div>
        </aside>

        {/* ====================================================================
            LEFT PANE (IN RTL): ACTIVE CHAT SCREEN OR EMPTY STATE ILLUSTRATION
           ==================================================================== */}
        <main
          className={`${
            activeConvId ? 'flex' : 'hidden lg:flex'
          } flex-1 h-full flex-col bg-[#F8F7F4]/70 dark:bg-slate-950 relative overflow-hidden`}
        >
          {!activeConversation ? (
            /* Desktop Empty State when no conversation is selected */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm mb-5">
                <BrandLogo size="xl" showFullBadge />
              </div>
              <h2 className="text-xl font-extrabold text-[#0B2D48] dark:text-white">
                مرحباً بك في {APP_NAME}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mt-2 leading-relaxed">
                اختار أي محادثة من القائمة الجانبية عشان تكمل كلامك، أو ابدأ محادثة جديدة مع أي عضو في المجتمع.
              </p>
              <button
                onClick={() => setShowNewChatModal(true)}
                className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#0B2D48] hover:bg-[#071E31] text-white font-bold text-sm shadow-md shadow-[#0B2D48]/20 transition-all cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-[#EA580C]" />
                <span>بدء محادثة جديدة</span>
              </button>
              <p className="mt-6 text-xs font-bold text-slate-400 dark:text-slate-500">
                {DEVELOPER_CREDIT}
              </p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <header className="px-4 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 z-10">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Mobile Back Button (min 44px touch target) */}
                  <button
                    onClick={() => setActiveConvId(null)}
                    className="lg:hidden w-11 h-11 -ms-1 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    aria-label="الرجوع لقائمة المحادثات"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>

                  {(() => {
                    const status = getLastSeenStatusAr(
                      activeConversation.otherUser?.last_seen
                    );
                    const name =
                      activeConversation.otherUser?.display_name ||
                      activeConversation.name ||
                      'عضو المجتمع';
                    return (
                      <>
                        <Avatar
                          name={name}
                          url={activeConversation.otherUser?.avatar_url}
                          size="md"
                          isOnline={status.isOnline}
                        />
                        <div className="min-w-0">
                          <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                            {name}
                          </h2>
                          {typingByConv[activeConversation.id] ? (
                            <p className="text-xs font-bold text-[#EA580C] dark:text-orange-400 flex items-center gap-1 animate-pulse">
                              <span>يكتب الآن...</span>
                            </p>
                          ) : (
                            <p
                              className={`text-xs truncate ${
                                status.isOnline
                                  ? 'text-teal-600 dark:text-teal-400 font-semibold'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {status.label}
                            </p>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Header Right Actions: Search in Chat + Demo Instant Reply */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      setChatSearchOpen((prev) => !prev);
                      setChatSearchQuery('');
                    }}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                      chatSearchOpen
                        ? 'bg-[#EA580C] text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    aria-label="بحث داخل المحادثة"
                    title="بحث داخل المحادثة"
                  >
                    <Search className="w-4 h-4" />
                  </button>

                  {isDemoMode && (
                    <button
                      onClick={() => {
                        const convId = activeConversation.id;
                        const senderId =
                          activeConversation.otherUser?.id || 'demo-user-002';
                        const senderName =
                          activeConversation.otherUser?.display_name || 'سارة';

                        // Show live "يكتب الآن..." indicator for 1.3s before delivering reply
                        setTypingByConv((prev) => ({ ...prev, [convId]: true }));

                        setTimeout(() => {
                          setTypingByConv((prev) => ({ ...prev, [convId]: false }));
                          const replies = [
                            `أكيد يا أحمد! مؤشر "يكتب الآن..." والإيموجي شغالين بطلاقة ⚡`,
                            `تسلم إيدك، جربت أبعت صورة ورسالة صوتية والتجربة ممتازة جداً 🎙️✨`,
                            `Checked the new Reply & Reactions (❤️🔥) — works like a charm!`,
                          ];
                          const randomText =
                            replies[Math.floor(Math.random() * replies.length)];
                          const incoming: Message = {
                            id: `demo-in-${Date.now()}`,
                            conversation_id: convId,
                            sender_id: senderId,
                            content: randomText,
                            type: 'text',
                            media_url: null,
                            created_at: new Date().toISOString(),
                          };
                          playChatSound('receive', soundMuted);
                          setMessagesByConv((prev) => ({
                            ...prev,
                            [convId]: [...(prev[convId] || []), incoming],
                          }));
                          setConversations((prev) =>
                            prev.map((c) =>
                              c.id === convId
                                ? {
                                    ...c,
                                    lastMessage: incoming,
                                    otherLastReadAt: new Date().toISOString(),
                                  }
                                : c
                            )
                          );
                          setLiveAnnouncement(`رسالة جديدة من ${senderName}: ${randomText}`);
                        }, 1300);
                      }}
                      className="px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 transition-colors cursor-pointer shrink-0"
                      title="محاكاة كتابة ورد فوري من الطرف الآخر"
                    >
                      + محاكاة يكتب الآن ورد
                    </button>
                  )}
                </div>
              </header>

              {/* Collapsible In-Conversation Search Bar */}
              {chatSearchOpen && (
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="search"
                    autoFocus
                    placeholder="ابحث عن كلمة داخل هذه المحادثة..."
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                  />
                  {chatSearchQuery && (
                    <span className="text-[11px] font-bold text-[#EA580C]">
                      {activeMessages.length} نتيجة
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setChatSearchOpen(false);
                      setChatSearchQuery('');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              )}

              {/* Messages Scroll Container */}
              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2 select-text"
              >
                {/* Load Older Pagination Button / Indicator */}
                {hasMoreOlderByConv[activeConversation.id] && (
                  <div className="flex justify-center py-2">
                    <button
                      onClick={loadOlderMessages}
                      disabled={loadingOlder}
                      className="px-4 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-2xs hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      {loadingOlder && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>
                        {loadingOlder ? 'جاري تحميل الرسائل الأقدم...' : 'تحميل الرسائل الأقدم'}
                      </span>
                    </button>
                  </div>
                )}

                {loadingMessages ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                    <span className="text-xs">جاري تحميل الرسائل...</span>
                  </div>
                ) : activeMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className="px-5 py-4 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-800 max-w-xs space-y-1.5 shadow-2xs">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        مفيش رسايل هنا لسه 👋
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        ابعت أول رسالة دلوقتي وابدأ الكلام مع{' '}
                        {activeConversation.otherUser?.display_name || 'صديقك'}!
                      </p>
                    </div>
                  </div>
                ) : (
                  activeMessages.map((msg, idx) => {
                    const prevMsg = idx > 0 ? activeMessages[idx - 1] : null;
                    const currDateLabel = formatDateSeparatorAr(msg.created_at);
                    const prevDateLabel = prevMsg
                      ? formatDateSeparatorAr(prevMsg.created_at)
                      : null;
                    const showDateSeparator = currDateLabel !== prevDateLabel;

                    const isMine = msg.sender_id === currentUserId;
                    const isRead =
                      isMine &&
                      activeConversation.otherLastReadAt &&
                      new Date(activeConversation.otherLastReadAt).getTime() >=
                        new Date(msg.created_at).getTime();

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateSeparator && (
                          <div className="flex justify-center my-4 select-none">
                            <span className="px-3.5 py-1 rounded-full bg-slate-200/80 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 text-[11px] font-bold shadow-2xs">
                              {currDateLabel}
                            </span>
                          </div>
                        )}

                        <div
                          className={`flex w-full group relative ${
                            isMine ? 'justify-start' : 'justify-end'
                          }`}
                        >
                          <div
                            className={`max-w-[85%] sm:max-w-[72%] rounded-2xl px-4 py-2.5 shadow-2xs transition-all relative ${
                              isMine
                                ? 'bg-[#0B2D48] text-white rounded-ss-sm'
                                : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200/70 dark:border-slate-800 rounded-se-sm'
                            }`}
                          >
                            {/* Hover / Tap Quick Actions: Reply & Emoji Reaction */}
                            <div
                              className={`opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity absolute -top-3 ${
                                isMine ? 'end-2' : 'start-2'
                              } z-10 flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-1.5 py-0.5 shadow-md`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyingToMsg(msg);
                                  textareaRef.current?.focus();
                                }}
                                className="p-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                                title="رد على الرسالة"
                                aria-label="رد على الرسالة"
                              >
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveReactionPickerMsgId((prev) =>
                                    prev === msg.id ? null : msg.id
                                  )
                                }
                                className="p-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                                title="تفاعل بإيموجي"
                                aria-label="تفاعل بإيموجي"
                              >
                                <Smile className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Popover Emoji Reaction Picker */}
                            {activeReactionPickerMsgId === msg.id && (
                              <div
                                className={`absolute -top-11 ${
                                  isMine ? 'start-0' : 'end-0'
                                } z-30 flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2.5 py-1 shadow-xl animate-in fade-in zoom-in-95 duration-150`}
                              >
                                {QUICK_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => toggleReaction(msg.id, emoji)}
                                    className="text-base hover:scale-125 transition-transform px-1 cursor-pointer"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Rich Media Rendering: Image / Audio / File */}
                            {msg.type === 'image' && msg.media_url && (
                              <div className="mb-2 overflow-hidden rounded-xl border border-white/15">
                                <img
                                  src={msg.media_url}
                                  alt="صورة مرفقة"
                                  onClick={() => setLightboxImageUrl(msg.media_url)}
                                  className="max-h-64 w-full object-cover cursor-zoom-in hover:opacity-95 transition-opacity"
                                />
                              </div>
                            )}

                            {msg.type === 'audio' && (
                              <div
                                className={`mb-1.5 flex items-center gap-3 p-2 rounded-xl ${
                                  isMine
                                    ? 'bg-white/10 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                                }`}
                              >
                                {msg.media_url && msg.media_url !== 'simulated-voice-note' ? (
                                  <audio
                                    controls
                                    src={msg.media_url}
                                    className="h-9 max-w-[210px] sm:max-w-[250px]"
                                  />
                                ) : (
                                  <div className="flex items-center gap-2.5 px-2 py-1">
                                    <div className="w-8 h-8 rounded-full bg-[#EA580C] text-white flex items-center justify-center shrink-0">
                                      <Play className="w-4 h-4 fill-current" />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {[12, 20, 14, 24, 16, 10, 22, 15, 18, 12].map((h, i) => (
                                        <span
                                          key={i}
                                          style={{ height: `${h}px` }}
                                          className="w-1 rounded-full bg-[#FB923C]"
                                        />
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {msg.type === 'file' && msg.media_url && (
                              <a
                                href={msg.media_url}
                                download={msg._fileName || 'attachment'}
                                target="_blank"
                                rel="noreferrer"
                                className={`mb-2 flex items-center justify-between gap-3 p-2.5 rounded-xl border ${
                                  isMine
                                    ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white'
                                } transition-colors`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="w-5 h-5 text-[#FB923C] shrink-0" />
                                  <span className="text-xs font-bold truncate">
                                    {msg._fileName || msg.content}
                                  </span>
                                </div>
                                <Download className="w-4 h-4 shrink-0" />
                              </a>
                            )}

                            {/* Safe Plain-Text Rendering with dir="auto" for Mixed Arabic/English */}
                            <p
                              dir="auto"
                              className="text-sm leading-relaxed whitespace-pre-wrap break-words text-start"
                            >
                              {msg.content}
                            </p>

                            {/* Timestamp + Read Receipt Ticks + Retry on Failure */}
                            <div
                              className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] select-none ${
                                isMine
                                  ? 'text-slate-200/90'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              <span>{formatTimeAr(msg.created_at)}</span>

                              {isMine && (
                                <span className="inline-flex items-center">
                                  {msg._status === 'sending' ? (
                                    <Clock
                                      className="w-3 h-3 text-slate-300"
                                      aria-label="جاري الإرسال"
                                    />
                                  ) : msg._status === 'failed' ? (
                                    <AlertCircle
                                      className="w-3.5 h-3.5 text-red-300"
                                      aria-label="فشل الإرسال"
                                    />
                                  ) : isRead ? (
                                    <CheckCheck
                                      className="w-4 h-4 text-[#FB923C] stroke-[2.5]"
                                      aria-label="تمت القراءة"
                                    />
                                  ) : (
                                    <Check
                                      className="w-3.5 h-3.5 text-slate-200"
                                      aria-label="تم الإرسال"
                                    />
                                  )}
                                </span>
                              )}
                            </div>

                            {/* Reactions Pills Display */}
                            {reactionsByMsgId[msg.id] &&
                              Object.entries(reactionsByMsgId[msg.id]).some(
                                ([, users]) => users.length > 0
                              ) && (
                                <div className="flex flex-wrap items-center gap-1 mt-1.5 pt-1 border-t border-white/10 dark:border-slate-800">
                                  {Object.entries(reactionsByMsgId[msg.id]).map(
                                    ([emoji, users]) =>
                                      users.length > 0 ? (
                                        <button
                                          key={emoji}
                                          type="button"
                                          onClick={() => toggleReaction(msg.id, emoji)}
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold transition-transform active:scale-95 cursor-pointer ${
                                            users.includes(currentUserId)
                                              ? 'bg-[#EA580C] text-white'
                                              : 'bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                                          }`}
                                        >
                                          <span>{emoji}</span>
                                          <span>{users.length}</span>
                                        </button>
                                      ) : null
                                  )}
                                </div>
                              )}

                            {/* Failed Message Retry Action */}
                            {msg._status === 'failed' && (
                              <div className="mt-2 pt-1.5 border-t border-white/20 flex items-center justify-between gap-2 text-xs">
                                <span className="text-red-200 font-semibold">
                                  مقدرتش أبعت الرسالة دي
                                </span>
                                <button
                                  onClick={() => sendMessage(msg.content, msg.id)}
                                  className="px-2.5 py-1 rounded-lg bg-white text-blue-700 font-bold hover:bg-blue-50 transition-colors cursor-pointer"
                                >
                                  إعادة المحاولة
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Floating "Scroll to Bottom" Button */}
              {showScrollBottomBtn && (
                <button
                  onClick={() => scrollToBottom('smooth')}
                  className="absolute bottom-24 end-5 z-20 w-11 h-11 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-all cursor-pointer"
                  aria-label="انزل لآخر الرسائل"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              )}

              {/* Message Composer (Respects safe-area-inset-bottom & on-screen keyboard) */}
              <footer className="p-3 sm:px-5 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="max-w-4xl mx-auto space-y-2">
                  {/* Reply Preview Banner */}
                  {replyingToMsg && (
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-s-4 border-s-[#EA580C] text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[#EA580C]">
                          رد على{' '}
                          {replyingToMsg.sender_id === currentUserId
                            ? 'نفسك'
                            : activeConversation.otherUser?.display_name || 'عضو المجتمع'}
                        </p>
                        <p className="text-slate-600 dark:text-slate-300 truncate mt-0.5">
                          {replyingToMsg.content}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyingToMsg(null)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        aria-label="إلغاء الرد"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Quick Emoji Picker Strip */}
                  {showEmojiBar && (
                    <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 px-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700">
                      {COMPOSER_EMOJIS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => {
                            setDraftText((prev) => prev + em);
                            textareaRef.current?.focus();
                          }}
                          className="text-lg hover:scale-125 transition-transform px-1.5 py-0.5 cursor-pointer"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Hidden File Input for Images & Documents */}
                  <input
                    ref={chatAttachmentInputRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.txt,.zip"
                    onChange={handleChatAttachmentChange}
                    className="hidden"
                  />

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendMessage(draftText);
                    }}
                    className="flex items-end gap-2"
                  >
                    {/* Attach Image / File Button */}
                    <button
                      type="button"
                      onClick={() => chatAttachmentInputRef.current?.click()}
                      disabled={uploadingMedia || isRecordingAudio}
                      className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                      aria-label="إرفاق صورة أو ملف"
                      title="إرفاق صورة أو ملف"
                    >
                      {uploadingMedia ? (
                        <RefreshCw className="w-5 h-5 animate-spin text-[#EA580C]" />
                      ) : (
                        <Paperclip className="w-5 h-5" />
                      )}
                    </button>

                    {/* Emoji Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setShowEmojiBar((prev) => !prev)}
                      disabled={isRecordingAudio}
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        showEmojiBar
                          ? 'bg-[#EA580C]/15 text-[#EA580C]'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                      aria-label="إضافة إيموجي"
                      title="إضافة إيموجي"
                    >
                      <Smile className="w-5 h-5" />
                    </button>

                    {/* Active Voice Recording Bar OR Textarea */}
                    {isRecordingAudio ? (
                      <div className="flex-1 min-h-[46px] px-4 py-2.5 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-bold">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                          <span>جاري تسجيل رسالة صوتية... ({recordingSeconds} ث)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => stopVoiceRecording(true)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 cursor-pointer"
                            title="إلغاء التسجيل"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => stopVoiceRecording(false)}
                            className="px-3 py-1 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            <span>إرسال</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 relative">
                        <textarea
                          ref={textareaRef}
                          dir="auto"
                          rows={1}
                          maxLength={4000}
                          placeholder="اكتب رسالتك هنا..."
                          value={draftText}
                          onChange={(e) => {
                            setDraftText(e.target.value);
                            broadcastTyping();
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`;
                          }}
                          onKeyDown={(e) => {
                            // On Desktop: Enter sends, Shift+Enter inserts newline
                            if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) {
                              e.preventDefault();
                              sendMessage(draftText);
                            }
                          }}
                          className="w-full min-h-[46px] max-h-[130px] px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none resize-none leading-relaxed transition-all"
                        />
                        {draftText.length > 3500 && (
                          <span className="absolute bottom-1.5 end-3 text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                            {draftText.length}/4000
                          </span>
                        )}
                      </div>
                    )}

                    {/* Send Text Button OR Record Voice Note Button */}
                    {draftText.trim() ? (
                      <button
                        type="submit"
                        className="w-12 h-12 rounded-2xl bg-[#0B2D48] hover:bg-[#071E31] active:scale-95 text-white shadow-md shadow-[#0B2D48]/25 flex items-center justify-center shrink-0 transition-all cursor-pointer"
                        aria-label="إرسال الرسالة"
                      >
                        <Send className="w-5 h-5 -scale-x-100 text-[#FB923C]" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          isRecordingAudio ? stopVoiceRecording(false) : startVoiceRecording()
                        }
                        className={`w-12 h-12 rounded-2xl active:scale-95 text-white shadow-md flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                          isRecordingAudio
                            ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                            : 'bg-[#0B2D48] hover:bg-[#071E31] shadow-[#0B2D48]/25'
                        }`}
                        aria-label="تسجيل رسالة صوتية"
                        title="تسجيل رسالة صوتية"
                      >
                        <Mic className="w-5 h-5 text-[#FB923C]" />
                      </button>
                    )}
                  </form>
                </div>
              </footer>
            </>
          )}
        </main>
      </div>

      {/* Image Lightbox Modal */}
      {lightboxImageUrl && (
        <div
          onClick={() => setLightboxImageUrl(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 cursor-zoom-out"
          role="dialog"
          aria-modal="true"
          aria-label="عرض الصورة بالحجم الكامل"
        >
          <button
            onClick={() => setLightboxImageUrl(null)}
            className="absolute top-5 end-5 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
            aria-label="إغلاق الصورة"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImageUrl}
            alt="معاينة كاملة"
            className="max-w-full max-h-[88dvh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}

      {/* Modals */}
      {showNewChatModal && (
        <NewChatModal
          profiles={allProfiles}
          currentUserId={currentUserId}
          loadingProfiles={loadingConversations}
          onSelectUser={handleStartDirectConversation}
          onClose={() => setShowNewChatModal(false)}
        />
      )}

      {showProfileModal && myProfile && (
        <ProfileModal
          profile={myProfile}
          isDemo={isDemoMode}
          onUpdateProfile={handleUpdateMyProfile}
          onOpenSqlDocs={() => {
            setShowProfileModal(false);
            setShowDocsModal(true);
          }}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {showDocsModal && <ProjectDocsModal onClose={() => setShowDocsModal(false)} />}
    </div>
  );
}