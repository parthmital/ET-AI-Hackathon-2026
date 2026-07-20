# Benchmark Scorecard

Generated: 2026-07-19T20:26:54.572369+00:00

## Method

- Parses the real `sample_data/` files with the backend parser stack.
- Builds a deterministic lexical retrieval baseline over parsed chunks.
- Validates industrial QA, retrieval ranking, grounded claims, no-answer controls, entities, numeric logic, compliance, contradictions, RCA, graph evidence, graph validation, and parser contracts.
- Does not call an LLM, seed the backend, or mutate the database in the default mode.
- OCR is disabled by default for deterministic runtime; set `BENCHMARK_ENABLE_OCR=true` to include OCR.

## Summary

- Score: 71/71 (100.0%)
- Failed: 0
- Categories: 12
- Source documents: 17 across 5 formats
- Runtime: 309.81 ms
- Parse runtime: 250.57 ms

## Quality Metrics

| Metric                      |   Value |
| --------------------------- | ------: |
| Citation hit rate           |  100.0% |
| Answer snippet hit rate     |  100.0% |
| Retrieval context precision |   90.7% |
| Retrieval context recall    |  100.0% |
| Retrieval MRR               |     1.0 |
| Retrieval nDCG@k            |  0.9572 |
| Grounded answer claim F1    |  100.0% |
| Grounding citation coverage |  100.0% |
| Faithfulness proxy          |   83.3% |
| Abstention accuracy         |  100.0% |
| Entity extraction precision |  100.0% |
| Entity extraction recall    |  100.0% |
| Numeric reasoning accuracy  |  100.0% |
| Compliance-gap accuracy     |  100.0% |
| Contradiction-pair accuracy |  100.0% |
| RCA evidence accuracy       |  100.0% |
| Graph-link completeness     |  100.0% |
| Graph validation accuracy   |  100.0% |
| Parser contract coverage    |  100.0% |
| Source document coverage    |  100.0% |
| Source format coverage      |  100.0% |
| P95 check latency           | 4.56 ms |

## Quality Gates

| Gate                                  |   Expected |    Actual | Status |
| ------------------------------------- | ---------: | --------: | ------ |
| `minimum_score`                       |     100.0% |    100.0% | pass   |
| `minimum_citation_hit_rate`           |     100.0% |    100.0% | pass   |
| `minimum_answer_snippet_hit_rate`     |     100.0% |    100.0% | pass   |
| `minimum_retrieval_context_precision` |      45.0% |     90.7% | pass   |
| `minimum_retrieval_context_recall`    |      75.0% |    100.0% | pass   |
| `minimum_retrieval_mrr`               |      45.0% |    100.0% | pass   |
| `minimum_retrieval_ndcg_at_k`         |      70.0% |     95.7% | pass   |
| `minimum_grounded_answer_claim_f1`    |     100.0% |    100.0% | pass   |
| `minimum_grounding_citation_coverage` |     100.0% |    100.0% | pass   |
| `minimum_abstention_accuracy`         |     100.0% |    100.0% | pass   |
| `minimum_entity_precision`            |     100.0% |    100.0% | pass   |
| `minimum_entity_recall`               |     100.0% |    100.0% | pass   |
| `minimum_numeric_reasoning_accuracy`  |     100.0% |    100.0% | pass   |
| `minimum_compliance_gap_accuracy`     |     100.0% |    100.0% | pass   |
| `minimum_contradiction_pair_accuracy` |     100.0% |    100.0% | pass   |
| `minimum_rca_evidence_accuracy`       |     100.0% |    100.0% | pass   |
| `minimum_graph_link_completeness`     |     100.0% |    100.0% | pass   |
| `minimum_graph_validation_accuracy`   |     100.0% |    100.0% | pass   |
| `minimum_parser_contract_coverage`    |     100.0% |    100.0% | pass   |
| `minimum_source_document_coverage`    |     100.0% |    100.0% | pass   |
| `minimum_source_format_coverage`      |     100.0% |    100.0% | pass   |
| `minimum_source_document_count`       |         17 |        17 | pass   |
| `minimum_source_format_count`         |          5 |         5 | pass   |
| `minimum_category_count`              |         12 |        12 | pass   |
| `minimum_check_count`                 |         65 |        71 | pass   |
| `maximum_total_latency_ms`            | 10000.0 ms | 309.81 ms | pass   |
| `maximum_parse_latency_ms`            |  7000.0 ms | 250.57 ms | pass   |
| `maximum_p95_check_latency_ms`        |    25.0 ms |   4.56 ms | pass   |

## Category Results

### Abstention

- Passed: 3/3

| Check                             | Type        | Status | Detail                                                              | Evidence                                                                                                          |
| --------------------------------- | ----------- | ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `abstain-unknown-asset-p999`      | `no_answer` | pass   | unsupported_terms_absent=True; top_score=5.4473; max_top_score=20.0 | Heat Exchanger HX-22 Inspection Report.txt p1 (missing 1)<br>Work Order History.xlsx p1 (missing 1)<br>+1 more    |
| `abstain-unknown-pressure-vessel` | `no_answer` | pass   | unsupported_terms_absent=True; top_score=8.9467; max_top_score=20.0 | Boiler B-12 Safety SOP.txt p1 (missing 1)<br>Factory Safety Compliance Checklist.txt p1 (missing 1)<br>+1 more    |
| `abstain-future-p101-event`       | `no_answer` | pass   | unsupported_terms_absent=True; top_score=4.7815; max_top_score=25.0 | Incident Report Pump P-101 Seal Failure.txt p1 (missing 1)<br>Pump P-101 OEM Manual.txt p1 (missing 1)<br>+1 more |

### Compliance

- Passed: 5/5

| Check                                      | Type             | Status | Detail                                                                  | Evidence                                                                              |
| ------------------------------------------ | ---------------- | ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `compliance-c204-overdue-inspection`       | `compliance_gap` | pass   | asset=C-204; gap=Overdue Inspection; evidence_hits=1/1                  | Factory Safety Compliance Checklist.txt p1 (matched)                                  |
| `compliance-c204-frequency`                | `compliance_gap` | pass   | asset=C-204; gap=Inspection Frequency; evidence_hits=1/1                | Compressor C-204 Maintenance Log.txt p1 (matched)                                     |
| `compliance-p101-critical-spare-stockout`  | `compliance_gap` | pass   | asset=P-101; gap=Critical Spare Stockout; evidence_hits=2/2             | Spare Parts Inventory.csv p1 (matched)<br>Regulatory Clause Extract.txt p1 (matched)  |
| `compliance-p101-restart-authorisation`    | `compliance_gap` | pass   | asset=P-101; gap=Restart Authorisation Conflict; evidence_hits=1/1      | Contradiction Log P-101.txt p1 (matched)                                              |
| `compliance-b12-energy-isolation-controls` | `compliance_gap` | pass   | asset=B-12; gap=Energy Isolation Control Requirement; evidence_hits=2/2 | Boiler B-12 Safety SOP.txt p1 (matched)<br>Regulatory Clause Extract.txt p1 (matched) |

### Contradiction

- Passed: 3/3

| Check                                          | Type            | Status | Detail                                             | Evidence                                                                                           |
| ---------------------------------------------- | --------------- | ------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `contradiction-p101-restart-lockout`           | `conflict_pair` | pass   | asset=P-101; evidence_hit=True; conflict_terms=3/3 | Contradiction Log P-101.txt p1 (matched)<br>Contradiction Log P-101.txt p1 (matched)               |
| `contradiction-p101-operating-above-threshold` | `conflict_pair` | pass   | asset=P-101; evidence_hit=True; conflict_terms=3/3 | Pump P-101 OEM Manual.txt p1 (matched)<br>Incident Report Pump P-101 Seal Failure.txt p1 (matched) |
| `contradiction-p101-spare-availability`        | `conflict_pair` | pass   | asset=P-101; evidence_hit=True; conflict_terms=3/3 | Pump P-101 OEM Manual.txt p1 (matched)<br>Spare Parts Inventory.csv p1 (matched)                   |

### Entity

- Passed: 12/12

| Check                          | Type            | Status | Detail                                         | Evidence                                                |
| ------------------------------ | --------------- | ------ | ---------------------------------------------- | ------------------------------------------------------- |
| `entity-p101-equipment`        | `entity_recall` | pass   | entity=Equipment:P-101; matched=2/2            | Pump P-101 OEM Manual.txt p1 (matched)                  |
| `entity-c204-equipment`        | `entity_recall` | pass   | entity=Equipment:C-204; matched=2/2            | Compressor C-204 Maintenance Log.txt p1 (matched)       |
| `entity-b12-equipment`         | `entity_recall` | pass   | entity=Equipment:B-12; matched=2/2             | Boiler B-12 Safety SOP.txt p1 (matched)                 |
| `entity-hx22-equipment`        | `entity_recall` | pass   | entity=Equipment:HX-22; matched=2/2            | Heat Exchanger HX-22 Inspection Report.txt p1 (matched) |
| `entity-wo1201-work-order`     | `entity_recall` | pass   | entity=Work Order:WO-1201; matched=2/2         | Pump P-101 OEM Manual.txt p1 (matched)                  |
| `entity-wo1260-work-order`     | `entity_recall` | pass   | entity=Work Order:WO-1260; matched=3/3         | Pump P-101 Quick Maintenance Guide.docx p1 (matched)    |
| `entity-api610-regulation`     | `entity_recall` | pass   | entity=Regulation:API 610; matched=1/1         | Vendor Service Report P-101.txt p1 (matched)            |
| `entity-iso45001-regulation`   | `entity_recall` | pass   | entity=Regulation:ISO 45001; matched=2/2       | Boiler B-12 Safety SOP.txt p1 (matched)                 |
| `entity-vibration-signal`      | `entity_recall` | pass   | entity=Historian Signal:vibration; matched=2/2 | Sensor Anomaly Events.csv p1 (matched)                  |
| `entity-mechanical-seal-spare` | `entity_recall` | pass   | entity=Spare Part:mechanical seal; matched=2/2 | Spare Parts Inventory.csv p1 (matched)                  |
| `entity-loto-control`          | `entity_recall` | pass   | entity=Permit Control:LOTO; matched=2/2        | Boiler B-12 Safety SOP.txt p1 (matched)                 |
| `entity-vlv101-valve`          | `entity_recall` | pass   | entity=Process Parameter:VLV-101; matched=2/2  | P&ID Extract Unit 1.pdf p1 (matched)                    |

### Graph

- Passed: 9/9

| Check                           | Type         | Status | Detail                                                                     | Evidence                                                 |
| ------------------------------- | ------------ | ------ | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| `graph-p101-failure-mode`       | `graph_link` | pass   | P-101 -> Failure Mode:seal leakage; accepted; confidence=0.88              | Incident Report Pump P-101 Seal Failure.txt p1 (matched) |
| `graph-p101-spare-part`         | `graph_link` | pass   | P-101 -> Spare Part:mechanical seal; accepted; confidence=0.82             | Spare Parts Inventory.csv p1 (matched)                   |
| `graph-p101-work-order`         | `graph_link` | pass   | P-101 -> Work Order:WO-1201; accepted; confidence=0.79                     | Pump P-101 OEM Manual.txt p1 (matched)                   |
| `graph-c204-compliance-gap`     | `graph_link` | pass   | C-204 -> Compliance Gap:C-204 overdue inspection; accepted; confidence=0.9 | Factory Safety Compliance Checklist.txt p1 (matched)     |
| `graph-b12-permit-control`      | `graph_link` | pass   | B-12 -> Permit Control:LOTO; accepted; confidence=0.84                     | Boiler B-12 Safety SOP.txt p1 (matched)                  |
| `graph-p101-contradiction`      | `graph_link` | pass   | P-101 -> Contradiction:P-101 restart lockout; accepted; confidence=0.83    | Contradiction Log P-101.txt p1 (matched)                 |
| `graph-hx22-work-order`         | `graph_link` | pass   | HX-22 -> Work Order:WO-3102; accepted; confidence=0.8                      | Heat Exchanger HX-22 Inspection Report.txt p1 (matched)  |
| `graph-p101-api610`             | `graph_link` | pass   | P-101 -> Regulation:API 610; accepted; confidence=0.77                     | Vendor Service Report P-101.txt p1 (matched)             |
| `graph-c204-temperature-signal` | `graph_link` | pass   | C-204 -> Historian Signal:discharge temperature; accepted; confidence=0.76 | Sensor Anomaly Events.csv p1 (matched)                   |

### Graph_Validation

- Passed: 3/3

| Check                                        | Type              | Status | Detail                                                                    | Evidence                                                 |
| -------------------------------------------- | ----------------- | ------ | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `graph-validation-accepted-evidence`         | `edge_validation` | pass   | P-101 -> Failure Mode:seal leakage; status=accepted; confidence=0.88      | Incident Report Pump P-101 Seal Failure.txt p1 (matched) |
| `graph-validation-weak-low-confidence`       | `edge_validation` | pass   | P-101 -> Document:Pump P-101 OEM Manual.txt; status=weak; confidence=0.58 | Pump P-101 OEM Manual.txt p1 (matched)                   |
| `graph-validation-rejected-missing-evidence` | `edge_validation` | pass   | P-999 -> Failure Mode:unknown failure; status=rejected; confidence=0.91   | No evidence                                              |

### Grounding

- Passed: 5/5

| Check                                | Type              | Status | Detail                                                               | Evidence                                                                                                                        |
| ------------------------------------ | ----------------- | ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ground-p101-seal-failure-claims`    | `grounded_answer` | pass   | claims=3/3; claim_f1=1.0; citation_coverage=1.0; text_support=0.6667 | Incident Report Pump P-101 Seal Failure.txt p1 (matched)<br>Incident Report Pump P-101 Seal Failure.txt p1 (matched)<br>+2 more |
| `ground-c204-compliance-claims`      | `grounded_answer` | pass   | claims=3/3; claim_f1=1.0; citation_coverage=1.0; text_support=1.0    | Compressor C-204 Maintenance Log.txt p1 (matched)<br>Compressor C-204 Maintenance Log.txt p1 (matched)<br>+1 more               |
| `ground-b12-energy-isolation-claims` | `grounded_answer` | pass   | claims=3/3; claim_f1=1.0; citation_coverage=1.0; text_support=1.0    | Boiler B-12 Safety SOP.txt p1 (matched)<br>Regulatory Clause Extract.txt p1 (matched)<br>+1 more                                |
| `ground-p101-stockout-claims`        | `grounded_answer` | pass   | claims=2/2; claim_f1=1.0; citation_coverage=1.0; text_support=0.5    | Spare Parts Inventory.csv p1 (matched)<br>Regulatory Clause Extract.txt p1 (matched)                                            |
| `ground-hx22-inspection-claims`      | `grounded_answer` | pass   | claims=2/2; claim_f1=1.0; citation_coverage=1.0; text_support=1.0    | Heat Exchanger HX-22 Inspection Report.txt p1 (matched)<br>Heat Exchanger HX-22 Inspection Report.txt p1 (matched)              |

### Numeric

- Passed: 5/5

| Check                                        | Type           | Status | Detail                                                                      | Evidence                                          |
| -------------------------------------------- | -------------- | ------ | --------------------------------------------------------------------------- | ------------------------------------------------- |
| `numeric-p101-historian-vibration-breach`    | `domain_logic` | pass   | P-101 vibration breaches=2/2; peak=8.2/8.2 mm/s                             | Historian Trend P-101.csv p1 (matched)            |
| `numeric-p101-sensor-vibration-alarm`        | `domain_logic` | pass   | P-101 vibration breaches=1/1; peak=8.9/8.9 mm/s                             | Sensor Anomaly Events.csv p1 (matched)            |
| `numeric-p101-vibration-trend-increase`      | `domain_logic` | pass   | points=3; increasing=True; delta=1.4/1.4                                    | Historian Trend P-101.csv p1 (matched)            |
| `numeric-p101-mechanical-seal-stock-minimum` | `domain_logic` | pass   | mechanical seal available=0.0; minimum=2.0; status=Stockout                 | Spare Parts Inventory.csv p1 (matched)            |
| `numeric-c204-inspection-date-gap`           | `domain_logic` | pass   | completed_gap_days=61; required_interval_days=60; missing_record_noted=True | Compressor C-204 Maintenance Log.txt p1 (matched) |

### Parser

- Passed: 6/6

| Check                              | Type              | Status | Detail                                                            | Evidence                                                |
| ---------------------------------- | ----------------- | ------ | ----------------------------------------------------------------- | ------------------------------------------------------- |
| `parser-pid-extract`               | `parser_contract` | pass   | parser=pymupdf; pages=1; metadata_failures=0; missing_terms=0     | P&ID Extract Unit 1.pdf p1 (matched)                    |
| `parser-scanned-form-image-backed` | `parser_contract` | pass   | parser=pymupdf; pages=1; metadata_failures=0; missing_terms=0     | Scanned C-204 Inspection Form.pdf p1 (matched)          |
| `parser-work-order-xlsx`           | `parser_contract` | pass   | parser=pandas-xlsx; pages=1; metadata_failures=0; missing_terms=0 | Work Order History.xlsx p1 (matched)                    |
| `parser-quick-guide-docx`          | `parser_contract` | pass   | parser=python-docx; pages=1; metadata_failures=0; missing_terms=0 | Pump P-101 Quick Maintenance Guide.docx p1 (matched)    |
| `parser-historian-csv`             | `parser_contract` | pass   | parser=pandas-csv; pages=1; metadata_failures=0; missing_terms=0  | Historian Trend P-101.csv p1 (matched)                  |
| `parser-hx22-text`                 | `parser_contract` | pass   | parser=plain-text; pages=1; metadata_failures=0; missing_terms=0  | Heat Exchanger HX-22 Inspection Report.txt p1 (matched) |

### Qa

- Passed: 8/8

| Check                         | Type          | Status | Detail                              | Evidence                                                 |
| ----------------------------- | ------------- | ------ | ----------------------------------- | -------------------------------------------------------- |
| `qa-p101-seal-failure`        | `qa_evidence` | pass   | citation_hit=True; answer_terms=4/4 | Incident Report Pump P-101 Seal Failure.txt p1 (matched) |
| `qa-p101-vibration-limit`     | `qa_evidence` | pass   | citation_hit=True; answer_terms=3/3 | Pump P-101 OEM Manual.txt p1 (matched)                   |
| `qa-c204-inspection-gap`      | `qa_evidence` | pass   | citation_hit=True; answer_terms=3/3 | Compressor C-204 Maintenance Log.txt p1 (matched)        |
| `qa-b12-energy-isolation`     | `qa_evidence` | pass   | citation_hit=True; answer_terms=3/3 | Boiler B-12 Safety SOP.txt p1 (matched)                  |
| `qa-sensor-anomaly`           | `qa_evidence` | pass   | citation_hit=True; answer_terms=4/4 | Sensor Anomaly Events.csv p1 (matched)                   |
| `qa-p101-spare-stockout`      | `qa_evidence` | pass   | citation_hit=True; answer_terms=3/3 | Spare Parts Inventory.csv p1 (matched)                   |
| `qa-p101-quick-guide-actions` | `qa_evidence` | pass   | citation_hit=True; answer_terms=3/3 | Pump P-101 Quick Maintenance Guide.docx p1 (matched)     |
| `qa-hx22-inspection-outcome`  | `qa_evidence` | pass   | citation_hit=True; answer_terms=3/3 | Heat Exchanger HX-22 Inspection Report.txt p1 (matched)  |

### Rca

- Passed: 4/4

| Check                          | Type           | Status | Detail                                                 | Evidence                                                                                    |
| ------------------------------ | -------------- | ------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `rca-p101-seal-leakage`        | `rca_evidence` | pass   | asset=P-101; evidence_hit=True; causes=3/3; checks=2/2 | Incident Report Pump P-101 Seal Failure.txt p1 (matched)                                    |
| `rca-p101-vibration-threshold` | `rca_evidence` | pass   | asset=P-101; evidence_hit=True; causes=2/2; checks=2/2 | Pump P-101 OEM Manual.txt p1 (matched)<br>Shift Handover Log Unit 1.txt p1 (matched)        |
| `rca-c204-overheating`         | `rca_evidence` | pass   | asset=C-204; evidence_hit=True; causes=2/2; checks=2/2 | Compressor C-204 Maintenance Log.txt p1 (matched)<br>Sensor Anomaly Events.csv p1 (matched) |
| `rca-hx22-fouling`             | `rca_evidence` | pass   | asset=HX-22; evidence_hit=True; causes=2/2; checks=2/2 | Heat Exchanger HX-22 Inspection Report.txt p1 (matched)                                     |

### Retrieval

- Passed: 8/8

| Check                                  | Type                | Status | Detail                                                                                 | Evidence                                                                                                             |
| -------------------------------------- | ------------------- | ------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ret-p101-seal-failure-causal-chain`   | `retrieval_ranking` | pass   | recall@6=1.0; context_precision=0.8042; mrr=1.0; ndcg@6=0.9047; evidence_coverage=True | Incident Report Pump P-101 Seal Failure.txt p1 (matched)<br>Pump P-101 OEM Manual.txt p1 (missing 1)<br>+4 more      |
| `ret-p101-vibration-threshold-actions` | `retrieval_ranking` | pass   | recall@5=1.0; context_precision=0.8875; mrr=1.0; ndcg@5=0.9558; evidence_coverage=True | Pump P-101 OEM Manual.txt p1 (matched)<br>Pump P-101 Quick Maintenance Guide.docx p1 (matched)<br>+3 more            |
| `ret-c204-compliance-overdue`          | `retrieval_ranking` | pass   | recall@5=1.0; context_precision=0.8667; mrr=1.0; ndcg@5=0.9469; evidence_coverage=True | Factory Safety Compliance Checklist.txt p1 (matched)<br>Compressor C-204 Maintenance Log.txt p1 (matched)<br>+3 more |
| `ret-b12-energy-isolation`             | `retrieval_ranking` | pass   | recall@5=1.0; context_precision=1.0; mrr=1.0; ndcg@5=1.0; evidence_coverage=True       | Boiler B-12 Safety SOP.txt p1 (matched)<br>Regulatory Clause Extract.txt p1 (matched)<br>+3 more                     |
| `ret-p101-critical-spare-stockout`     | `retrieval_ranking` | pass   | recall@5=1.0; context_precision=1.0; mrr=1.0; ndcg@5=1.0; evidence_coverage=True       | Spare Parts Inventory.csv p1 (matched)<br>Incident Report Pump P-101 Seal Failure.txt p1 (matched)<br>+3 more        |
| `ret-hx22-inspection-loop`             | `retrieval_ranking` | pass   | recall@5=1.0; context_precision=1.0; mrr=1.0; ndcg@5=1.0; evidence_coverage=True       | Heat Exchanger HX-22 Inspection Report.txt p1 (matched)<br>Work Order History.xlsx p1 (matched)<br>+3 more           |
| `ret-c204-temperature-anomaly`         | `retrieval_ranking` | pass   | recall@5=1.0; context_precision=1.0; mrr=1.0; ndcg@5=1.0; evidence_coverage=True       | Sensor Anomaly Events.csv p1 (matched)<br>Compressor C-204 Maintenance Log.txt p1 (matched)<br>+3 more               |
| `ret-pid-line-break-loto`              | `retrieval_ranking` | pass   | recall@5=1.0; context_precision=0.7; mrr=1.0; ndcg@5=0.8503; evidence_coverage=True    | P&ID Extract Unit 1.pdf p1 (matched)<br>Spare Parts Inventory.csv p1 (missing 1)<br>+3 more                          |
