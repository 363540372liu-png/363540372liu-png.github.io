# Polar Explorer 互动系统

## 独立审阅环境

审阅站地址为 https://polar-explorer-interaction-review.tangy-field-2945.chatgpt.site 。文章互动区位于正文、标签及相邻文章导航之后。审核页为 `/admin/comments/`，OAuth 回调为 `/auth/callback/`。独立站可能要求先使用拥有该站点的 ChatGPT 账号打开，这是预览访问控制，和博客里的 Google/GitHub 登录是两套身份。

缺少配置时页面明确显示「尚未连接」。数据库中没有测试账号、留言或赞由前端自动注入。

### 1. 建立测试 Supabase

在 [Supabase Dashboard](https://supabase.com/dashboard) 建立一个独立项目，例如 `polar-explorer-review`。记下 Project Reference 和 `https://<REF>.supabase.co`，到 Settings → API Keys 复制以 `sb_publishable_` 开头的 publishable key。这两个值可交给构建环境。数据库密码、secret key、service-role key、OAuth Client Secret 只保存在各服务的受保护设置里。

在测试项目的 SQL Editor 按文件名顺序运行两份 `supabase/migrations/` SQL。第一份建立私有表、RLS、函数授权，第二份登记当前四篇公开文章。若使用有授权的云端终端，则可以用 `supabase link --project-ref <REF>` 和 `supabase db push`，认证及数据库密码由该终端的 Secret 设置提供。两种迁移方法择一，SQL Editor 手工执行后如改用 CLI，应先对齐 migration history。

### 2. 配置 OAuth

Supabase Dashboard → Authentication → URL Configuration 中，测试项目 Site URL 填审阅站地址，Redirect URLs 精确添加：

```text
https://polar-explorer-interaction-review.tangy-field-2945.chatgpt.site/auth/callback/
```

- [Google 配置](https://supabase.com/docs/guides/auth/social-login/auth-google)。在 Google Auth Platform 设置同意页，若应用是 Testing 状态，添加参与测试的 Google 账号。创建类型为 **Web application** 的 OAuth 客户端。Authorized JavaScript origins 添加审阅站的 origin，Authorized redirect URIs 填 **Supabase Dashboard 显示的 provider 回调**，通常是 `https://<REF>.supabase.co/auth/v1/callback`。在 Supabase Authentication → Sign In / Providers 启用 Google，保存 Client ID 和 Client Secret。
- [GitHub 配置](https://supabase.com/docs/guides/auth/social-login/auth-github)。GitHub → Settings → Developer settings → OAuth Apps → New OAuth App。Homepage URL 填审阅站，Authorization callback URL 填同一 Supabase provider 回调。生成 Client Secret，在 Supabase Authentication → Sign In / Providers 启用 GitHub，填入对应凭证。
- 关闭 Anonymous Sign-Ins 和不使用的 Email/Password 等 provider。普通评论要求持有 Supabase 登录会话。博客不会存储 Google/GitHub 的 provider token。
- 用相同浏览器标签完成跳转。应用用 PKCE 交换一次性 code，再返回原文或审核页；评论草稿只存在当前标签的 sessionStorage。

### 3. 部署添冰接口并连接预览

从已链接到**测试项目**的云端终端执行 `supabase functions deploy polar-ice --project-ref <REF> --no-verify-jwt`。`verify_jwt=false` 只用于这个匿名入口。它使用 Edge 默认注入的 `SUPABASE_SERVICE_ROLE_KEY` 调用两条仅服务端可执行的函数。

在测试 Supabase 的 Edge Functions → Secrets 设置：

| 名称 | 值 |
| --- | --- |
| `POLAR_ALLOWED_ORIGINS` | `https://polar-explorer-interaction-review.tangy-field-2945.chatgpt.site`，无末尾斜线 |
| `POLAR_ICE_HMAC_SECRET` | 独立随机值，至少 32 字符 |
| `POLAR_TRUST_CF_IP` | 默认不设。仅在实测网关会清洗并重写外部 `cf-connecting-ip` 时启用 |

浏览器构建变量为 `PUBLIC_POLAR_SUPABASE_URL` 和 `PUBLIC_POLAR_SUPABASE_KEY`。填入测试项目 URL 和 publishable key 后重新构建、发布同一审阅站。站点静态输出中只包含这两个公开值。Supabase CLI 授权可通过云端终端的受保护环境配置，也可由站长从 Supabase 的 Web Dashboard 新建同名 Edge Function、贴入 `supabase/functions/polar-ice/index.ts`，并关闭该函数的旧版 JWT 验证。

### 4. 配置首位管理员

站长在审阅站完成首次登录。到**测试项目** Authentication → Users 核对对应账号并复制 Supabase User UID。仅在测试项目的 SQL Editor 执行：

```sql
insert into polar_private.admins (user_id)
values ('REPLACE_WITH_SUPABASE_USER_UID'::uuid)
on conflict do nothing;
```

刷新 `/admin/comments/` 后进入审核队列。撤销权限可从 `polar_private.admins` 删除对应 UID。不要通过邮箱、昵称或客户端配置授权。审核与删除会留下操作者 ID、动作及时间，删除后正文和快照资料被擦除。

### 5. 用真实测试项目验收

分别试 Google 和 GitHub 登录，取消授权后回到原文再重试。用两个浏览器配置检查点赞状态、共享计数、取消和刷新。用普通账号发评论及回复，确认待审时只有作者和审核员能看见，并在退出登录的浏览器配置中核对计数。审核通过、隐藏、拒绝和删除后分别刷新公开页面。用普通账号打开审核地址，确认没有审核数据。最后在 iPad 和手机试登录弹窗、评论区和审核台。

## 数据边界

- 数据位于未暴露的 `polar_private` schema，所有表开启 RLS。客户端角色没有表权限。公开 RPC 只投影已通过且原观测也公开的内容，作者会额外收到自己的待审、拒绝或因原观测隐藏的内容。公开数量只计算可公开内容。
- `polar_comments` 提供公开和作者视图。`polar_comment_submit`、`polar_comment_delete` 要求登录。`polar_is_admin`、`polar_review_posts`、`polar_review_list`、`polar_review_set` 使用数据库管理员表。
- `POST /functions/v1/polar-ice` 传 `{ post, visitor }` 读取，增加布尔字段 `liked` 设置状态。两条点赞 RPC 只授权给服务角色。点赞唯一键为文章 ID 和随机浏览器 UUID，重复设置状态不改变计数。清除数据或切换浏览器会更换 UUID，恶意构造请求仍可能绕过浏览器去重。
- 每浏览器每分钟最多 20 次写入。未验证转发头时，所有浏览器共享 60 次/分钟的网络预算。可信网络模式下按 HMAC 化后的网络地址计数，另有全站 600 次/分钟限制。当前限额适合低流量测试站，若真实流量需要提升，先验证网关，再调整限额或加 Turnstile。浏览器不上传设备指纹，数据库不保存原始 IP。
- 评论每账号最多 5 条/分钟、30 条/24 小时，另有全站 120 条/分钟。重试同一个请求 ID 不增加评论。昵称及头像经过筛选，正文、昵称和审核界面均用纯文本 DOM 渲染。
- 文章标识由 Astro 内容 ID 哈希而来，修改标题不影响互动。移动或重命名源文件、修改自定义 slug 前，将原目录中的 `key` 写入文章 frontmatter 的 `interactionId`，以保留旧互动。
- 发布或取消公开文章时，需要同步构建生成的目录。用云端构建输出的 `dist/interaction-catalog.json` 运行 `node scripts/polar-catalog.mjs`，把输出 SQL 应用到对应项目。目录同步将已撤下文章停用，并保留原互动数据。将生产目录同步加入发布流程前，应先确认受限数据库凭证及同步时机。

## 正式上线时

创建独立生产 Supabase 项目，重复迁移、部署函数、配置管理员及 OAuth。正式项目的 Site URL 填 `https://363540372liu-png.github.io/`，精确添加 `https://363540372liu-png.github.io/auth/callback/`，更新两个 provider 各自的生产 Supabase 回调。Edge 允许源改成 `https://363540372liu-png.github.io`。在 GitHub 仓库 Actions Variables 中设生产项目的两个 `PUBLIC_POLAR_...` 值。生产项目只导入文章目录，不复制测试用户、点赞或评论。站长明确确认后，才合并并从正式域名复验。
