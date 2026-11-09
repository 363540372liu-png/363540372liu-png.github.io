import { getCollection } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { getPostUrl } from "@/utils/getPostPaths";
import { postInteractionKey } from "@/lib/post-interaction-key";

export async function GET() {
  const seen = new Set<string>();
  const posts = getSortedPosts(await getCollection("posts")).map(post => {
    const key = postInteractionKey(post);
    if (seen.has(key))
      throw new Error(`Duplicate interaction ID for ${post.id}`);
    seen.add(key);
    return {
      key,
      title: post.data.title,
      path: getPostUrl(post.id, post.filePath).replace(/\/?$/, "/"),
    };
  });
  return Response.json(posts);
}
