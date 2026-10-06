export function parsePort(rawPort: string | undefined): number {
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

  return port;
}
