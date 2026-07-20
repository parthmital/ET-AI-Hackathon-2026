from __future__ import annotations

from app.db.database import Database


class AnalysisRunRepository:
    start = staticmethod(Database.start_analysis_run)
    finish = staticmethod(Database.finish_analysis_run)
    latest_status = staticmethod(Database.latest_analysis_status)
    agent_stages = staticmethod(Database.analysis_agent_stages)
    replace_generated = staticmethod(Database.replace_generated_analysis)
    clear_generated = staticmethod(Database.clear_generated_analysis)


analysis_runs = AnalysisRunRepository()
