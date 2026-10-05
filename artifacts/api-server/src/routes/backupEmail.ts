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

type SendWindow = { count: number; resetAt: number };
type ProviderError = { code?: string; message?: string };

const sendWindows = new Map<string, SendWindow>();
const EMAIL_ADDRESS = /^[^\s@]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,}$/i;

function isEmailAddress(value: string): boolean {
  return value.length <= 254 && EMAIL_ADDRESS.test(value.trim());
}

function sanitizeProviderMessage(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email address]')
    .replace(/\b(?:re|rk|sk)_[A-Z0-9_-]{8,}\b/gi, '[credential]')
    .slice(0, 300);
}

async function readProviderError(response: Response): Promise<ProviderError> {
  try {
    const body: unknown = await response.clone().json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
    const value = body as Record<string, unknown>;
    const code = typeof value.name === 'string' ? value.name : typeof value.code === 'string' ? value.code : undefined;
    const message = typeof value.message === 'string' ? sanitizeProviderMessage(value.message) : undefined;
    return { ...(code ? { code } : {}), ...(message ? { message } : {}) };
  } catch {
    return {};
  }
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

class BackupEmailDeliveryError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

async function checkResendAvailability(): Promise<{ available: boolean; issue?: 'invalid_credentials' | 'unavailable' }> {
  try {
    const response = await new ReplitConnectors().proxy('resend', '/domains', { method: 'GET' });
    if (response.ok) return { available: true };

    const providerError = await readProviderError(response);
    const invalidCredentials = /api key.{0,20}invalid|invalid.{0,20}api key/i.test(providerError.message ?? '');
    logger.warn(
      { statusCode: response.status, providerCode: providerError.code },
      'Resend connection is unavailable',
    );
    return { available: false, issue: invalidCredentials ? 'invalid_credentials' : 'unavailable' };
  } catch (error) {
    logger.warn(
      { errorType: error instanceof Error ? error.name : 'UnknownError' },
      'Resend availability check failed',
    );
    return { available: false, issue: 'unavailable' };
  }
}

async function sendWithResend(fromEmail: string, toEmail: string, backupJson: string): Promise<void> {
  if (!isEmailAddress(fromEmail) || !isEmailAddress(toEmail)) {
    throw new BackupEmailDeliveryError(400, 'Enter valid sender and recipient email addresses in this person’s profile.');
  }

  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    body: {
      from: fromEmail.trim(),
      to: [toEmail.trim()],
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
    const providerError = await readProviderError(response);
    logger.error(
      { statusCode: response.status, providerCode: providerError.code, providerMessage: providerError.message },
      "Resend rejected a person backup email",
    );
    if (/api key.{0,20}invalid|invalid.{0,20}api key/i.test(providerError.message ?? '')) {
      throw new BackupEmailDeliveryError(503, 'The Resend API key is invalid. Update the existing Resend connection in Replit, then try again.');
    }
    if (/not verified|verified domain|domain.*verify/i.test(providerError.message ?? '')) {
      throw new BackupEmailDeliveryError(422, 'This person’s sender address must use a domain verified in the connected Resend account.');
    }
    throw new BackupEmailDeliveryError(502, 'Resend rejected this backup. Check this person’s sender and recipient addresses and the Resend connection.');
  }
}

router.get('/backup/email/status', async (_req, res) => {
  res.json(GetBackupEmailStatusResponse.parse(await checkResendAvailability()));
});

router.post("/backup/email", async (req: Request, res) => {
  const parsed = SendPersonBackupEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "The backup request is invalid." });
    return;
  }

  const { backupJson, fromEmail, toEmail } = parsed.data;
  if (!isEmailAddress(fromEmail) || !isEmailAddress(toEmail)) {
    res.status(400).json({ message: 'Enter valid sender and recipient email addresses in this person’s profile.' });
    return;
  }
  if (Buffer.byteLength(backupJson, "utf8") > MAX_BACKUP_BYTES) {
    res.status(413).json({ message: "This person backup exceeds 5 MB." });
    return;
  }
  if (!isBackupJson(backupJson)) {
    res.status(400).json({ message: "Choose a valid Routine Flow person backup." });
    return;
  }

  const slot = takeSendSlot(req.ip || req.socket.remoteAddress || "unknown");
  if (!slot.allowed) {
    res.setHeader("Retry-After", String(slot.retryAfterSeconds));
    res.status(429).json({ message: "Too many backup emails. Please wait before sending another." });
    return;
  }

  try {
    await sendWithResend(fromEmail, toEmail, backupJson);
    res.json(SendPersonBackupEmailResponse.parse({ sent: true }));
  } catch (error) {
    if (error instanceof BackupEmailDeliveryError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    logger.error(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Person backup email delivery failed",
    );
    res.status(502).json({ message: 'The email service could not send this backup. Check the Resend connection and this person’s email settings.' });
  }
});

export default router;