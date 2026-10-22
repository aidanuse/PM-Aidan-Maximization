import { HttpError } from "../server/store-core.js";

// A small Fetch adapter for the existing calendar/integration route handlers.
export class Router {
  routes = [];
  add(method, pattern, handlers) {
    const names = [];
    const expression = pattern
      .split(/(:[A-Za-z_][A-Za-z_0-9]*)/)
      .map((part) => {
        if (part.startsWith(":")) {
          names.push(part.slice(1));
          return "([^/]+)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    this.routes.push({
      method,
      regex: new RegExp(`^${expression}$`),
      names,
      handlers,
    });
  }
  get(pattern, ...handlers) {
    this.add("GET", pattern, handlers);
  }
  post(pattern, ...handlers) {
    this.add("POST", pattern, handlers);
  }
  put(pattern, ...handlers) {
    this.add("PUT", pattern, handlers);
  }
  delete(pattern, ...handlers) {
    this.add("DELETE", pattern, handlers);
  }

  async dispatch(request, extra = {}) {
    const url = new URL(request.url);
    const route = this.routes.find(
      (r) => r.method === request.method && r.regex.test(url.pathname),
    );
    if (!route) throw new HttpError(404, "API route not found.");
    let body;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      if (request.body) {
        const reader = request.body.getReader();
        const chunks = [];
        let length = 0;
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          length += result.value.byteLength;
          if (length > 12 * 1024 * 1024) {
            await reader.cancel();
            throw new HttpError(413, "Request must be 12 MB or smaller.");
          }
          chunks.push(result.value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        if (length) {
          const type = request.headers
            .get("content-type")
            ?.split(";")[0]
            .trim()
            .toLowerCase();
          if (type !== "application/json")
            throw new HttpError(415, "Send application/json for API changes.");
          try {
            body = JSON.parse(new TextDecoder().decode(bytes));
          } catch {
            throw new HttpError(400, "The request contains invalid JSON.");
          }
          if (!body || typeof body !== "object" || Array.isArray(body))
            throw new HttpError(400, "Send a JSON object for API changes.");
        } else if (["POST", "PUT", "PATCH"].includes(request.method)) {
          if (
            request.headers
              .get("content-type")
              ?.split(";")[0]
              .trim()
              .toLowerCase() !== "application/json"
          )
            throw new HttpError(415, "Send application/json for API changes.");
          body = {};
        }
      } else if (["POST", "PUT", "PATCH"].includes(request.method)) {
        if (
          request.headers
            .get("content-type")
            ?.split(";")[0]
            .trim()
            .toLowerCase() !== "application/json"
        )
          throw new HttpError(415, "Send application/json for API changes.");
        body = {};
      }
    }
    const matches = url.pathname.match(route.regex);
    let params;
    try {
      params = Object.fromEntries(
        route.names.map((name, i) => [
          name,
          decodeURIComponent(matches[i + 1]),
        ]),
      );
    } catch {
      throw new HttpError(400, "Invalid URL encoding.");
    }
    const req = {
      ...extra,
      body,
      params,
      query: Object.fromEntries(url.searchParams),
      get: (name) => request.headers.get(name),
      request,
    };
    let status = 200;
    const headers = new Headers();
    let response;
    const res = {
      set(name, value) {
        headers.set(name, value);
        return this;
      },
      status(value) {
        status = value;
        return this;
      },
      type(value) {
        headers.set(
          "Content-Type",
          value === "text/calendar" ? "text/calendar; charset=utf-8" : value,
        );
        return this;
      },
      json(value) {
        headers.set("Content-Type", "application/json; charset=utf-8");
        response = new Response(JSON.stringify(value), { status, headers });
        return this;
      },
      send(value) {
        response = new Response(value, { status, headers });
        return this;
      },
    };
    for (const handler of route.handlers) {
      let next = false;
      await handler(req, res, (error) => {
        if (error) throw error;
        next = true;
      });
      if (response) return response;
      if (!next) break;
    }
    if (!response) throw new Error("Route did not produce a response.");
    return response;
  }
}
