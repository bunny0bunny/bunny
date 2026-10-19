import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// All database-backed documents are dynamic; no paid cache or image binding.
export default defineCloudflareConfig();
