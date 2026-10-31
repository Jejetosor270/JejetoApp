# Private ERP connection

This version connects **Codex desktop** to the ERP through a private, read-only
Streamable HTTP MCP endpoint at `/api/mcp`. Phase 2 adds a separate local bridge
for explicitly approved cash changes. Browser ChatGPT OAuth and autonomous
financial actions are not enabled. JejetoBot remains unchanged.

## Available tools

| Tool                      | Purpose                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| `get_connection_info`     | Check identity and read-only capabilities without retrieving financial records |
| `search_records`          | Find Projects, Orders, Billing, Clients and Suppliers                          |
| `list_records`            | Filter and page operational lists                                              |
| `get_project_financials`  | Read the figures and explanations used by Project Details                      |
| `get_payment_terms`       | Read an Order or Billing document's terms and cash-history links               |
| `get_cash_forecast`       | Read a Project's 7/30/90-day outlook and forecast gaps                         |
| `get_financial_attention` | Read a Project's payment, invoice and supporting checks                        |
| `get_workflow_help`       | Read curated ERP workflow guidance                                             |

Tools reuse the existing services. Monetary results retain Decimal strings,
currencies, incompleteness, source links and an as-of timestamp. Forecasts separate
issued and planned receipts. Record labels/descriptions are untrusted data, never
instructions. Search ambiguity requires clarification. List pages and evidence
limits are explicit; a partial result must never be presented as the whole scope.
Financial attention includes personally snoozed checks and is not the personalized
Home list. The connector can read all operational records accessible to its owner;
it does not introduce per-Project permissions.

## Controlled rollout

1. Review and commit the implementation through the usual GitHub workflow.
2. Apply prepared migration `20261031000000_erp_read_connection` with
   `npm run db:deploy` in the intended environment. This command applies **all**
   outstanding migrations: inspect the deployment's migration state first. Do not
   run it as part of an application build.
3. Configure `ERP_MCP_OWNER_ID` with the intended active ADMIN employee UUID and
   `ERP_MCP_ORIGIN` with the canonical HTTPS application origin, without a path.
   The Settings connection section displays the signed-in administrator's ID for
   setup. These settings are server-only. Missing configuration disables access;
   never substitute the first administrator or trust an email supplied by a tool.
4. Deploy the reviewed code. Preview and production are separate environments;
   choose the origin and database deliberately. Do not connect a preview to live
   data merely to run a test.
5. As the configured owner, open **Settings → AI connection**. Confirm read access
   and choose **Create key**. Copy the masked key directly into secure local
   credential configuration. It is returned once, never saved in browser storage,
   and expires in 30 days. Never paste it into this chat, a tracked file or a URL.
6. Supply the key to the desktop process as `MB_ERP_MCP_TOKEN`. A shell environment
   variable does not automatically reach an already-running desktop app. Use the
   desktop's supported private credential setup or launch environment, then restart
   the connection. Do not put the literal credential in tracked configuration.

Register the deployed endpoint using the installed Codex MCP command, replacing
the example origin with the configured application origin:

```sh
codex mcp add mb-erp --url https://erp.example.com/api/mcp --bearer-token-env-var MB_ERP_MCP_TOKEN
```

Equivalent non-secret local MCP configuration:

```toml
[mcp_servers.mb-erp]
url = "https://erp.example.com/api/mcp"
bearer_token_env_var = "MB_ERP_MCP_TOKEN"
default_tools_approval_mode = "prompt"
tool_timeout_sec = 60
```

No OpenAI API key or extra model call is needed on the ERP side. The current
Codex conversation uses the tools; unlike JejetoBot's planner-only boundary,
**selected ERP records and financial figures are shared with the conversation**.

On macOS, the desktop connection can instead use a private Keychain entry and a
local `http_headers_helper`. The helper reads the key without displaying it and
returns the Authorization header directly to Codex. Configure the helper's
absolute local path, never the credential, and omit `bearer_token_env_var` when
using this approach. Keep `default_tools_approval_mode = "prompt"`. The helper
and Keychain entry are machine-local, not repository files; restart the MCP
connection after configuration. This avoids relying on the launch environment
of an already-running desktop app.

## Live connection and approval check

After deployment/configuration, refresh the desktop connection and request only
`get_connection_info`. With approval mode `prompt`, verify an actual host approval
control appears; deny once, then retry and explicitly allow. Confirm the employee
identity and `financialWrites: false`. Then try one known record search and compare
one Project figure with its ERP page. Revoke the key in Settings and confirm the
next call is denied. Create a replacement key only if access should remain enabled.

This live check is **not completed by local tests**. It requires the deployed
endpoint, the owner's credential and the actual desktop host. A successful
read-tool prompt does not establish a durable authorization mechanism for money
changes. Phase 2 must bind approval to an exact, expiring proposal, recheck current
versions/permissions/balances, and prevent duplicate execution. This Phase 1 key
must never silently gain write access. No model-supplied `approved: true` flag may
replace a trusted approval.

## Security and operations

- Only the explicitly configured, active, credentialed ADMIN can create or use a
  key. Each HTTP request and tool invocation revalidates the owner and credential;
  access is checked again before returning a potentially slow read.
- The database stores a SHA-256 digest of a cryptographically random key, never
  the raw key. A serializable, audited rotation revokes earlier keys. Revocation,
  expiry, account deactivation/deletion, demotion or owner reconfiguration denies
  access. Read keys never grant writes; cash credentials are separate.
- Requests require a Bearer header. ERP cookies and query-string credentials do
  not authenticate this endpoint. Cross-origin requests are rejected; private
  responses are not cached. There is no public/no-auth data tool.
- Stateless JSON responses work without durable runtime memory or local files.
  The SDK handles the MCP protocol. Requests and results have size limits;
  in-instance request/concurrency guards are burst protection, not a distributed
  rate-limit guarantee. No source documents or conversation transcripts are stored.
- Safe failure logs contain fixed categories, never authorization headers, tool
  arguments, record contents, raw exceptions or financial results. Connection
  creation/revocation enters existing Activity history without key material.
- Record writes use the same guarded transaction services as the ERP. The
  connector has no arbitrary SQL, URL-fetching or command-execution tool.

## Phase 2: approved cash changes

The read connection was activated in production on 2026-10-31. The Phase 2 cash
implementation and migration are prepared locally; they are **not yet deployed
or activated**. Do not infer migration state for another environment from this
rollout note.

| Action                  | Scope                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Record Supplier payment | Full remaining or partial payment on one selected Order term                       |
| Record Client receipt   | Full remaining or partial receipt on an issued Invoice; optionally a selected term |
| Correct cash record     | Amount, actual date/FX, reference or notes; original assignment retained           |
| Cancel cash record      | Reason required; original record goes to recoverable Trash                         |

`REMAINING` is resolved to an exact amount when preparing the proposal. It never
means a balance recomputed after approval. Draft/planned Client Invoices must be
issued in the ERP first. Invalid, cancelled, unassigned, ambiguous, overpaid or
stale records fail closed. Actual foreign-currency cash requires manual FX.
Bank transfers, refunds, moving cash between records, creating terms, Orders,
Billing and allocations are outside this phase.

### Approval flow

1. Use existing read tools to identify the exact record and payment term.
2. `prepare_cash_change` validates the proposed change and stores a typed,
   15-minute proposal. No payment or receipt is recorded at this step.
3. `approve_cash_change` retrieves the server review and opens a native form
   showing the Project, counterparty, record, term, before/after amounts, date,
   actual FX and remaining balance. Confirmation defaults to unchecked.
4. Only an accepted form with confirmation checked signs that exact proposal.
   The server verifies the signature and current owner/key/balances/versions,
   then writes cash and audit records in one transaction.
5. The result links to the saved cash record. Retrying the same proposal returns
   the existing result even if the first response was lost. A changed record
   requires a new proposal and approval.

Ordinary tool-call permission is not financial approval. Neither a model argument
nor a chat message saying “approved” can replace the native form. The private
signing key and local bridge/host are the trust boundary: the signature proves
authorization by that bridge, not independently that a human viewed the form.
Keep both cash credentials in secure local storage and out of chats, logs and
tracked files. Revoking the cash key also invalidates its pending approvals.

### Cash rollout

1. Review the code. Inspect pending migrations, then apply
   `20261031010000_erp_cash_connection` with the normal controlled
   `npm run db:deploy` step. This command applies all outstanding migrations;
   it must not run during every build. The new code depends on this migration.
2. Deploy reviewed code with the existing `ERP_MCP_OWNER_ID` and `ERP_MCP_ORIGIN`.
   No new server environment variable or OpenAI key is needed.
3. In **Settings → AI connection → Approved cash actions**, create a separate cash
   key. Securely copy its one-time JSON credential bundle into an OS credential
   store. The bundle contains `token` and `approvalPrivateKey`; never paste either
   into a conversation. Existing read access remains unchanged.
4. Register `scripts/erp-cash-bridge.ts` as a local STDIO MCP server, launched with
   the installed `tsx` runtime. Set its working directory to the repository root.
   `npm run erp:cash-bridge --silent` is an equivalent local launch command.
   Configure `ERP_MCP_ORIGIN` and an absolute `MB_ERP_CASH_CREDENTIALS_HELPER` path.
   The helper must output only the private JSON bundle to the bridge, accept no
   arguments and read secure OS storage. It is machine-local, never committed.
   `MB_ERP_CASH_CREDENTIALS` is an alternative private process environment input.
5. Keep the existing `mb-erp` read server. The new local server is `mb-erp-cash`;
   use prompted tool approval and a tool timeout longer than the five-minute
   native confirmation window. Restart the desktop MCP connection.
6. Verify the actual desktop native approval control with a disposable test
   record/environment: decline/cancel first and check that no cash appears, then
   approve once and retry the same proposal to verify one cash record and its
   audit. Revoke cash access and verify denial. No production cash test is implied
   by deployment approval; choose any real financial action explicitly.

The local bridge is required because the deployed read MCP server uses stateless
HTTP responses. Native approval needs the desktop's bidirectional MCP session;
serverless execution must not depend on persistent in-memory approval state.
Unsupported form elicitation fails closed. Automated bridge/proposal tests use
fictional fixtures and do not consume live model credits or write production cash.

Only metadata for reviewed proposals is stored, with normalized typed amounts and
references. Proposals are pending commands, never a second cash/reporting source.
No document binary, conversation transcript or model-generated SQL is persisted.

Official references: [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp),
[MCP tool design](https://developers.openai.com/plugins/build/mcp-server),
[OAuth for a later hosted connection](https://developers.openai.com/plugins/build/auth).
