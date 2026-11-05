CREATE TABLE workspace (
  id text PRIMARY KEY CHECK (id = 'demo'),
  settings jsonb NOT NULL,
  folders jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  wallet text
);
CREATE TABLE campaigns (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1
);
CREATE TABLE payment_attempts (
  campaign_id text PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  attempt_id text NOT NULL UNIQUE,
  data jsonb,
  completed boolean NOT NULL DEFAULT false
);
