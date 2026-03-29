-- ============================================================
-- BUILD OS — Migration 017: Project Files Virtual Filesystem
-- ERT-P3 B1-BE Schema Closure
-- ============================================================
-- Stores the virtual filesystem for each project.
-- Agents write to this table via PatchEngine; Git service
-- reads from here to stage commits to GitHub.

-- ─── project_files ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_files (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id          uuid        NOT NULL,
  file_path           text        NOT NULL,
  content             text        NOT NULL DEFAULT '',
  content_hash        text        NOT NULL DEFAULT '',
  previous_content    text,
  encoding            text        NOT NULL DEFAULT 'utf-8',
  language            text,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by_task     uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  patch_version       integer     NOT NULL DEFAULT 0,

  CONSTRAINT pf_pkey        PRIMARY KEY (id),
  CONSTRAINT pf_project_fk  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT pf_task_fk     FOREIGN KEY (updated_by_task) REFERENCES tasks(id) ON DELETE SET NULL,
  -- Unique file path per project
  CONSTRAINT pf_unique_path UNIQUE (project_id, file_path),
  -- file_path must be relative, no traversal
  CONSTRAINT pf_path_valid  CHECK (
    file_path NOT LIKE '%..%'
    AND file_path NOT LIKE '/%'
    AND length(file_path) > 0
    AND length(file_path) <= 500
  ),
  CONSTRAINT pf_hash_len    CHECK (length(content_hash) = 0 OR length(content_hash) = 64),
  CONSTRAINT pf_version_pos CHECK (patch_version >= 0)
);

-- ─── Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pf_project_id      ON project_files (project_id);
CREATE INDEX IF NOT EXISTS idx_pf_project_path    ON project_files (project_id, file_path);
CREATE INDEX IF NOT EXISTS idx_pf_updated_by_task ON project_files (updated_by_task) WHERE updated_by_task IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pf_language        ON project_files (project_id, language) WHERE language IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

-- Users can read/write files in their own projects (via workspace membership)
CREATE POLICY "pf_select" ON project_files
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())
  );

CREATE POLICY "pf_insert" ON project_files
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())
  );

CREATE POLICY "pf_update" ON project_files
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())
  );

CREATE POLICY "pf_delete" ON project_files
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())
  );

-- Service role bypass (for PatchEngine API calls)
CREATE POLICY "project_files_service_role" ON project_files
  FOR ALL USING (auth.role() = 'service_role');
