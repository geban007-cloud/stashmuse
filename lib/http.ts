export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, no-store");
  return Response.json(data, { ...init, headers });
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "本地服务暂时不可用";
}
