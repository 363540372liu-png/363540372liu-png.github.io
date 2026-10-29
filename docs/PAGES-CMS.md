# Pages CMS editing

Configuration: .pages.yml. Open https://app.pagescms.org and authorize the GitHub repository, then choose the main branch. No backend server is added to this site. Saving content on main uses the existing GitHub Pages deployment workflow.

## Articles and compatibility

The article collection creates Markdown files under src/content/posts with title, description, pubDatetime, tags, draft, featured and a Markdown rich-text body. New articles default to draft. Tags are a list of strings, not a comma-separated scalar. Uploaded images go to public/images and links use /images.

Dates use date-fns format yyyy-MM-dd'T'HH:mm:ssXXX: local browser wall time plus its actual UTC offset (for example 2026-10-29T18:30:00+08:00). Do not use a literal Z to label local time as UTC. The Astro schema normalizes valid timezone-qualified ISO strings before z.date(); existing unquoted YAML timestamps (Date objects) remain accepted. The same adapter covers preserved modDatetime values.

settings.content.merge preserves unmanaged frontmatter such as author, slug, ogImage and canonicalURL. It does not guarantee preservation of Markdown syntax through a WYSIWYG round-trip. Use Source mode for formulas, HTML, callouts, collapsible blocks and other special syntax; review the resulting Git diff. Existing articles have not been rewritten.

MDX files contain imports, JSX and Astro components. They are explicitly excluded from this rich-text collection to prevent accidental conversion; edit these existing files in GitHub/source tooling. This configuration does not promise lossless MDX WYSIWYG support.

About is a single-file entry with create, rename and delete disabled in the CMS. This protects the CMS UI, not deletion by an administrator through GitHub or Git itself.

## Official references

- https://pagescms.org/docs/configuration/fields/date/
- https://pagescms.org/docs/configuration/fields/rich-text/
- https://pagescms.org/docs/configuration/content/list/
- https://pagescms.org/docs/configuration/content/operations/
- https://pagescms.org/docs/configuration/settings/

The hosted CMS authentication and a real save/upload have not been exercised by this local build. First use should verify a draft save and image upload before publishing.
