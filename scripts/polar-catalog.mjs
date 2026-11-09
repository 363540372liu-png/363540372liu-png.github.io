import { readFileSync } from "node:fs";

const posts = JSON.parse(
  readFileSync(process.argv[2] ?? "dist/interaction-catalog.json", "utf8")
);
if (!Array.isArray(posts) || posts.length === 0)
  throw new Error("Expected a nonempty catalog");
const seen = new Set();
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const rows = posts.map(({ key, title, path }) => {
  if (
    typeof key !== "string" ||
    !/^[a-f0-9]{64}$/.test(key) ||
    seen.has(key) ||
    typeof title !== "string" ||
    typeof path !== "string" ||
    !/^\/posts\/[^?#]+\/$/.test(path)
  ) {
    throw new Error("Invalid catalog entry");
  }
  seen.add(key);
  return "(" + [key, title, path].map(literal).join(", ") + ")";
});
process.stdout.write(`begin;
set local standard_conforming_strings = on;
update polar_private.posts set active = false where post_key not in (${[...seen].map(literal).join(", ")});
insert into polar_private.posts(post_key,title,path) values
${rows.join(",\n")}
on conflict (post_key) do update set title = excluded.title, path = excluded.path, active = true;
commit;
`);
