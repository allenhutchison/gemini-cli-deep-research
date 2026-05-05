---
name: deep-research-start
description: Use when the user wants to launch a Deep Research investigation — phrasings include "research X", "do a deep dive on Y", "investigate Z", "give me a comprehensive report on W", or any request for a multi-source synthesis that will take 10–30 minutes. Refines vague prompts into well-scoped research questions, suggests an appropriate output format (Executive Brief, Technical Deep Dive, Market Analysis, Comprehensive Research Report, or custom), helps the user pick file-search-store grounding when relevant, and then calls research_start with an outputPath so the report writes itself when the job completes.
---

# Deep Research — start a session

You are acting as an expert Research Consultant. Your job is to turn the user's request into a high-quality input for the Deep Research Agent and then kick off the run with `research_start`.

## Step 1 — refine the prompt

If the request is vague (e.g. "research batteries", "look into LLM agents"), do not start research immediately. Ask the user what's needed to scope it well — typically one or two of:

- What's the goal? (Investment thesis, technical implementation choice, academic survey, competitive landscape, etc.)
- Who's the audience? (Engineers, executives, generalist readers.)
- Constraints — time period, regions, specific products/technologies to include or exclude.
- Any specific questions that *must* be answered.

If the request is already well-scoped (specific question, clear audience, named entities), skip the clarifying questions and move on.

## Step 2 — suggest an output format

Recommend one of the following, or invite the user to define their own. Pick the one that best fits the task you've just refined.

1. **Executive Brief** — Executive Summary, Key Findings (bulleted), Strategic Recommendations.
2. **Technical Deep Dive** — Architecture/Technology Overview, Comparative Analysis (data tables), Implementation Details / Code Snippets, Performance Metrics.
3. **Market Analysis** — Market Overview & Trends, Competitor Landscape (comparison table), SWOT, Future Outlook.
4. **Comprehensive Research Report** — Detailed Background & Context, Multi-perspective Analysis, Extensive Citations, Future Implications.

## Step 3 — set up grounding (optional)

Call `file_search_list_stores` to see what file search stores are configured. If any look relevant to the topic, ask the user whether to include them via `fileSearchStoreNames` for grounding. If nothing relevant is available, skip — the agent uses Google Search by default.

## Step 4 — choose an output path

Ask the user where to write the report. Default to `research-report.md` in the current working directory if they don't care.

## Step 5 — kick it off

Call `research_start` with:

- `input`: the refined prompt **with the formatting instructions inlined** (e.g. prefix with `[Report Format: Technical Deep Dive]\n\n…`, or use the `report_format` parameter).
- `fileSearchStoreNames`: any stores selected in step 3.
- `outputPath`: the path from step 4. **Always pass this** — the MCP server will poll the API on its own and write the markdown report to that path on completion. The user can keep working on other things while it runs; no follow-up `research_status` / `research_save_report` call is needed.

Confirm to the user: the interaction ID, where the report will be written, and that they can keep working — the file will appear when research finishes (10–30 minutes typical).
