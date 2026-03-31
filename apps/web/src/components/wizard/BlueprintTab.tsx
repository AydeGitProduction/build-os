// apps/web/src/components/wizard/BlueprintTab.tsx

import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  Skeleton,
  Alert,
  Collapse,
  Button,
  Divider,
  Stack,
  Paper,
  IconButton,
  Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LayersIcon from '@mui/icons-material/Layers';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CodeIcon from '@mui/icons-material/Code';
import RefreshIcon from '@mui/icons-material/Refresh';
import { apiGet } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlueprintEpic {
  id: string;
  title: string;
  description?: string;
  order?: number;
}

interface BlueprintPhase {
  id: string;
  title: string;
  description?: string;
  order?: number;
  epics?: BlueprintEpic[];
}

interface Blueprint {
  id: string;
  projectId: string;
  title?: string;
  description?: string;
  techStack?: string[];
  phases?: BlueprintPhase[];
  epics?: BlueprintEpic[];
  createdAt?: string;
  updatedAt?: string;
  rawContent?: string;
  [key: string]: unknown;
}

interface BlueprintTabProps {
  projectId: string;
}

// ─── Helper: count epics across all phases ───────────────────────────────────

function countEpics(bp: Blueprint): number {
  // Epics may be nested per-phase or flat at root level
  if (bp.phases && bp.phases.length > 0) {
    const fromPhases = bp.phases.reduce(
      (acc, phase) => acc + (phase.epics?.length ?? 0),
      0
    );
    if (fromPhases > 0) return fromPhases;
  }
  return bp.epics?.length ?? 0;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface SectionHeaderProps {
  icon: React.ReactNode;
  label: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, label }) => (
  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
    <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>
      {icon}
    </Box>
    <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={0.8}>
      {label}
    </Typography>
  </Stack>
);

interface StatPillProps {
  value: number;
  label: string;
  icon: React.ReactNode;
}

const StatPill: React.FC<StatPillProps> = ({ value, label, icon }) => (
  <Paper
    variant="outlined"
    sx={{
      px: 2,
      py: 1.5,
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      borderRadius: 2,
      flex: 1,
      minWidth: 120,
    }}
  >
    <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
    <Box>
      <Typography variant="h6" fontWeight={700} lineHeight={1}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  </Paper>
);

// ─── Empty State ─────────────────────────────────────────────────────────────

const EmptyState: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      py: 8,
      px: 3,
      textAlign: 'center',
      gap: 2,
    }}
  >
    <Box
      sx={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        bgcolor: 'action.hover',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AutoAwesomeIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
    </Box>
    <Typography variant="h6" color="text.secondary" fontWeight={600}>
      No blueprint yet
    </Typography>
    <Typography variant="body2" color="text.disabled" maxWidth={320}>
      Chat with IRIS to generate one. Your project blueprint will appear here
      once it&apos;s ready.
    </Typography>
  </Box>
);

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

const BlueprintSkeleton: React.FC = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton variant="text" width="60%" height={36} sx={{ mb: 1 }} />
    <Skeleton variant="text" width="90%" height={20} />
    <Skeleton variant="text" width="75%" height={20} sx={{ mb: 3 }} />
    <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
      {[80, 100, 70, 90].map((w, i) => (
        <Skeleton key={i} variant="rounded" width={w} height={28} />
      ))}
    </Stack>
    <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
      <Skeleton variant="rounded" height={72} sx={{ flex: 1 }} />
      <Skeleton variant="rounded" height={72} sx={{ flex: 1 }} />
    </Stack>
    <Skeleton variant="rounded" height={40} />
  </Box>
);

// ─── Full Blueprint Expandable Content ────────────────────────────────────────

interface FullBlueprintProps {
  bp: Blueprint;
}

const FullBlueprintContent: React.FC<FullBlueprintProps> = ({ bp }) => {
  const phases = bp.phases ?? [];

  // If there's rawContent, show it as formatted JSON fallback
  if (phases.length === 0 && !bp.rawContent) {
    return (
      <Box
        component="pre"
        sx={{
          mt: 2,
          p: 2,
          bgcolor: 'action.hover',
          borderRadius: 2,
          fontSize: '0.7rem',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: 'text.secondary',
          fontFamily: 'monospace',
        }}
      >
        {JSON.stringify(bp, null, 2)}
      </Box>
    );
  }

  if (bp.rawContent && phases.length === 0) {
    return (
      <Box
        component="pre"
        sx={{
          mt: 2,
          p: 2,
          bgcolor: 'action.hover',
          borderRadius: 2,
          fontSize: '0.75rem',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: 'text.secondary',
          fontFamily: 'monospace',
        }}
      >
        {bp.rawContent}
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      {phases.map((phase, phaseIdx) => (
        <Box key={phase.id ?? phaseIdx} sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Chip
              label={`Phase ${phase.order ?? phaseIdx + 1}`}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 700, fontSize: '0.7rem' }}
            />
            <Typography variant="subtitle2" fontWeight={700}>
              {phase.title}
            </Typography>
          </Stack>
          {phase.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, pl: 1 }}>
              {phase.description}
            </Typography>
          )}
          {phase.epics && phase.epics.length > 0 && (
            <Box sx={{ pl: 2 }}>
              {phase.epics.map((epic, epicIdx) => (
                <Box
                  key={epic.id ?? epicIdx}
                  sx={{
                    py: 0.75,
                    px: 1.5,
                    mb: 0.5,
                    borderLeft: '2px solid',
                    borderColor: 'primary.light',
                    borderRadius: '0 4px 4px 0',
                    bgcolor: 'action.hover',
                  }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {epic.title}
                  </Typography>
                  {epic.description && (
                    <Typography variant="caption" color="text.secondary">
                      {epic.description}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
          {phaseIdx < phases.length - 1 && <Divider sx={{ mt: 2 }} />}
        </Box>
      ))}
    </Box>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const BlueprintTab: React.FC<BlueprintTabProps> = ({ projectId }) => {
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchBlueprint = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      // ─── CRITICAL: P9C-DEBUG envelope unwrap ───────────────────────
      // The API returns: { data: Blueprint | null }
      // apiGet<T> itself unwraps one layer, giving us { data: Blueprint | null }
      // So we must access .data again to reach the Blueprint object.
      const r = await apiGet<{ data: Blueprint | null }>(
        `/api/projects/${projectId}/blueprint`
      );
      const bp = r.data?.data ?? null; // CRITICAL: double-unwrap the envelope
      // ──────────────────────────────────────────────────────────────

      setBlueprint(bp);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load blueprint';
      setError(message);
      setBlueprint(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchBlueprint();
  }, [fetchBlueprint]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return <BlueprintSkeleton />;
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert
          severity="error"
          action={
            <Button size="small" onClick={fetchBlueprint} startIcon={<RefreshIcon />}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      </Box>
    );
  }

  // ── Empty State ────────────────────────────────────────────────────────────
  if (!blueprint) {
    return <EmptyState />;
  }

  // ── Computed values ────────────────────────────────────────────────────────
  const phaseCount = blueprint.phases?.length ?? 0;
  const epicCount = countEpics(blueprint);
  const techStack = blueprint.techStack ?? [];
  const title = blueprint.title ?? 'Untitled Blueprint';
  const description = blueprint.description ?? '';

  // ── Blueprint Render ───────────────────────────────────────────────────────
  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1, pr: 1 }}>
          {title}
        </Typography>
        <Tooltip title="Refresh blueprint">
          <IconButton size="small" onClick={fetchBlueprint} aria-label="refresh blueprint">
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.6 }}>
          {description}
        </Typography>
      )}

      {/* Tech Stack Chips */}
      {techStack.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <SectionHeader icon={<CodeIcon fontSize="small" />} label="Tech Stack" />
          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            {techStack.map((tech) => (
              <Chip
                key={tech}
                label={tech}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  borderColor: 'primary.light',
                  color: 'primary.main',
                }}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Stats */}
      {(phaseCount > 0 || epicCount > 0) && (
        <Box sx={{ mb: 3 }}>
          <SectionHeader icon={<AccountTreeIcon fontSize="small" />} label="Structure" />
          <Stack direction="row" spacing={2}>
            {phaseCount > 0 && (
              <StatPill
                value={phaseCount}
                label={phaseCount === 1 ? 'Phase' : 'Phases'}
                icon={<LayersIcon fontSize="small" />}
              />
            )}
            {epicCount > 0 && (
              <StatPill
                value={epicCount}
                label={epicCount === 1 ? 'Epic' : 'Epics'}
                icon={<AccountTreeIcon fontSize="small" />}
              />
            )}
          </Stack>
        </Box>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Expandable Full Blueprint */}
      <Box>
        <Button
          fullWidth
          variant="outlined"
          size="small"
          onClick={() => setExpanded((prev) => !prev)}
          endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          aria-expanded={expanded}
          aria-controls="blueprint-full-content"
          sx={{
            justifyContent: 'space-between',
            textTransform: 'none',
            fontWeight: 600,
            borderColor: 'divider',
            color: 'text.primary',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
          }}
        >
          {expanded ? 'Collapse blueprint' : 'View full blueprint'}
        </Button>

        <Collapse in={expanded} id="blueprint-full-content" timeout="auto" unmountOnExit={false}>
          <FullBlueprintContent bp={blueprint} />
        </Collapse>
      </Box>
    </Box>
  );
};

export default BlueprintTab;