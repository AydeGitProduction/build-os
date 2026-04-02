# orchestrator/state_machine.py

"""
Task State Machine for the Orchestrator.

Valid States:
    - pending     : Task created, not yet started
    - in_progress : Task actively being worked on
    - completed   : Task finished successfully
    - failed      : Task finished with an error
    - cancelled   : Task explicitly cancelled
    - paused      : Task temporarily halted (awaiting resource/dependency)

Valid Transitions:
    pending      → in_progress, cancelled
    in_progress  → completed, failed, paused, cancelled
    paused       → in_progress, cancelled, failed
    failed       → pending (only with retry_reset=True), cancelled
    completed    → (terminal — no transitions allowed)
    cancelled    → (terminal — no transitions allowed)
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, FrozenSet, Optional, Set

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# State Enum
# ---------------------------------------------------------------------------

class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"

    def __str__(self) -> str:
        return self.value


# ---------------------------------------------------------------------------
# Transition Rules
# ---------------------------------------------------------------------------

# Map: from_state → set of allowed to_states (standard transitions)
_ALLOWED_TRANSITIONS: Dict[TaskStatus, FrozenSet[TaskStatus]] = {
    TaskStatus.PENDING: frozenset({
        TaskStatus.IN_PROGRESS,
        TaskStatus.CANCELLED,
    }),
    TaskStatus.IN_PROGRESS: frozenset({
        TaskStatus.COMPLETED,
        TaskStatus.FAILED,
        TaskStatus.PAUSED,
        TaskStatus.CANCELLED,
    }),
    TaskStatus.PAUSED: frozenset({
        TaskStatus.IN_PROGRESS,
        TaskStatus.CANCELLED,
        TaskStatus.FAILED,
    }),
    # failed → pending is a *conditional* transition; handled separately
    TaskStatus.FAILED: frozenset({
        TaskStatus.CANCELLED,
    }),
    # Terminal states — no outgoing edges
    TaskStatus.COMPLETED: frozenset(),
    TaskStatus.CANCELLED: frozenset(),
}

# Conditional transitions require extra metadata keys to be present & valid
_CONDITIONAL_TRANSITIONS: Dict[
    tuple[TaskStatus, TaskStatus], dict
] = {
    # failed → pending requires retry_reset=True in the update payload
    (TaskStatus.FAILED, TaskStatus.PENDING): {
        "required_flags": {"retry_reset": True},
        "description": "Retry reset must be explicitly acknowledged (retry_reset=True)",
    },
}

# States from which NO further transitions are possible
TERMINAL_STATES: FrozenSet[TaskStatus] = frozenset({
    TaskStatus.COMPLETED,
    TaskStatus.CANCELLED,
})


# ---------------------------------------------------------------------------
# Violation / Result types
# ---------------------------------------------------------------------------

class ViolationReason(str, Enum):
    TERMINAL_STATE = "TERMINAL_STATE"
    INVALID_TRANSITION = "INVALID_TRANSITION"
    MISSING_CONDITION = "MISSING_CONDITION"
    UNKNOWN_STATUS = "UNKNOWN_STATUS"
    SAME_STATE = "SAME_STATE"


@dataclass
class TransitionResult:
    allowed: bool
    from_status: TaskStatus
    to_status: TaskStatus
    reason: Optional[ViolationReason] = None
    message: str = ""
    # Populated on violation so callers can log it immediately
    violation_detail: Optional[dict] = None


# ---------------------------------------------------------------------------
# Core Guard
# ---------------------------------------------------------------------------

class StateMachineGuard:
    """
    Validates task status transitions against the orchestrator state machine.

    Usage::

        guard = StateMachineGuard()
        result = guard.validate_transition(
            task_id="abc-123",
            from_status="failed",
            to_status="in_progress",
            update_payload={},
            agent_id="agent-7",
        )
        if not result.allowed:
            # result.violation_detail contains the STATE_VIOLATION log record
            raise StateTransitionError(result)
    """

    def validate_transition(
        self,
        task_id: str,
        from_status: str | TaskStatus,
        to_status: str | TaskStatus,
        update_payload: Optional[dict] = None,
        agent_id: Optional[str] = None,
    ) -> TransitionResult:
        """
        Validate a requested status transition.

        Args:
            task_id:        Identifier of the task being updated.
            from_status:    Current status of the task.
            to_status:      Requested new status.
            update_payload: Full update body sent by the agent (may contain
                            conditional flags such as retry_reset).
            agent_id:       Identifier of the requesting agent (for logs).

        Returns:
            TransitionResult with allowed=True or allowed=False + violation info.
        """
        update_payload = update_payload or {}

        # --- Parse enums --------------------------------------------------
        try:
            from_enum = TaskStatus(from_status)
        except ValueError:
            return self._violation(
                task_id=task_id,
                from_status=str(from_status),
                to_status=str(to_status),
                reason=ViolationReason.UNKNOWN_STATUS,
                message=f"Unknown from_status '{from_status}'",
                agent_id=agent_id,
            )

        try:
            to_enum = TaskStatus(to_status)
        except ValueError:
            return self._violation(
                task_id=task_id,
                from_status=str(from_status),
                to_status=str(to_status),
                reason=ViolationReason.UNKNOWN_STATUS,
                message=f"Unknown to_status '{to_status}'",
                agent_id=agent_id,
            )

        # --- No-op transition (same → same) --------------------------------
        if from_enum == to_enum:
            return self._violation(
                task_id=task_id,
                from_status=from_enum,
                to_status=to_enum,
                reason=ViolationReason.SAME_STATE,
                message=(
                    f"Task '{task_id}' is already in state '{from_enum}'. "
                    "No-op transitions are not allowed."
                ),
                agent_id=agent_id,
            )

        # --- Terminal state guard ------------------------------------------
        if from_enum in TERMINAL_STATES:
            return self._violation(
                task_id=task_id,
                from_status=from_enum,
                to_status=to_enum,
                reason=ViolationReason.TERMINAL_STATE,
                message=(
                    f"Task '{task_id}' is in terminal state '{from_enum}' "
                    f"and cannot transition to '{to_enum}'."
                ),
                agent_id=agent_id,
            )

        # --- Check standard allowed set ------------------------------------
        allowed_next = _ALLOWED_TRANSITIONS.get(from_enum, frozenset())

        if to_enum in allowed_next:
            # Straightforward allowed transition
            logger.info(
                "STATE_TRANSITION | task_id=%s agent_id=%s %s → %s [ALLOWED]",
                task_id, agent_id, from_enum, to_enum,
            )
            return TransitionResult(
                allowed=True,
                from_status=from_enum,
                to_status=to_enum,
                message=f"Transition {from_enum} → {to_enum} is valid.",
            )

        # --- Check conditional transitions ---------------------------------
        condition_key = (from_enum, to_enum)
        if condition_key in _CONDITIONAL_TRANSITIONS:
            condition = _CONDITIONAL_TRANSITIONS[condition_key]
            required_flags: dict = condition.get("required_flags", {})

            # Verify every required flag is present with the correct value
            missing_or_wrong = {
                k: v
                for k, v in required_flags.items()
                if update_payload.get(k) != v
            }

            if not missing_or_wrong:
                logger.info(
                    "STATE_TRANSITION | task_id=%s agent_id=%s %s → %s "
                    "[CONDITIONAL ALLOWED] flags=%s",
                    task_id, agent_id, from_enum, to_enum, required_flags,
                )
                return TransitionResult(
                    allowed=True,
                    from_status=from_enum,
                    to_status=to_enum,
                    message=(
                        f"Conditional transition {from_enum} → {to_enum} "
                        "is valid (required flags satisfied)."
                    ),
                )
            else:
                return self._violation(
                    task_id=task_id,
                    from_status=from_enum,
                    to_status=to_enum,
                    reason=ViolationReason.MISSING_CONDITION,
                    message=(
                        f"Transition {from_enum} → {to_enum} requires "
                        f"{condition['description']}. "
                        f"Unsatisfied flags: {missing_or_wrong}"
                    ),
                    agent_id=agent_id,
                )

        # --- Flat-out invalid transition ------------------------------------
        return self._violation(
            task_id=task_id,
            from_status=from_enum,
            to_status=to_enum,
            reason=ViolationReason.INVALID_TRANSITION,
            message=(
                f"Transition '{from_enum}' → '{to_enum}' is not defined "
                f"in the state machine. "
                f"Valid transitions from '{from_enum}': "
                f"{sorted(s.value for s in allowed_next) or 'none (terminal)'}"
            ),
            agent_id=agent_id,
        )

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _violation(
        self,
        task_id: str,
        from_status: str | TaskStatus,
        to_status: str | TaskStatus,
        reason: ViolationReason,
        message: str,
        agent_id: Optional[str],
    ) -> TransitionResult:
        violation_id = str(uuid.uuid4())
        violation_detail = {
            "event": "STATE_VIOLATION",
            "violation_id": violation_id,
            "task_id": task_id,
            "agent_id": agent_id,
            "from_status": str(from_status),
            "to_status": str(to_status),
            "reason": reason.value,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        logger.warning(
            "STATE_VIOLATION | violation_id=%s task_id=%s agent_id=%s "
            "%s → %s reason=%s | %s",
            violation_id,
            task_id,
            agent_id,
            from_status,
            to_status,
            reason.value,
            message,
        )

        return TransitionResult(
            allowed=False,
            from_status=TaskStatus(from_status) if isinstance(from_status, str)
                        and from_status in TaskStatus._value2member_map_
                        else from_status,  # type: ignore[arg-type]
            to_status=TaskStatus(to_status) if isinstance(to_status, str)
                      and to_status in TaskStatus._value2member_map_
                      else to_status,  # type: ignore[arg-type]
            reason=reason,
            message=message,
            violation_detail=violation_detail,
        )

    # -----------------------------------------------------------------------
    # Utility: allowed transitions query (for documentation / UI)
    # -----------------------------------------------------------------------

    @staticmethod
    def allowed_transitions(from_status: str | TaskStatus) -> Set[TaskStatus]:
        """Return all states reachable from `from_status` (including conditional)."""
        try:
            from_enum = TaskStatus(from_status)
        except ValueError:
            return set()

        standard = set(_ALLOWED_TRANSITIONS.get(from_enum, frozenset()))
        conditional = {
            to_state
            for (f, to_state) in _CONDITIONAL_TRANSITIONS
            if f == from_enum
        }
        return standard | conditional