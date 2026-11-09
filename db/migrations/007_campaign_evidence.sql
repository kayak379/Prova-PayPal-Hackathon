ALTER TABLE campaigns ADD COLUMN evidence_sequence integer NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN evidence_hash text;

CREATE TABLE campaign_evidence (
  campaign_id text NOT NULL REFERENCES campaigns(id),
  sequence integer NOT NULL CHECK (sequence > 0),
  event_id text NOT NULL,
  hash text NOT NULL CHECK (length(hash) = 64),
  event jsonb NOT NULL,
  checkpoint jsonb,
  PRIMARY KEY (campaign_id, sequence),
  UNIQUE (campaign_id, event_id)
);

CREATE FUNCTION prevent_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Campaign evidence is append-only';
END;
$$;
CREATE TRIGGER campaign_evidence_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON campaign_evidence
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_evidence_mutation();
