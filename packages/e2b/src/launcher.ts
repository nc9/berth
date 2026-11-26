/** Single-quotes a string for POSIX sh. */
export function shellQuote(s: string): string {
  return `'${s.replaceAll("'", `'\\''`)}'`;
}

/**
 * A POSIX sh script that starts `argv` detached: output to `logPath`, exit
 * code to `exitPath` (written atomically, so its presence means "exited").
 * The log file exists before the script returns.
 */
export function buildLauncher(o: {
  argv: string[];
  logPath: string;
  exitPath: string;
  cwd?: string;
  timeoutSec?: number;
}): string {
  const cmd = o.argv.map(shellQuote).join(" ");
  const timed =
    o.timeoutSec !== undefined
      ? `timeout ${Math.max(1, Math.ceil(o.timeoutSec))} ${cmd}`
      : cmd;
  const cd = o.cwd !== undefined ? `cd ${shellQuote(o.cwd)} && ` : "";
  const log = shellQuote(o.logPath);
  const exit = shellQuote(o.exitPath);
  const inner = `${cd}${timed}; echo $? > ${exit}.tmp; mv ${exit}.tmp ${exit}`;
  return [
    `mkdir -p "$(dirname ${log})"`,
    `rm -f ${exit}`,
    `: > ${log}`,
    `nohup sh -c ${shellQuote(inner)} > ${log} 2>&1 < /dev/null &`,
  ].join("\n");
}
