import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (
  !/^\d+$/.test(rawPort) ||
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
) {
  throw new Error(
    `Invalid PORT value: "${rawPort}". Expected a whole-number TCP port from 1 to 65535.`,
  );
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err: NodeJS.ErrnoException) => {
  const message =
    err.code === "EADDRINUSE"
      ? `Port ${port} is already in use`
      : `Failed to listen on port ${port}`;
  logger.error({ err, port }, message);
  process.exitCode = 1;
});
