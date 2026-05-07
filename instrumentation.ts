/**
 * Next.js boot hook — runs once per Node.js server process.
 * Used to start in-process crons (watch renewal, pending booking retries).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCrons } = await import("./lib/cron");
    startCrons();
  }
}
