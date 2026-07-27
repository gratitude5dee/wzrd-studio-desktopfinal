/**
 * Direct WebRTC transport to the OpenAI Realtime API.
 *
 * Browser-native fallback transport for the Realtime voice runtime. The app
 * keeps this low-level path so push-to-talk and app action execution remain
 * available if a higher-level Realtime Agents SDK session is not selected.
 *
 * The browser-native approach:
 *   1. Create RTCPeerConnection with mic audio track
 *   2. POST SDP offer to OpenAI's GA /v1/realtime/calls endpoint
 *   3. Set SDP answer as remote description
 *   4. Use the "oai-events" data channel for JSON events
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

export interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

export interface RealtimeToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export interface RealtimeSessionConfig {
  type: 'realtime';
  model: string;
  output_modalities?: ('text' | 'audio')[];
  instructions: string;
  tools: RealtimeToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required' | string;
  audio?: {
    input?: {
      transcription?: Record<string, unknown> | null;
      turn_detection?: Record<string, unknown> | null;
    };
    output?: {
      voice?: string;
    };
  };
}

export interface WebRTCTransportOptions {
  apiKey: string;
  model: string;
  sessionConfig: RealtimeSessionConfig;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export class WebRTCTransport {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private listeners = new Map<string, Set<RealtimeEventHandler>>();
  private wildcardListeners = new Set<RealtimeEventHandler>();
  private _status: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private sessionConfig: RealtimeSessionConfig | null = null;
  private _dcOpenResolve: (() => void) | null = null;
  private _dcOpenPromise: Promise<void> | null = null;

  get status() {
    return this._status;
  }

  /** Register an event handler. Use '*' to receive all events. */
  on(eventType: string, handler: RealtimeEventHandler): () => void {
    if (eventType === '*') {
      this.wildcardListeners.add(handler);
      return () => this.wildcardListeners.delete(handler);
    }
    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  /** Send a JSON event through the data channel. */
  send(event: RealtimeEvent): void {
    if (!this.dc || this.dc.readyState !== 'open') {
      console.warn('[WebRTCTransport] data channel not open, dropping event:', event.type);
      return;
    }
    this.dc.send(JSON.stringify(event));
  }

  sendOutOfBandAudio(instructions: string, metadata: Record<string, unknown> = {}): void {
    this.send({
      type: 'response.create',
      response: {
        conversation: 'none',
        metadata,
        instructions,
      },
    });
  }

  /** Connect to the OpenAI Realtime API via WebRTC. */
  async connect(options: WebRTCTransportOptions): Promise<void> {
    const { apiKey, sessionConfig } = options;
    this.sessionConfig = sessionConfig;
    this._status = 'connecting';

    // 1. Create peer connection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    this.pc = pc;

    // 2. Set up remote audio playback
    this.audioElement = new Audio();
    this.audioElement.autoplay = true;
    pc.ontrack = (e) => {
      if (e.streams[0] && this.audioElement) {
        this.audioElement.srcObject = e.streams[0];
      }
    };

    // 3. Create data channel for events
    const dc = pc.createDataChannel('oai-events');
    this.dc = dc;

    // Create a promise that resolves when the data channel opens
    this._dcOpenPromise = new Promise<void>((resolve) => {
      this._dcOpenResolve = resolve;
    });

    dc.onopen = () => {
      this._status = 'connected';
      // Send session configuration once the channel is open
      if (this.sessionConfig) {
        this.send({
          type: 'session.update',
          session: getSessionUpdatePayload(this.sessionConfig),
        });
      }
      this.emit({ type: 'transport.connected' });
      // Resolve the open promise so connect() can return
      this._dcOpenResolve?.();
      this._dcOpenResolve = null;
    };

    dc.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as RealtimeEvent;
        this.emit(event);
      } catch {
        console.warn('[WebRTCTransport] failed to parse data channel message');
      }
    };

    dc.onclose = () => {
      this._status = 'disconnected';
      this.emit({ type: 'transport.disconnected' });
    };

    // 4. Add mic audio track
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStream.getAudioTracks().forEach((track) => {
      pc.addTrack(track, micStream);
    });

    // Store the mic stream so we can stop it on close
    (this as Record<string, unknown>)._micStream = micStream;

    // 5. Create and set local SDP offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 6. Send SDP offer to OpenAI and get the SDP answer.
    // The session model is bound when the ephemeral client secret is minted.
    const sdpResponse = await fetch(OPENAI_REALTIME_CALLS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    });

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text().catch(() => 'unknown error');
      this.close();
      throw new Error(`OpenAI Realtime connection failed (${sdpResponse.status}): ${errorText}`);
    }

    const answerSdp = await sdpResponse.text();

    // 7. Set remote SDP answer
    await pc.setRemoteDescription({
      type: 'answer',
      sdp: answerSdp,
    });

    // 8. Wait for the data channel to actually open before returning
    if (this._dcOpenPromise) {
      await this._dcOpenPromise;
      this._dcOpenPromise = null;
    }
  }

  /** Close the connection and release all resources. */
  close(): void {
    try {
      this.dc?.close();
    } catch { /* ignore */ }
    try {
      this.pc?.close();
    } catch { /* ignore */ }

    // Stop mic tracks
    const micStream = (this as Record<string, unknown>)._micStream as MediaStream | undefined;
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      (this as Record<string, unknown>)._micStream = null;
    }

    if (this.audioElement) {
      this.audioElement.srcObject = null;
      this.audioElement = null;
    }

    this.dc = null;
    this.pc = null;
    this._status = 'disconnected';
  }

  /** Interrupt current assistant speech. */
  interrupt(): void {
    this.send({ type: 'response.cancel' });
  }

  private emit(event: RealtimeEvent): void {
    const eventTypes = new Set([event.type, ...getRealtimeEventAliases(event.type)]);
    eventTypes.forEach((eventType) => {
      const handlers = this.listeners.get(eventType);
      if (handlers) {
        handlers.forEach((h) => h(event));
      }
    });
    this.wildcardListeners.forEach((h) => h(event));
  }
}

type RealtimeSessionUpdatePayload = Omit<RealtimeSessionConfig, 'tools'> & {
  tools: Array<Omit<RealtimeToolDefinition, 'strict'>>;
};

function getSessionUpdatePayload(config: RealtimeSessionConfig): RealtimeSessionUpdatePayload {
  return {
    ...config,
    tools: config.tools.map(({ type, name, description, parameters }) => ({
      type,
      name,
      description,
      parameters,
    })),
  };
}

function getRealtimeEventAliases(type: string): string[] {
  switch (type) {
    case 'response.output_audio.delta':
      return ['response.audio.delta'];
    case 'response.output_audio.done':
      return ['response.audio.done'];
    case 'response.output_audio_transcript.delta':
      return ['response.audio_transcript.delta'];
    case 'response.output_audio_transcript.done':
      return ['response.audio_transcript.done'];
    case 'response.audio.delta':
      return ['response.output_audio.delta'];
    case 'response.audio.done':
      return ['response.output_audio.done'];
    case 'response.audio_transcript.delta':
      return ['response.output_audio_transcript.delta'];
    case 'response.audio_transcript.done':
      return ['response.output_audio_transcript.done'];
    default:
      return [];
  }
}
