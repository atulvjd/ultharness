# Ultharness

A local workspace for coding agents and recurring operations, inspired by Herdr's visibility and Paperclip's task structure.

## Mac app and disk image

Open the generated `.dmg`, drag **Ultharness** into **Applications**, and launch it. The native Mac window and Node runtime are bundled. Codex, Claude, OmniRoute, Ollama, their accounts and model weights remain separate installations.

If the browser version is running on port 4310, the app connects to that workspace and leaves its server running when you quit. Otherwise it starts a bundled loopback server on an available port, with its own SQLite state under `~/Library/Application Support/Ultharness/workspace`. The standalone app's initial project is Documents. Choose **File → Connect Project Folder** to add a project using the native folder picker. The app does not move the browser version's database.

**Model Services** can start installed OmniRoute or Ollama. Processes started by the Mac app stop when it quits. Previously running services remain running. Save standalone app gateway credentials in a private `~/Library/Application Support/Ultharness/settings.env` file to retain them across launches, or use the existing session key form. **File → Open Desktop Log** shows startup issues.

Build locally on macOS with Xcode Command Line Tools and an official Node.js 24+ distribution:

```sh
npm run package:mac
```

This creates `dist/Ultharness.app`, a versioned `.dmg`, its SHA-256 file, and build metadata. The build uses the host Node architecture. The current Apple Silicon package requires macOS 14+. Only an explicit source-file allowlist is bundled. Keys, `.env`, SQLite databases, logs and model weights are excluded. The official Node runtime's license is included.

The local build is ad-hoc signed and verified, but not Apple-notarized. Public distribution with Developer ID and notarization is a separate release step described in [Apple's distribution guidance](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution). The installer does not change macOS security settings.

## Run

Requires **Node.js 24 or newer**. No npm dependencies or build step.

```sh
npm start
```

Open **http://127.0.0.1:4310**. Stop with Ctrl+C. `npm run dev` restarts the backend when its source changes; refresh the browser after frontend changes.

To use the installed OmniRoute gateway, run `npm run gateway` in a second terminal. If you use local Ollama models, start `ollama serve` in another terminal or start the Ollama app.

Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4310` | Local HTTP port |
| `ULTHARNESS_ROOT` | This repository | Initial project directory on first start |
| `ULTHARNESS_DATA` | `.ultharness` in this repository | SQLite data directory |
| `OMNIROUTE_BASE_URL` | `http://127.0.0.1:20128/v1` | Initial OmniRoute URL on first start |
| `OMNIROUTE_API_KEY` | Unset | Optional gateway key, read by the local backend |

`npm start` and `npm run dev` load an optional local `.env` file. Use `.env.example` as a starting point. The actual `.env` is ignored by Git.

## OmniRoute

OmniRoute can route model requests from either installed coding CLI. The CLI still runs the agent loop and tools; OmniRoute handles upstream providers, model aliases, and fallback policies.

1. Start your OmniRoute instance with `npm run gateway`. This uses the installed `omniroute` CLI on loopback at port 20128. The launcher runs from your home directory and removes Ultharness's client routing variables from the child environment. OmniRoute also reads `.env` from its working directory, so launching it directly from this project can incorrectly treat the app's scoped client key as a server key.
2. Open **Model routing** in Ultharness. Set the gateway URL and click **Save & test connection**. This only requests `/v1/models`; it does not perform inference.
3. Select a default model from the returned catalog, or enter an exact model/combination ID. Catalog visibility does not verify upstream provider authentication or quota.
4. Create a task or routine for Codex or Claude. Choose **OmniRoute** under **Model route**, then choose a model or leave the field to use your default. Built-in local checks do not use the gateway.
5. Review the gateway URL and model on the task's approval screen, then approve the run. The URL and model are pinned for that approved attempt. A retry captures the current gateway URL and requires approval again.

The **Model routing** dashboard groups catalog entries by provider. Click a provider to filter its models, or search by model ID. **Create demo task** and **Try model** prepare a short, review-mode task using an installed coding agent. You can inspect the instructions before submitting and approving it. These buttons do not make inference calls by themselves. Provider labels describe configured routes; discovery does not independently verify pricing, quota, generation, or tool support. The gateway's own key policies control which models the app may use.

The installed `ollama-local/llama3.2:3b` route disables Codex reasoning effort and summaries for that run because Llama 3.2 rejects thinking requests. Other routes keep their existing model settings. A successful text reply does not establish that a small local model can follow coding instructions or use tools reliably. The override uses the documented [Codex reasoning settings](https://learn.chatgpt.com/docs/config-file/config-reference).

For a gateway requiring authentication, set `OMNIROUTE_API_KEY` in the local environment or `.env`, or enter its gateway key in the connection form. Form-entered keys live only in server memory until restart. Keys are not written to SQLite, returned in snapshots, or placed in CLI command arguments. A key is associated with its gateway URL and is not automatically forwarded when you change endpoints. A local gateway that does not require authentication uses a non-secret `local` placeholder for CLI compatibility.

The default model is saved only as a convenience for new tasks. Selecting it does not change existing tasks or your global CLI settings. Each run uses Codex `-c` provider overrides or Claude process-local gateway environment variables; it does not rewrite `~/.codex/config.toml` or `~/.claude/settings.json`. Codex uses OmniRoute's Responses endpoint, and Claude uses its Anthropic Messages endpoint. Claude routing to non-Claude models relies on OmniRoute's compatibility layer and is not supported by Anthropic itself.

References: [OmniRoute Codex configuration](https://omniroute.hagicode.com/en-US/guides/codex-cli-configuration/), [OmniRoute Claude configuration](https://omniroute.hagicode.com/en-US/guides/claude-code-configuration/), [Codex custom model providers](https://learn.chatgpt.com/docs/config-file/config-advanced), and [Claude gateway support](https://code.claude.com/docs/en/llm-gateway).

## First workflow

1. Click **Inspect workspace**. Scout inventories the real project folder, declared package scripts, and Git status, then saves a report.
2. Click **Check system health**. Pulse records real disk, memory, CPU load, and uptime metrics.
3. Connect another existing folder under **Projects**.
4. Create a task, select **Codex** or **Claude**, choose a project, and describe the work. Choose review or edit access.
5. Submit the task and review it in the approval inbox. **Approve & run** launches the installed CLI. Logs appear in the task; its final response becomes a downloadable artifact.
6. Use **Create follow-up** to hand work to another agent. AI follow-ups receive the latest parent report as context. An optional dependency prevents starting before another task is done.
7. Create a **Routine** for repeated work. Local checks run on schedule. Every AI routine run creates an approval request.

## Multi-step workflows

Open **Workflows** and choose **Inspect & review**, **Inspect, build & review**, or **Operations review**. Customize the goal, project, model route and each step's agent, instructions and access mode. You can add or remove steps, from two to eight total. Local checks retain their fixed inspection or health scope.

The workflow creates ordinary linked tasks. Its first step is submitted when you start it. After a step succeeds, the next step is submitted automatically and receives its predecessor's latest report. Every AI step, including retries, requests its own approval. The selected model is stored per task and its current gateway URL is pinned when that step requests approval.

Pause a workflow to hold future steps and ready tasks. An active task continues until it finishes or you cancel it. A failure or cancellation holds all later steps. Open the failed step and choose **Run again** to retry. If an unavailable or paused agent prevents submission, resolve that issue and pause/resume the workflow. You can also save a workflow without starting it, then resume it later.

This is a sequence you define. The app does not generate plans or delegate work on its own.

Coding review and implementation recipes enable **Require recorded tool activity** for their AI steps. A report without a structured tool event fails that step and holds its successors. This prevents a model's invented command text from counting as file inspection. The requirement is optional per step, task, or routine, so analysis of an existing report can run without tools. For an existing idle task, change its next-run requirement in task details. Details show the last run's recorded tool-action count. Tool activity establishes that a tool was invoked, not that its result or the report is correct.

## Queue and project folders

Eligible ready tasks run in high, normal, then low priority order. Equal-priority tasks use submission time, with task number as a tie breaker. Priority does not interrupt a running job. The task page shows waiting tasks and why they are waiting. Change priority in a task's details. Runner limits, paused agents, dependencies and project locks still determine eligibility.

Under **Projects**, use **Edit project** or **Reconnect folder** after moving a workspace. Existing task history stays linked to the same project. Moving a project's folder requires its active jobs to finish and resets its pending approvals so the new location can be reviewed. Old report contents remain historical records of their original location.

Scout and Pulse are deterministic tools, **not language models**. Their descriptions and reports state their scope. Assign reasoning or coding work to a CLI agent.

## Agents and permissions

| Runner | Integration | Capabilities |
| --- | --- | --- |
| Scout | Built-in Node filesystem inspection, read-only Git status | Project inventory; no AI or file changes |
| Pulse | Built-in Node OS/filesystem metrics | Local health snapshot; no network probing or changes |
| Codex | Installed `codex exec`, JSONL events | `read-only` sandbox for review; `workspace-write` for edits |
| Claude | Installed `claude -p`, stream JSON events | Read/Glob/Grep for review; adds Edit/Write for edits |

The app detects executable availability from the server's `PATH`. It does not install CLIs or log in for you. CLI-default tasks use your CLI's configured account. OmniRoute tasks use the gateway's providers. Sign-in, account limits, and model availability are verified by the provider when a run starts. The dashboard's routing form accepts a gateway key; upstream provider credentials are managed in OmniRoute.

Every CLI run, including retries and scheduled runs, requires approval in this app. This authorizes a **whole task**, not each individual tool call. Codex runs with its selected sandbox and `approval_policy="never"`, so requests that need elevated permissions cannot obtain them interactively. Claude receives an explicit file-tool allowlist; shell execution is unavailable through that integration. Provider/project configuration can still affect CLI behavior.

After cancellation, the task shows **Stopping previous run…** until its process exits. Retrying is disabled during that interval so output from the old process cannot overwrite a fresh approval. A CLI that exits without a non-empty assistant report is marked failed, and later workflow steps stay on hold. Startup messages and diagnostic logs do not count as a report. A report still requires your review for correctness.

AI runs send instructions and any context the CLI reads to the configured provider, subject to that provider's settings. Task records and reports are stored locally. The app does not enforce a model-spend budget. A 15-minute run limit, cancellation, and a maximum of two concurrent jobs bound execution. AI coding jobs on the same project are serialized; each agent runs one task at a time.

## Routines and persistence

- Routines use elapsed intervals of 1 minute to 30 days. Enter a custom number of minutes or select an hourly, 6-hourly, daily, or weekly suggestion.
- **Edit routine** changes future task instructions, agent, model route, access mode and interval. Existing tasks and their pending approvals keep their original settings. Changing the interval starts a new countdown. The routine card links to its latest run.
- The scheduler polls every 15 seconds while the server is running. This is not an OS background service.
- An overdue routine runs once after downtime; missed intervals are not replayed.
- An unfinished routine task prevents duplicate runs. Disabled agents do not accept new tasks.
- SQLite stores projects, agents, tasks, workflows, approvals, logs, notes, routines, artifacts, and activity.
- Stopping the server terminates its CLI processes. Interrupted jobs are marked failed and can be submitted again. The app does **not** resurrect running processes or resume CLI conversations after a restart.
- Reruns append logs and create another report, preserving earlier artifacts.

## Architecture

```text
Browser dashboard
      │ HTTP actions + Server-Sent Events
Local Node server (127.0.0.1 only)
      ├── SQLite workspace state
      ├── Task queue, dependencies, approvals, project locks
      ├── Interval scheduler
      └── Runners
           ├── Workspace inspection
           ├── System health
           ├── Codex CLI process
           └── Claude Code CLI process
```

`server.mjs` contains the API, queue, scheduler, reports, and adapters. `public/app.js` renders the dashboard and handles forms and live updates. `public/style.css` contains the responsive visual system.

The server binds only to loopback, validates Host and Origin, requires JSON mutations, serves an explicit asset allowlist, and escapes untrusted content in the UI. It has no multi-user authentication and is intended for a single user's trusted machine. Keep its database private: logs and reports can contain project information.

## Verify

```sh
npm run check
npm test
```

Tests exercise real local reports and downloads, dependencies, routines and edits, persistence, priority ordering, workflow handoffs and separate approvals, pause/resume, failed-step recovery, folder reconnection, origin and input validation, cancellation, stream parsing, CLI permission arguments, gateway discovery/authentication, routing isolation, endpoint pinning, gateway startup isolation, and credential redaction. Provider integration tests use local fixture executables and make **no model calls**. Live provider authentication and generation require a user-approved run.

CLI integration references: [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive) and [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference). Installed CLI help was checked during implementation.

## Scope

This version supports human-directed task assignment, follow-ups, sequential workflows, and recurring local work. It does not yet provide an autonomous manager that decomposes goals, agent-to-agent API access, interactive terminal panes, Git worktree management, SSH execution, cloud service integrations, network-device access, or a credential vault.
