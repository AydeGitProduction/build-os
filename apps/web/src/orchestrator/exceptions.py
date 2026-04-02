# orchestrator/exceptions.py

"""Orchestrator-specific exceptions."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from orchestrator.state_machine import TransitionResult


class StateTransitionError(Exception):
    """
    Raised when a requested task status transition violates the state machine.

    Carries the full TransitionResult so HTTP layers can build a 400 response
    without re-computing anything.
    """

    def __init__(self, result: "TransitionResult") -> None:
        self.result = result
        super().__init__(result.message)

    @property
    def violation_detail(self) -> dict:
        return self.result.violation_detail or {}

    @property
    def http_status(self) -> int:
        return 400