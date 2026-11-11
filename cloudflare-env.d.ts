declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    /** Optional local secret. It is read from the Worker environment and never stored in D1 or exports. */
    DEEPSEEK_API_KEY?: string;
    FEISHU_WEBHOOK_URL?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
  }
}
