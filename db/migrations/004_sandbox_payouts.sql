ALTER TABLE payment_attempts ADD COLUMN payout_plan jsonb;

CREATE TABLE sandbox_payout_batches (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  order_id text NOT NULL UNIQUE,
  first_submitted_at bigint,
  data jsonb NOT NULL
);
CREATE INDEX sandbox_payout_batches_campaign ON sandbox_payout_batches(campaign_id);
