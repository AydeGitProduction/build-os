# orchestrator/logging_config.py

"""
Structured logging configuration for the orchestrator.

STATE_VIOLATION events are written at WARNING level and include a
violation_id so they can be correlated across systems.
"""

import logging
import logging.config
import sys

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "structured": {
            "format": (
                "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
            ),
            "datefmt": "%Y-%m-%dT%H:%M:%S%z",
        },
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "formatter": "structured",
        },
        "violation_file": {
            # Dedicated file for state violations — easy to tail / alert on
            "class": "logging.handlers.RotatingFileHandler",
            "filename": "logs/state_violations.log",
            "maxBytes": 10_485_760,  # 10 MB
            "backupCount": 5,
            "formatter": "structured",
            "level": "WARNING",
        },
    },
    "loggers": {
        "orchestrator": {
            "handlers": ["console", "violation_file"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}


def configure_logging() -> None:
    import os
    os.makedirs("logs", exist_ok=True)
    logging.config.dictConfig(LOGGING_CONFIG)