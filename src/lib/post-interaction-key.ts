import { createHash } from "node:crypto";
import type { CollectionEntry } from "astro:content";

export function postInteractionKey(post: CollectionEntry<"posts">) {
  // The Astro content ID defaults to the source path. Explicit IDs can
  // preserve a conversation if that path or its frontmatter slug moves.
  return (
    post.data.interactionId ??
    createHash("sha256").update(`polar-post:${post.id}`).digest("hex")
  );
}
