import app from "./app";
import { logger } from "./lib/logger";
import { parsePort } from "./port";

const port = parsePort(process.env["PORT"]);
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
