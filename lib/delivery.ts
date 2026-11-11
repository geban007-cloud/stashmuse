export const deliverySentKey = (date: string) => `knowledge_delivery_sent:feishu:${date}`;

export function validFeishuWebhook(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["open.feishu.cn", "open.larksuite.com"].includes(url.hostname)
      && /^\/open-apis\/bot\/v2\/hook\/[\w-]+$/.test(url.pathname)
      && !url.username && !url.password && !url.port && !url.search && !url.hash;
  } catch { return false; }
}
