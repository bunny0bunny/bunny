# Chapter downloads

Approved scope: readers and administrators can download published manga and webtoon chapters as PDF. A per-series administrator switch defaults to off. Novel exports and CBZ are deferred. English work titles take priority; the interface stays Arabic. Decimal chapter numbers remain supported.

Downloads use the current published reading images, never the retained source PDF or a draft revision. Generate the PDF on demand on the reader's device with native browser image decoding. There is no stored PDF export or shared cache. Recheck current publication, deletion, lock status and download permission for the manifest, every image and the final manifest confirmation. Administrators may bypass the series switch, but not publication/lock/deletion checks. Previously saved copies cannot be revoked.

Bound generation, input size, concurrency and retries. Permit only one PDF preparation at a time per browser module and rate-limit manifest requests. Content replacement automatically changes the fingerprint; reject mixed or stale output. Never accept client-supplied images or object keys. Proxy verified private images through a same-origin download route; do not expose storage keys or original sources to the client.

Reader controls belong in chapter lists and the reader. Show preparing, ready, failed and retry states. Administrative controls explain supported formats and the effect of disabling future downloads. Do not make the application depend on an additional paid service.

Feasibility gate: prove WebP decoding and PDF output inside the deployed Worker runtime before connecting generation. The existing upload limit permits 16,777,216 pixels per image. A decoder that copies both WASM RGBA and JS RGBA cannot safely assume that limit fits a 128 MiB Worker. Any export-specific limit must be enforced before allocation and communicated clearly, not silently omit pages or reduce quality.

Ruling after feasibility tests: replace the initially proposed server-generated 24-hour export cache with browser-generated PDF. Actual workerd tests found approximately 148 MB combined WASM/JS decoder buffers at 16 MP, an outdated decoder in one package and incompatible dynamic-code glue in another. Native browser decoding avoids those server risks and avoids duplicate storage. Cost: every download prepares again and depends on device memory; no offline preparation. This implementation change was explained to the user during work.

Limits: 200 source images, each at the existing 6 MiB/16,777,216 pixel/16,000 edge limit; PDF at most 64 MiB. Process one bitmap at a time. Encode white-backed RGB JPEG at quality 0.92, width at most 1440 pixels. Split long images into contiguous PDF pages of at most 4096 output pixels high. Reading images remain unchanged. Release bitmaps/canvases and revoke Blob URLs on cancellation/close/unmount. Compressed PDF data accumulates up to the output cap, so memory is bounded but is not constant.

The initial implementation stayed local and preserved the pending decimal chapter-number changes. The user subsequently authorized publishing on 2026-10-29; both migrations and the verified build were released. See the release handoff for verification and operational details.
