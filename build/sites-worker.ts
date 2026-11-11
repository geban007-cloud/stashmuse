import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

function secureResponse(response: Response, privateData = false) {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", "base-uri 'self'; frame-ancestors 'none'; object-src 'none'");
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  if (privateData) headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const url = new URL(request.url);
    const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const localPreview = import.meta.env.DEV && url.hostname === "terminal.local";
    if (!localHost && !localPreview) {
      return secureResponse(new Response("This application only accepts local connections.", {
        status: 403,
        headers: { "Cache-Control": "private, no-store" },
      }), true);
    }

    const origin = request.headers.get("origin");
    const extensionImport = url.pathname === "/api/extension/import";
    const crossOrigin = Boolean(origin && origin !== url.origin);
    const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (crossOrigin && (url.pathname.startsWith("/api/") || unsafeMethod) && !extensionImport) {
      return secureResponse(new Response("Cross-origin access is not allowed.", {
        status: 403,
        headers: { "Cache-Control": "private, no-store" },
      }), true);
    }

    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response = await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    return secureResponse(response, url.pathname.startsWith("/api/"));
  },
};
