CREATE TABLE disaster_events (
  id text PRIMARY KEY,
  source text NOT NULL,
  event_id text NOT NULL,
  event jsonb NOT NULL,
  event_updated_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('ignored','queued','processing','failed','cancelled','ready')),
  progress text NOT NULL DEFAULT '',
  error text,
  distance_miles double precision,
  snapshot jsonb,
  campaign_id text UNIQUE REFERENCES campaigns(id),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claim_token text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source,event_id)
);
CREATE INDEX disaster_jobs_pending ON disaster_events(status,next_attempt_at);
