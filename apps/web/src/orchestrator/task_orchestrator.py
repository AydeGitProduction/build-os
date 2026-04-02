# orchestrator/task_orchestrator.py

"""
Core Task Orchestrator.

Responsibilities:
  - Maintain task registry
  - Validate all status updates through the StateMachineGuard
  - Dispatch work to agents
  - Emit structured logs
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from orchestrator.exceptions import StateTransitionError
from orchestrator.state_machine import StateMachineGuard, TaskStatus, TransitionResult

logger = logging.getLogger(__name__)

_guard = StateMachineGuard()


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Task:
    task_id: str
    name: str
    status: TaskStatus = TaskStatus.PENDING
    agent_id: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = field(default_factory=dict)
    history: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "name": self.name,
            "status": self.status.value,
            "agent_id": self.agent_id,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "metadata": self.metadata,
            "history": self.history,
        }


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

class TaskOrchestrator:
    """
    Manages lifecycle of tasks and enforces the state machine.
    """

    def __init__(self) -> None:
        self._tasks: Dict[str, Task] = {}

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def create_task(
        self,
        name: str,
        agent_id: Optional[str] = None,
        max_retries: int = 3,
        metadata: Optional[dict] = None,
    ) -> Task:
        task_id = str(uuid.uuid4())
        task = Task(
            task_id=task_id,
            name=name,
            agent_id=agent_id,
            max_retries=max_retries,
            metadata=metadata or {},
        )
        self._tasks[task_id] = task
        logger.info(
            "TASK_CREATED | task_id=%s name=%s agent_id=%s",
            task_id, name, agent_id,
        )
        return task

    def get_task(self, task_id: str) -> Optional[Task]:
        return self._tasks.get(task_id)

    def update_task_status(
        self,
        task_id: str,
        new_status: str,
        agent_id: Optional[str] = None,
        update_payload: Optional[dict] = None,
    ) -> Task:
        """
        Update a task's status, enforcing the state machine.

        Args:
            task_id:        ID of the task to update.
            new_status:     Requested new status string.
            agent_id:       ID of the agent requesting the update.
            update_payload: Full payload from the agent (may include flags
                            such as retry_reset=True).

        Returns:
            The updated Task.

        Raises:
            KeyError:              Task not found.
            StateTransitionError:  Transition violates the state machine.
        """
        update_payload = update_payload or {}

        task = self._tasks.get(task_id)
        if task is None:
            logger.error("TASK_NOT_FOUND | task_id=%s agent_id=%s", task_id, agent_id)
            raise KeyError(f"Task '{task_id}' not found.")

        result: TransitionResult = _guard.validate_transition(
            task_id=task_id,
            from_status=task.status,
            to_status=new_status,
            update_payload=update_payload,
            agent_id=agent_id,
        )

        if not result.allowed:
            raise StateTransitionError(result)

        # Apply the transition
        old_status = task.status
        task.status = result.to_status
        task.updated_at = datetime.now(timezone.utc)

        # Handle retry reset side-effects
        if (
            update_payload.get("retry_reset") is True
            and result.to_status == TaskStatus.PENDING
        ):
            task.retry_count += 1
            logger.info(
                "RETRY_RESET | task_id=%s retry_count=%d max_retries=%d",
                task_id, task.retry_count, task.max_retries,
            )

        # Record history
        task.history.append({
            "from_status": old_status.value,
            "to_status": task.status.value,
            "agent_id": agent_id,
            "timestamp": task.updated_at.isoformat(),
            "payload_keys": list(update_payload.keys()),
        })

        logger.info(
            "TASK_STATUS_UPDATED | task_id=%s %s → %s agent_id=%s",
            task_id, old_status, task.status, agent_id,
        )
        return task

    def list_tasks(self) -> List[dict]:
        return [t.to_dict() for t in self._tasks.values()]