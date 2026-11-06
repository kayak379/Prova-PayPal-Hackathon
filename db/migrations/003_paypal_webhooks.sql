-- Only signature-verified deliveries enter this durable inbox. Completion and
-- financial changes commit together; failed deliveries remain retryable.
CREATE TABLE paypal_webhook_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX paypal_webhook_events_pending
  ON paypal_webhook_events(received_at) WHERE processed_at IS NULL;
