# Ultharness

A local workspace for client delivery, coding agents, and recurring operations. Turn a detailed brief into implementation, recorded checks, independent review, and bounded repair cycles.

## One aim → persistent live delivery · 0.5.0

Click **Start with an aim**, describe the result, add reference URLs or project-relative documents, choose the project folder, and press **Start & watch live**. Optional run settings let you select the model route, reusable connections, persistent mode (up to 100 repairs plus three recoveries), or a short run (three repairs). The default persistent time budget is 12 hours. That start action authorizes the displayed cycle; there is no second approval for each step.

Planning begins without assumed file paths or scripts. The planner inspects the actual workspace and derives an implementation plan, measurable criteria and finite checks from the original aim. The original aim and references remain in every build/review prompt. Fixed standards require honest reference handling, actual browser evidence for website interactions and responsive behavior, and no weakened tests or invented integrations. Planner output is validated before building; arbitrary script names, invalid paths and malformed plans block the run. Verification scripts use build/test/check/lint/typecheck/verify names and may need to be added by the builder. These scripts execute project code as your Mac user; they are not an OS sandbox.

Then the harness builds, runs recorded checks, reviews in a fresh session, and repairs rejected work within the selected limit. It defaults to an available Codex CLI, or Claude if Codex is unavailable, and uses that same CLI in a separate review session unless another reviewer is explicitly selected through the API. Availability does not establish account authentication or model/tool capability. Persistent mode retries temporary provider failures within its recovery budget; missing access or tools stop for attention. Missing browser evidence must be rejected, not reported as visually verified. Checks/review passing makes the work ready for your acceptance; it does not automatically publish it or guarantee correctness. Model usage may be billed, with no monetary budget enforcement.

**Live workspace** streams actual logs, tool output, check results, the derived standards and review evidence. **Stop cycle** cancels the active step. **Live site preview** displays static `index.html` output, checking `dist`, `build`, `out`, then the project root. It reloads when relevant files change. It does not launch framework development servers or proxy application backends. The preview runs on a separate loopback origin in a sandboxed iframe, blocks forms/external connections, omits hidden paths and private file types, and rejects symlinks outside the project. Static output may therefore preview while API-dependent features require the project's own runtime.

With the browser backend already running (`npm start`), the same flow takes one command:

```sh
npm run aim -- "Build my client's complete architecture website; match the references and verify responsive behavior" --project "/path/to/client-project" --ref "docs/brief.md" --ref "https://example.com/design" --repairs 3
```

The command connects an existing project folder if necessary, starts the mission, and streams its logs until it passes review or needs attention. Ctrl+C stops that cycle. Use `--server http://127.0.0.1:PORT` for another local backend (including the desktop app's URL), and `--route omniroute --model EXACT_ID` for a routed model. The default model route is your installed CLI account; no global CLI settings are rewritten. A mission allows at most one planner plus `2 × (repair limit + 1)` AI runs, with three additional recoveries in persistent mode.

The `POST /api/missions` endpoint accepts `aim`, `projectId`, optional `references` and `connectionIds`, and optional `builderId`, `reviewerId`, `maxRepairs`, `runPolicy` (`persistent` or `bounded`), `maxMinutes`, `route`, `model`. API clients must explicitly choose persistent mode; the UI and CLI select it by default. It starts the cycle immediately. Existing advanced client-brief forms and ordinary tasks keep their earlier behavior. Active planning reserves the project. After restart, bounded cycles require approval; persistent cycles can recover their interrupted phase within the original approval, remaining time and recovery budgets.

## Interface update · 0.3.1

The dashboard uses a charcoal palette with lime accents, a delivery-focused overview, readable status cards, grouped navigation and responsive layouts. Client deliveries have stage indicators and filters for all work, in-progress work, review, and accepted deliveries. The client-brief form is split into project, acceptance, team, and check sections.

Click **Search workspace** or press **⌘K / Ctrl+K** to find a page, task number, client, or delivery. Use the arrow keys and Enter to open a result; Escape closes search and dialogs. On narrower screens, the navigation button opens a labelled menu with keyboard focus contained inside it. Existing tasks, approvals and delivery evidence remain available through their usual controls.

## Mac app and disk image

Open the generated `.dmg`, drag **Ultharness** into **Applications**, and launch it. The native Mac window, Node runtime, npm and npx are bundled. Codex, Claude, OmniRoute, Ollama, their accounts and model weights remain separate installations.

If the same browser version is running on port 4310, the app connects to that workspace and leaves its server running when you quit. Otherwise, including when an older server occupies that port, it starts a bundled loopback server on an available port, with its own SQLite state under `~/Library/Application Support/Ultharness/workspace`. The standalone app's initial project is Documents. Choose **File → Connect Project Folder** to add a project using the native folder picker. The app does not move the browser version's database.

**Model Services** can start installed OmniRoute or Ollama. Processes started by the Mac app stop when it quits. Previously running services remain running. Save standalone app gateway credentials in a private `~/Library/Application Support/Ultharness/settings.env` file to retain them across launches, or use the existing session key form. **File → Open Desktop Log** shows startup issues.

Build locally on macOS with Xcode Command Line Tools and an official Node.js 24+ distribution:

```sh
npm run package:mac
```

This creates `dist/Ultharness.app`, a versioned `.dmg`, its SHA-256 file, and build metadata. The build uses the host Node architecture. The current Apple Silicon package requires macOS 14+. Only an explicit source-file allowlist is bundled. Keys, `.env`, SQLite databases, logs and model weights are excluded. The official Node runtime's license and npm's included licenses are bundled. Dependencies needed by client projects remain project-specific.

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

## Client website delivery

1. Connect a dedicated client folder under **Projects**. The folder must already exist; use an empty folder for a new website.
2. Add **Connections** for the client’s repository, Figma design, local documents, CMS, database, API, and hosting references. A reference link supplies context; it does not authenticate or fetch service data automatically.
3. Open **Client deliveries → New client brief**, or use **Try a website brief**. Include the purpose, audience, pages, user flows, content, visual direction, technology, responsive behavior, constraints, and expected handoff.
4. Add one measurable acceptance criterion per line. Choose a builder and reviewer; the reviewer always uses a fresh read-only file session, even when both roles use the same CLI/model.
5. Add required files and/or finite npm verification scripts. File lines can use `path :: required text` for a literal content assertion. Script entries are names such as `build`, `test`, or `test:e2e` from the client project’s `package.json`. Include browser/accessibility checks in those scripts when appropriate. Scripts execute the project’s current code with the app’s user permissions, inherit its environment except gateway client keys, and each has a two-minute timeout. Output includes the executed script, manifest hash and exit status. These are not an OS sandbox.
6. Select connections and a maximum of 0–5 automatic repair attempts. Saving only creates a draft. **Review & start** shows the complete run scope. **Approve & build** authorizes that bounded build/check/review cycle, including automatic repairs, with at most `2 × (repairs + 1)` AI runs on that approval. Normal tasks, routines and sequential workflows keep their existing individual approvals.
7. Follow the current task’s logs. Every build and review requires a structured tool event. Real file checks and npm exit codes gate review. Failed checks go back to the builder. The reviewer must return pass/fail plus evidence for every criterion; missing, malformed, contradictory or incomplete verdicts cannot pass. A rejected review sends its findings back for repair.
8. Passing work becomes **Ready for your review**. Inspect the website and evidence, then **Accept delivery** or **Request changes**. Client feedback invalidates the previous run approval and requires a new one. Download the combined **Evidence report** at any time. Deployment is a separate action.

**Stop cycle** cancels the current step and prevents the next one. Locks remain held until its process exits. A restart blocks interrupted deliveries for review rather than silently resuming them. An active delivery reserves its project against unrelated coding/check jobs until acceptance or requested changes. Project folders cannot change during a cycle. The brief, connection snapshots, project path, route/model and gateway URL are fixed for an approved cycle; later connection edits do not silently change its scope. **Revise brief** creates a new draft while preserving the original history.

A review is an AI assessment, not a correctness guarantee. Tool activity alone does not establish truth; a file-existence check alone does not establish a working website. Unverifiable visual/behavior requirements must be reported as failed. Use meaningful independent tests and inspect the result yourself before acceptance. Provider failures, missing tools, malformed verdicts and exhausted repair limits stop for attention. There is no automatic deployment, external write approval, model-spend budget, or automatic service-account sign-in in this cycle.

## Extending connections

Connections support two adapters:

- **Reference:** a URL and/or project-relative file path plus context. Categories cover GitHub, Figma, files, CMS, databases, deployment, APIs, MCP and other tools. Service authentication is not implied. URLs can include ordinary design/frame parameters, but embedded credentials and recognized authentication token parameters are rejected. Private configuration directories and parent-directory paths are rejected for local references.
- **MCP:** an installed stdio command with a JSON argument array, or a Streamable HTTP endpoint, and an exact allowlist of read tool names. Connections are configured per builder process. Codex receives `mcp_servers` overrides and `enabled_tools`; Claude receives `--mcp-config`, `--strict-mcp-config` and explicit `--allowedTools`. Neither adapter rewrites global CLI settings. Review sessions receive no delivery-added MCP servers. Existing CLI/account policies still apply.

MCP servers, packages and accounts must be installed/configured separately. Saving a connection does not start it or independently verify its tools. Choose only read tools: the server controls their actual behavior, and the allowlist is not proof that a tool has no side effects. Credentials belong in locally configured services/CLI environment or an authenticated local proxy, never connection URLs, command arguments, notes or the client brief. HTTP connections do not provide an OAuth sign-in flow or custom authentication headers. Reference-only CMS/database/deployment cards are not native service clients.

For additional verification integrations, expose a finite npm script in the client project. It can run your existing browser tests, accessibility tests, schema checks, or other tools; its output becomes delivery evidence. Arbitrary deployment/start/dev scripts are not suitable verification steps. The app blocks those common script names, but cannot inspect all effects of arbitrary project code.

Implementation follows [Codex MCP configuration](https://developers.openai.com/codex/mcp) and [Claude CLI configuration](https://code.claude.com/docs/en/cli-reference). MCP argument generation is tested with local fixtures; external service authentication and tool execution require a configured server and a separately approved real delivery run.

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

Ordinary CLI tasks, retries and scheduled runs require individual approval in this app. Client deliveries have an explicit approval covering the bounded build/check/review/repair cycle shown in its scope screen. Approval covers whole tasks or the scoped cycle, not each individual tool call. Codex runs with its selected sandbox and `approval_policy="never"`, so requests that need elevated permissions cannot obtain them interactively. Claude receives an explicit file-tool allowlist and, for an approved delivery builder, its selected MCP read tools; shell execution is unavailable through that integration. Provider/project configuration can still affect CLI behavior.

After cancellation, the task shows **Stopping previous run…** until its process exits. Retrying is disabled during that interval so output from the old process cannot overwrite a fresh approval. A CLI that exits without a non-empty assistant report is marked failed, and later workflow steps stay on hold. Startup messages and diagnostic logs do not count as a report. A report still requires your review for correctness.

AI runs send instructions and any context the CLI reads to the configured provider, subject to that provider's settings. Task records and reports are stored locally. The app does not enforce a model-spend budget. A 15-minute run limit, cancellation, and a maximum of two concurrent jobs bound execution. AI coding jobs on the same project are serialized; each agent runs one task at a time.

## Routines and persistence

- Routines use elapsed intervals of 1 minute to 30 days. Enter a custom number of minutes or select an hourly, 6-hourly, daily, or weekly suggestion.
- **Edit routine** changes future task instructions, agent, model route, access mode and interval. Existing tasks and their pending approvals keep their original settings. Changing the interval starts a new countdown. The routine card links to its latest run.
- The scheduler polls every 15 seconds while the server is running. This is not an OS background service.
- An overdue routine runs once after downtime; missed intervals are not replayed.
- An unfinished routine task prevents duplicate runs. Disabled agents do not accept new tasks.
- SQLite stores projects, client briefs and delivery attempts, connection definitions and snapshots, agents, tasks, workflows, approvals, logs, notes, routines, artifacts, and activity.
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

`server.mjs` contains the API, queue, scheduler, reports, and adapters. `delivery.mjs` contains the client delivery state machine, verdict gate, connection configuration, and recorded check runner. `public/app.js` renders the dashboard and handles forms and live updates. `public/style.css` contains the responsive visual system.

The server binds only to loopback, validates Host and Origin, requires JSON mutations, serves an explicit asset allowlist, and escapes untrusted content in the UI. It has no multi-user authentication and is intended for a single user's trusted machine. Keep its database private: logs and reports can contain project information.

## Verify

```sh
npm run check
npm test
```

Tests exercise real local reports and downloads, dependencies, routines and edits, persistence, priority ordering, workflow handoffs and separate approvals, pause/resume, failed-step recovery, folder reconnection, origin and input validation, cancellation, stream parsing, CLI permission arguments, gateway discovery/authentication, routing isolation, endpoint pinning, gateway startup isolation, and credential redaction. Delivery tests additionally exercise real npm checks, rejected-review repair loops, final owner acceptance, malformed verdicts, repair exhaustion, recorded-tool requirements, connector validation/snapshots, route pinning, stop controls, restart handling and symlink boundaries. Provider integration tests use local fixture executables and make **no model calls**. Live provider authentication and generation require a user-approved run.

CLI integration references: [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive) and [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference). Installed CLI help was checked during implementation.

## Scope

This version supports persistent and bounded client-delivery automation, human-directed tasks, follow-ups, sequential workflows, recurring local work, references and per-run MCP read-tool connections. It does not provide unlimited autonomous project management, agent-to-agent API access, interactive terminal panes, Git worktree management, SSH execution, native service-account management, automatic cloud deployment, network-device access, or a credential vault.

### Persistent missions (0.5)

Choose **Start with an aim**, add your references, select the client project, and press **Start & watch live**. New UI and CLI missions default to persistent mode: plan → build → recorded checks → independent review → repair, until all criteria pass and the result awaits your acceptance. The original aim, derived criteria, phase checkpoints, logs, checks and review history stay with the mission.

Persistent mode allows up to 100 repairs and three recoveries within a default 12-hour elapsed time budget (maximum 24 hours). Transient 429/502/503/504 and connection failures retry after 15/30/60 seconds. Missing credentials, quota/billing failures, tool denials, invalid evidence and five reviews failing the same criteria require attention. Stop cancels the current process and any scheduled recovery. Passing review never means automatic client acceptance or publication. Model charges are controlled by your provider account; the time/run limits are not a monetary budget.

If the app restarts, persistent missions with a saved approval and unexpired time budget recover their interrupted phase, within the remaining recovery allowance. They retain their approved project, model endpoint and connection snapshots. Bounded missions require an explicit restart. Keys entered in the UI last only for the server session; set the environment variables below for recovery after restart. The computer and app must remain running; this is not an external background hosting service. Existing bounded deliveries retain their selected limits.

```sh
npm run aim -- "Build the complete client website from docs/brief.md" --project /path/to/client --ref docs/brief.md --minutes 720
# Optional: a short run instead
npm run aim -- "Your aim" --bounded --repairs 3 --minutes 120
```

### OpenRouter, OmniRoute and OpenClaw

- **OpenRouter:** Model routing → Provider → OpenRouter. Set your API key, save and test the catalog, choose an exact model ID, then select OpenRouter in mission settings. Uses the installed Codex CLI with the Responses API and a process-scoped provider; global Codex configuration is unchanged. Claude should use OmniRoute instead. Configure `OPENROUTER_API_KEY` in the ignored `.env` file for restarts. A listed model is not proof of tool/Responses compatibility, free quota or a successful coding run. See [OpenRouter's Codex integration](https://openrouter.ai/docs/cookbook/coding-agents/codex-cli).
- **OmniRoute:** Select OmniRoute on Model routing, start the installed gateway with `npm run gateway`, and connect its local `/v1` URL. Choose your existing model or fallback combo. Provider credentials and fallback strategies live in OmniRoute. Select the desired gateway before starting a mission; active missions retain their approved endpoint. See [OmniRoute](https://www.omniroute.online/).
- **OpenClaw:** Run and configure your own local OpenClaw gateway. Connections → Add → OpenClaw. Use `http://127.0.0.1:18789`, optionally enter its gateway token, and select `web_search`, `web_fetch`, `memory_search`, `memory_get`, and/or `browser`. Select that connection when starting the mission. The bundled stdio MCP bridge invokes OpenClaw's documented `/tools/invoke` endpoint, using its own tool policy. Only selected inspection tools are exposed; OpenClaw keeps its underlying service credentials. `OPENCLAW_GATEWAY_TOKEN` (or `OPENCLAW_GATEWAY_PASSWORD`) enables authentication after restart. Only one OpenClaw gateway is supported per mission. See [OpenClaw's tool API](https://docs.openclaw.ai/gateway/tools-invoke-http-api).

The OpenClaw bridge uses its dedicated `openclaw` browser profile for status, tabs, opening/navigating pages, snapshots and screenshots. It does not expose arbitrary shell commands, sending messages, approval overrides or browser interaction actions. Run interaction, accessibility and responsive tests through the client project's finite npm verification scripts (for example Playwright). Gateway policy can deny any tool; failures are reported, never treated as proof of success. Installing Ultharness does not install or authenticate OpenClaw or OpenRouter. Both the builder and the separate review session can use the selected inspection bridge. Browser support and configured tool access must actually work before visual criteria can pass.

To combine all three, connect OpenRouter as a provider inside OmniRoute, select the OmniRoute model/combo for the mission, and attach the OpenClaw connection. Alternatively select OpenRouter directly when you want to bypass the local model router. Ultharness owns the completion loop; the gateways supply model routing and tools.

Desktop users: place restart credentials in `~/Library/Application Support/Ultharness/settings.env` instead of the source checkout’s `.env`. This file is read by the desktop launcher and must stay private.
