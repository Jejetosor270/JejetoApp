"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClassName } from "@/components/master-data/form-ui";
import { manageErpConnectionAction } from "./connection-actions";
import { formatTimestamp } from "@/domain/payments/dates";
import type { ErpConnectionScope } from "@/lib/erp-connection/auth";

interface ConnectionStatus {
  enabled: boolean;
  token: {
    id: string;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
  } | null;
}

export function ConnectionPanel({
  initialStatus,
  endpoint,
  scope = "READ_ONLY",
}: {
  initialStatus: ConnectionStatus;
  endpoint: string | null;
  scope?: ErpConnectionScope;
}) {
  const cashAccess = scope === "CASH_WRITE";
  const [status, setStatus] = useState(initialStatus);
  const [secret, setSecret] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [revokeConfirmation, setRevokeConfirmation] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const busy = useRef(false);
  const token = status.token;
  const active =
    token &&
    !token.revokedAt &&
    new Date(token.expiresAt).getTime() > checkedAt;

  async function change(action: "create" | "revoke") {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await manageErpConnectionAction(
        action === "create"
          ? { action, confirmed, scope }
          : { action, confirmed: true, tokenId: token?.id, scope },
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.status) setStatus(result.status);
      setCheckedAt(Date.now());
      setSecret(result.secret ?? "");
      setRevealed(false);
      setConfirmed(false);
      setRevokeConfirmation(false);
      setMessage(
        action === "create"
          ? "Credentials created. Copy them before leaving this page."
          : "Access revoked.",
      );
    } catch {
      setError(
        "Unable to reach the server. Refresh to check the connection before retrying.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret);
      setMessage(
        "Credentials copied. Keep them out of chats and source files.",
      );
    } catch {
      setRevealed(true);
      setError("Copy is unavailable. Select the key and copy it manually.");
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h3 className="font-medium">
        {cashAccess ? "Approved cash actions" : "Read access"}
      </h3>
      <p className="text-muted-foreground text-sm">
        {cashAccess
          ? "Record or correct supplier payments and client receipts after reviewing and approving each change. Bank transfers are not enabled. Your read-only key remains separate."
          : "Connect your Codex desktop to ERP records and financial reports. Selected data will enter your AI conversation. This connection cannot change records or record payments."}
      </p>
      {endpoint ? (
        <Field
          label={cashAccess ? "Cash service address" : "Connection address"}
        >
          <input className={inputClassName} readOnly value={endpoint} />
        </Field>
      ) : (
        <p role="status" className="text-muted-foreground text-sm">
          Connection address is not configured.
        </p>
      )}
      <p className="text-sm">
        {active ? "Access enabled" : "No active key"}
        {token ? ` · Expires ${formatTimestamp(token.expiresAt)}` : ""}
      </p>
      {secret ? (
        <div className="bg-muted/40 space-y-3 rounded-md border p-4">
          <Field
            label={
              cashAccess ? "Private credential bundle" : "Private access key"
            }
          >
            <input
              className={`${inputClassName} font-mono`}
              type={revealed ? "text" : "password"}
              readOnly
              autoComplete="off"
              spellCheck={false}
              value={secret}
            />
          </Field>
          <p className="text-muted-foreground text-xs">
            Available here only once. It expires after 30 days. Replacing it
            revokes only the previous key for this access type.
            {cashAccess
              ? " The bundle includes the private approval key for your desktop connection; never paste it into a chat."
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={copySecret}>
              Copy key
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? "Hide key" : "Show key"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSecret("");
                setMessage("");
              }}
            >
              Dismiss key
            </Button>
          </div>
        </div>
      ) : null}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void change("create");
        }}
      >
        <label className="flex items-start gap-2 text-sm">
          <input
            className="mt-0.5"
            type="checkbox"
            checked={confirmed}
            disabled={pending || !endpoint}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            {cashAccess
              ? "Allow approved cash actions. Replace only the existing cash-action credentials."
              : "Allow read access to ERP records. Replace only the existing read-only key."}
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !confirmed || !endpoint}>
            {active ? "Replace key" : "Create key"}
          </Button>
          {active ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setRevokeConfirmation(true)}
            >
              Revoke access
            </Button>
          ) : null}
        </div>
      </form>
      {revokeConfirmation ? (
        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm">
            Stop this connection? ERP records remain unchanged.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void change("revoke")}
            >
              Confirm revoke
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setRevokeConfirmation(false)}
            >
              Keep access
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {cashAccess
          ? "Uses the local approval bridge, not a direct remote MCP connection. Each change needs a fresh approval; creating credentials does not record any payment."
          : "Codex desktop only for this version. Browser ChatGPT login is not enabled."}
      </p>
    </div>
  );
}
