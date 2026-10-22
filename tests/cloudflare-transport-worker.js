// Local test entrypoint only. Production wrangler.jsonc points to cloudflare/worker.js.
import {
  HardbondWorkspace as Workspace,
  sendPush,
} from "../cloudflare/worker.js";

export class HardbondWorkspace extends Workspace {
  verifyRollback() {
    this.store.db.exec(
      "CREATE TABLE IF NOT EXISTS rollback_probe (id INTEGER PRIMARY KEY)",
    );
    try {
      this.store.db.transaction(() => {
        this.store.db.prepare("INSERT INTO rollback_probe VALUES(?)").run(1);
        throw new Error("Expected transaction failure");
      });
    } catch (error) {
      if (error.message !== "Expected transaction failure") throw error;
    }
    return this.store.db
      .prepare("SELECT count(*) AS count FROM rollback_probe")
      .get().count;
  }
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/api/rollback")
      return Response.json({
        count: await env.HARDBOND.getByName("rollback-test").verifyRollback(),
      });
    const {
      subscription,
      payload,
      vapidDetails,
      status = 201,
    } = await request.json();
    let captured;
    try {
      await sendPush(
        subscription,
        payload,
        { vapidDetails, TTL: 60 },
        async (url, init) => {
          captured = {
            url,
            method: init.method,
            headers: Object.fromEntries(init.headers),
            body: Buffer.from(init.body).toString("base64"),
          };
          return new Response(null, { status });
        },
      );
      return Response.json({ captured });
    } catch (error) {
      return Response.json({ captured, statusCode: error.statusCode });
    }
  },
};
