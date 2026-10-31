"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClassName } from "@/components/master-data/form-ui";
import { manageErpConnectionAction } from "./connection-actions";
import { formatTimestamp } from "@/domain/payments/dates";

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
}: {
  initialStatus: ConnectionStatus;
  endpoint: string | null;
}) {
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
          ? { action, confirmed }
          : { action, confirmed: true, tokenId: token?.id },
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
          ? "Key created. Copy it before leaving this page."
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
      setMessage("Key copied. Keep it out of chats and source files.");
    } catch {
      setRevealed(true);
      setError("Copy is unavailable. Select the key and copy it manually.");
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-muted-foreground text-sm">
        Connect your Codex desktop to ERP records and financial reports.
        Selected data will enter your AI conversation. This connection cannot
        change records or record payments.
      </p>
      {endpoint ? (
        <Field label="Connection address">
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
          <Field label="Private access key">
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
            revokes the previous key.
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
            Allow read access to ERP records. Replace any existing connection
            key.
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
        Codex desktop only for this version. Browser ChatGPT login and approved
        financial actions are not enabled.
      </p>
    </div>
  );
}
