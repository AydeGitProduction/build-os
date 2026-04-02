# orchestrator/api.py

"""
FastAPI application exposing the orchestrator over HTTP.

State-machine violations are returned as 400 Bad Request with a structured
body that includes the STATE_VIOLATION event detail.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from orchestrator.exceptions import StateTransitionError
from orchestrator.task_orchestrator import TaskOrchestrator

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Task Orchestrator API",
    version="1.0.0",
    description="Orchestrates tasks across agents with strict state-machine enforcement.",
)

_orchestrator = TaskOrchestrator()


# ---------------------------------------------------------------------------
# Exception handler — converts StateTransitionError → HTTP 400
# ---------------------------------------------------------------------------

@app.exception_handler(StateTransitionError)
async def state_transition_error_handler(
    request: Request,
    exc: StateTransitionError,
) -> JSONResponse:
    """
    Global handler for state machine violations.

    Returns HTTP 400 with a JSON body containing:
      - error: "STATE_VIOLATION"
      - detail: human-readable message
      - violation: full structured violation record (for agent consumption)
    """
    logger.warning(
        "HTTP_400_STATE_VIOLATION | path=%s method=%s | %s",
        request.url.path,
        request.method,
        exc.message if hasattr(exc, "message") else str(exc),
    )
    return JSONResponse(
        status_code=400,
        content={
            "error": "STATE_VIOLATION",
            "detail": str(exc),
            "violation": exc.violation_detail,
        },
    )


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class CreateTaskRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Human-readable task name")
    agent_id: Optional[str] = Field(None, description="Agent responsible for the task")
    max_retries: int = Field(3, ge=0, description="Maximum retry attempts")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class UpdateTaskStatusRequest(BaseModel):
    status: str = Field(..., description="Target status")
    agent_id: Optional[str] = Field(None, description="Agent requesting the update")
    retry_reset: Optional[bool] = Field(
        None,
        description="Set to true when retrying a failed task (failed→pending)",
    )
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def to_payload(self) -> dict:
        """Flatten into a raw payload dict for the guard."""
        payload = dict(self.metadata)
        if self.retry_reset is not None:
            payload["retry_reset"] = self.retry_reset
        return payload


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/tasks", status_code=201, summary="Create a new task")
async def create_task(body: CreateTaskRequest) -> dict:
    task = _orchestrator.create_task(
        name=body.name,
        agent_id=body.agent_id,
        max_retries=body.max_retries,
        metadata=body.metadata,
    )
    return task.to_dict()


@app.get("/tasks", summary="List all tasks")
async def list_tasks() -> list:
    return _orchestrator.list_tasks()


@app.get("/tasks/{task_id}", summary="Get a specific task")
async def get_task(task_id: str) -> dict:
    task = _orchestrator.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    return task.to_dict()


@app.patch("/tasks/{task_id}/status", summary="Update task status")
async def update_task_status(task_id: str, body: UpdateTaskStatusRequest) -> dict:
    """
    Update the status of a task.

    Enforces the state machine — invalid transitions return HTTP 400
    with error='STATE_VIOLATION'.

    **Retry flow** (failed → pending):
    Send `retry_reset: true` in the request body. The orchestrator will
    increment the retry counter and reset the task to pending.
    """
    try:
        task = _orchestrator.update_task_status(
            task_id=task_id,
            new_status=body.status,
            agent_id=body.agent_id,
            update_payload=body.to_payload(),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    # StateTransitionError is caught by the global handler above

    return task.to_dict()


@app.get("/tasks/{task_id}/allowed-transitions", summary="Query valid next states")
async def allowed_transitions(task_id: str) -> dict:
    """Return the set of valid next statuses for a task."""
    from orchestrator.state_machine import StateMachineGuard

    task = _orchestrator.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")

    nexts = StateMachineGuard.allowed_transitions(task.status)
    return {
        "task_id": task_id,
        "current_status": task.status.value,
        "allowed_transitions": sorted(s.value for s in nexts),
    }