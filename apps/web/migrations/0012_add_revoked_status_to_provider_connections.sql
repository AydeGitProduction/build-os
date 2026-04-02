-- migrations/0012_add_revoked_status_to_provider_connections.sql

-- Ensure 'revoked' is a valid status value
-- (If using an enum, add it; if using varchar with CHECK constraint, update it)

-- For PostgreSQL with CHECK constraint:
ALTER TABLE provider_connections 
  DROP CONSTRAINT IF EXISTS provider_connections_status_check;

ALTER TABLE provider_connections 
  ADD CONSTRAINT provider_connections_status_check 
  CHECK (status IN ('active', 'inactive', 'pending', 'revoked', 'error'));

-- Add index for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_project_integrations_provider_connection_id 
  ON project_integrations(provider_connection_id);

CREATE INDEX IF NOT EXISTS idx_project_integrations_workspace_provider 
  ON project_integrations(workspace_id, provider);