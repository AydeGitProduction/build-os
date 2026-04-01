-- migrations/20240115000000_create_crm_activity_log.sql
-- ⚠️  THIS MIGRATION HAS NOT BEEN APPLIED — CRM-04 depends on it.
--
-- Status: PENDING
-- Blocks:  /api/crm/contacts/[id]/activity (GET + POST)
-- Ticket:  CRM-04

-- Create activity log table
CREATE TABLE IF NOT EXISTS crm_activity_log (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id    UUID         NOT NULL
                               REFERENCES crm_contacts(id) ON DELETE CASCADE,
    activity_type VARCHAR(64)  NOT NULL
                               CHECK (activity_type IN (
                                   'note','call','email','meeting','task',
                                   'sms','demo','proposal','follow_up',
                                   'status_change','custom'
                               )),
    subject       TEXT,
    body          TEXT,
    occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by    UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata      JSONB        NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_crm_activity_log_contact_id
    ON crm_activity_log (contact_id);

CREATE INDEX IF NOT EXISTS idx_crm_activity_log_occurred_at
    ON crm_activity_log (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_activity_log_activity_type
    ON crm_activity_log (activity_type);

CREATE INDEX IF NOT EXISTS idx_crm_activity_log_created_by
    ON crm_activity_log (created_by);

-- Composite index for the most common list query
CREATE INDEX IF NOT EXISTS idx_crm_activity_log_contact_occurred
    ON crm_activity_log (contact_id, occurred_at DESC);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_crm_activity_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_activity_log_updated_at
    BEFORE UPDATE ON crm_activity_log
    FOR EACH ROW
    EXECUTE FUNCTION update_crm_activity_log_updated_at();

-- Row Level Security
ALTER TABLE crm_activity_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all activity logs
CREATE POLICY "crm_activity_log_select"
    ON crm_activity_log FOR SELECT
    TO authenticated
    USING (true);

-- Authenticated users can insert activity logs
CREATE POLICY "crm_activity_log_insert"
    ON crm_activity_log FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by);

-- Users can only update their own entries
CREATE POLICY "crm_activity_log_update"
    ON crm_activity_log FOR UPDATE
    TO authenticated
    USING (auth.uid() = created_by);

-- Users can only delete their own entries
CREATE POLICY "crm_activity_log_delete"
    ON crm_activity_log FOR DELETE
    TO authenticated
    USING (auth.uid() = created_by);

COMMENT ON TABLE crm_activity_log IS
    'Audit and activity timeline for CRM contacts. '
    'Tracks calls, emails, notes, meetings and other interactions.';