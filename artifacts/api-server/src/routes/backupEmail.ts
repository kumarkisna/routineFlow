import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  GetBackupEmailStatusResponse,
  SendPersonBackupEmailBody,
  SendPersonBackupEmailResponse,
} from "@workspace/api-zod";
import { Router, type IRouter, type Request } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const MAX_BACKUP_BYTES = 5_000_000;
const SEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_IP_PER_WINDOW = 3;

type EmailConfig = { from: string | null; to: string | null };
type SendWindow = { count: number; resetAt: number };

const sendWindows = new Map<string, SendWindow>();

function isEmailAddress(value: string | undefined): value is string {
  if (!value || value.length > 254 || /\s/.test(value)) return false;
  return /^[^\s@]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,}$/i.test(value);
}

function readEmailConfig(): EmailConfig {
  const from = process.env.ROUTINE_BACKUP_FROM_EMAIL?.trim();
  const to = process.env.ROUTINE_BACKUP_TO_EMAIL?.trim();
  return {
    from: isEmailAddress(from) ? from : null,
    to: isEmailAddress(to) ? to : null,
  };
}

function maskEmailAddress(address: string): string {
  const at = address.lastIndexOf("@");
  return `${address.slice(0, 1)}***${address.slice(at)}`;
}

function isBackupJson(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const backup = parsed as Record<string, unknown>;
    return backup.format === "routine-flow-routines"
      && Number.isSafeInteger(backup.version)
      && Array.isArray(backup.routines);
  } catch {
    return false;
  }
}

function takeSendSlot(ip: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const current = sendWindows.get(ip);
  if (!current || current.resetAt <= now) {
    if (sendWindows.size > 1000) {
      for (const [key, entry] of sendWindows) {
        if (entry.resetAt <= now) sendWindows.delete(key);
      }
    }
    sendWindows.set(ip, { count: 1, resetAt: now + SEND_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= MAX_SENDS_PER_IP_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

async function sendWithResend(config: EmailConfig, backupJson: string): Promise<void> {
  if (!config.from || !config.to) throw new Error("Backup email is not configured.");

  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    body: {
      from: config.from,
      to: [config.to],
      subject: "Your Routine Flow person backup",
      text: "Your Routine Flow person backup is attached as a JSON file.",
      attachments: [{
        filename: `routine-flow-person-backup-${new Date().toISOString().slice(0, 10)}.json`,
        content: Buffer.from(backupJson, "utf8").toString("base64"),
        content_type: "application/json",
      }],
    },
  });

  if (!response.ok) {
    logger.error({ statusCode: response.status }, "Resend rejected a person backup email");
    throw new Error("Resend could not send the backup.");
  }
}

router.get("/backup/email/status", (_req, res) => {
  const config = readEmailConfig();
  const data = GetBackupEmailStatusResponse.parse({
    configured: Boolean(config.from && config.to),
    ...(config.to ? { recipientHint: maskEmailAddress(config.to) } : {}),
  });
  res.json(data);
});

router.post("/backup/email", async (req: Request, res) => {
  const parsed = SendPersonBackupEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "The backup request is invalid." });
    return;
  }

  const { backupJson } = parsed.data;
  if (Buffer.byteLength(backupJson, "utf8") > MAX_BACKUP_BYTES) {
    res.status(413).json({ message: "This person backup exceeds 5 MB." });
    return;
  }
  if (!isBackupJson(backupJson)) {
    res.status(400).json({ message: "Choose a valid Routine Flow person backup." });
    return;
  }

  const config = readEmailConfig();
  if (!config.from || !config.to) {
    res.status(503).json({ message: "Email backup is not configured for this app." });
    return;
  }

  const slot = takeSendSlot(req.ip || req.socket.remoteAddress || "unknown");
  if (!slot.allowed) {
    res.setHeader("Retry-After", String(slot.retryAfterSeconds));
    res.status(429).json({ message: "Too many backup emails. Please wait before sending another." });
    return;
  }

  try {
    await sendWithResend(config, backupJson);
    res.json(SendPersonBackupEmailResponse.parse({ sent: true }));
  } catch (error) {
    logger.error(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Person backup email delivery failed",
    );
    res.status(502).json({ message: "The email service could not send this backup. Check the Resend sender configuration and try again." });
  }
});

export default router;