# Polar Explorer 互动系统

## 独立审阅环境

审阅站地址为 https://polar-explorer-interaction-review.tangy-field-2945.chatgpt.site 。文章互动区位于正文、标签及相邻文章导航之后。审核页为 `/admin/comments/`，OAuth 回调为 `/auth/callback/`。独立站可能要求先使用拥有该站点的 ChatGPT 账号打开，这是预览访问控制，和博客里的 Google/GitHub 登录是两套身份。

缺少配置时页面明确显示「尚未连接」。数据库中没有测试账号、留言或赞由前端自动注入。

### 1. 建立测试 Supabase

在 [Supabase Dashboard](https://supabase.com/dashboard) 建立一个独立项目，例如 `polar-explorer-review`。记下 Project Reference 和 `https://<REF>.supabase.co`，到 Settings → API Keys 复制以 `sb_publishable_` 开头的 publishable key。这两个值可交给构建环境。数据库密码、secret key、service-role key、OAuth Client Secret 只保存在各服务的受保护设置里。

在测试项目的 SQL Editor 按文件名顺序运行三份 `supabase/migrations/` SQL。第一份建立私有表、RLS、函数授权，第二份登记当前四篇公开文章，第三份升级目录同步、分页隔离与点赞防滥用。若使用有授权的云端终端，则可以用 `supabase link --project-ref <REF>` 和 `supabase db push`，认证及数据库密码由该终端的 Secret 设置提供。两种迁移方法择一，SQL Editor 手工执行后如改用 CLI，应先对齐 migration history。

### 2. 配置 OAuth

Supabase Dashboard → Authentication → URL Configuration 中，测试项目 Site URL 填审阅站地址，Redirect URLs 精确添加：

```text
https://polar-explorer-interaction-review.tangy-field-2945.chatgpt.site/auth/callback/
```

- [Google 配置](https://supabase.com/docs/guides/auth/social-login/auth-google)。在 Google Auth Platform 设置同意页，若应用是 Testing 状态，添加参与测试的 Google 账号。创建类型为 **Web application** 的 OAuth 客户端。Authorized JavaScript origins 添加审阅站的 origin，Authorized redirect URIs 填 **Supabase Dashboard 显示的 provider 回调**，通常是 `https://<REF>.supabase.co/auth/v1/callback`。在 Supabase Authentication → Sign In / Providers 启用 Google，保存 Client ID 和 Client Secret。
- [GitHub 配置](https://supabase.com/docs/guides/auth/social-login/auth-github)。GitHub → Settings → Developer settings → OAuth Apps → New OAuth App。Homepage URL 填审阅站，Authorization callback URL 填同一 Supabase provider 回调。生成 Client Secret，在 Supabase Authentication → Sign In / Providers 启用 GitHub，填入对应凭证。
- 关闭 Anonymous Sign-Ins 和不使用的 Email/Password 等 provider。普通评论要求持有 Supabase 登录会话。博客不会存储 Google/GitHub 的 provider token。
- 用相同浏览器标签完成跳转。应用用 PKCE 交换一次性 code，再返回原文或审核页；评论草稿只存在当前标签的 sessionStorage。

### 3. 部署 Edge Function 并连接预览

从已链接到**测试项目**的云端终端运行：

```sh
supabase functions deploy polar-ice --project-ref <TEST_REF> --no-verify-jwt
supabase functions deploy polar-catalog --project-ref <TEST_REF> --no-verify-jwt
```

也可使用 Supabase Dashboard 的 Edge 编辑器，两个函数都要包含 `_shared/request.ts`。这两个入口各自验证请求，关闭的是网关的旧版 JWT 校验。添冰检查来源和写入规则，目录接口检查带时间戳的 HMAC。两个函数使用 Edge 默认注入的服务角色调用限定 RPC。对已有测试环境，先迁移数据库，再立即重新部署添冰函数；旧 Edge 调用的写 RPC 在迁移中已删除。

在测试 Supabase 的 Edge Functions → Secrets 设置：

| 名称 | 值 |
| --- | --- |
| `POLAR_ALLOWED_ORIGINS` | `https://polar-explorer-interaction-review.tangy-field-2945.chatgpt.site`，无末尾斜线 |
| `POLAR_CATALOG_SIGNING_KEY` | 独立随机值，至少 32 字符，仅用于目录同步 |
| `POLAR_TURNSTILE_SECRET` | Cloudflare Turnstile 测试环境的 Secret Key，需和前端 site key 成对配置 |
| `POLAR_TRUST_CF_IP` | 默认不设。仅在实测网关会清洗并重写外部 `cf-connecting-ip` 时启用 |
| `POLAR_ICE_HMAC_SECRET` | 仅启用可信 IP 模式时必填，独立随机值，至少 32 字符 |

预览构建变量为 `PUBLIC_POLAR_SUPABASE_URL`、`PUBLIC_POLAR_SUPABASE_KEY` 和 `PUBLIC_POLAR_TURNSTILE_SITE_KEY`。前两项为测试项目公开配置，第三项为 Turnstile site key。使用 Managed widget 并登记预览域名。三项都可放进静态构建。服务端密钥只在受保护设置中使用。

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

可运行 `node scripts/polar-live-smoke.mjs` 核验真实 Supabase HTTP 权限。只在明确授权的测试环境中，通过受保护环境变量配置 `POLAR_E2E_TEST_REF`、`POLAR_E2E_PUBLISHABLE_KEY`、`POLAR_E2E_POST_KEY` 和三个不同账号的短时会话 `POLAR_E2E_GOOGLE_JWT`、`POLAR_E2E_GITHUB_JWT`、`POLAR_E2E_ADMIN_JWT`。如果已有生产项目，请同时填 `POLAR_E2E_PRODUCTION_REF`，脚本拒绝相同项目。测试会创建并清理两条标记评论和一个点赞。脚本核对实际 OAuth 身份和 API 行为，OAuth 跳转和回调还需浏览器验收。保持 `polar_private` 不在 Data API Exposed Schemas 列表，也不要把评论表加入 Realtime publication。

## 数据边界

- 数据位于未暴露的 `polar_private` schema，所有表开启 RLS。客户端角色没有表权限。公开 RPC 只投影已通过且原观测也公开的内容，作者会额外收到自己的待审、拒绝或因原观测隐藏的内容。公开数量只计算可公开内容。
- `polar_comments` 提供公开和作者视图。`polar_comment_submit`、`polar_comment_delete` 要求登录。`polar_is_admin`、`polar_review_posts`、`polar_review_list`、`polar_review_set` 使用数据库管理员表。
- `POST /functions/v1/polar-ice` 传 `{ post, visitor }` 读取，增加布尔字段 `liked` 设置状态。两条点赞 RPC 只授权给服务角色。点赞唯一键为文章 ID 和随机浏览器 UUID，重复设置状态不改变计数。清除数据或切换浏览器会更换 UUID，恶意构造请求仍可能绕过浏览器去重。
- 没有可信 IP 时不创建共享 IP 桶。实际新增每浏览器每分钟最多 20 次、全站最多 1200 次。每文章每分钟 120 次未验证新增，启用可信 IP 后另有每网络 60 次的软阈值。达到软阈值且配置 Turnstile 后，访客可通过验证继续。没有配置 Turnstile 时，相关访客收到重试提示。撤销和重复提交不占新增额度。浏览器不上传设备指纹，数据库不保存原始 IP。
- 评论每账号最多 5 条/分钟、30 条/24 小时，另有全站 120 条/分钟。重试同一个请求 ID 不增加评论。昵称及头像经过筛选，正文、昵称和审核界面均用纯文本 DOM 渲染。
- 文章标识由 Astro 内容 ID 哈希而来，修改标题不影响互动。移动或重命名源文件、修改自定义 slug 前，将原目录中的 `key` 写入文章 frontmatter 的 `interactionId`，以保留旧互动。
- Pages CMS 内容提交到 `main` 后，GitHub Pages 工作流会将同一次构建的 `dist/interaction-catalog.json` 签名提交到生产项目。目录写入成功后才部署对应的 Pages 构建。服务端会原子更新并拒绝过期或冲突的发布序号，保留被下架文章的历史互动。初次配置后，日常发布文章无需执行 SQL。
- 如果目录更新成功后 GitHub Pages 部署本身失败，重跑同一构建的部署或从 `main` 启动更新的发布。若两次构建的目录不同，使用新的工作流运行序号；同一序号只接受相同目录。此故障期间，被下架文章的互动可能比页面先停用。

## 正式上线检查

1. 在独立测试项目验收 Google 和 GitHub 登录回调、匿名点赞、评论与回复、审核及三个身份的隔离；在预览地址实测手机、iPad、桌面和两种主题。
2. 在测试项目运行一次已签名的目录同步。使用测试项目公开变量、测试签名密钥及递增的 `GITHUB_RUN_NUMBER` 运行 `node scripts/polar-catalog.mjs`；核对模拟 CMS 新文章无需 SQL 即可读取和点赞。测试运行时不接触生产项目。
3. 创建独立的生产 Supabase 和 Turnstile 配置。应用三份迁移，部署两个函数，设置正式域名、OAuth 回调和首位管理员。正式回调为 `https://363540372liu-png.github.io/auth/callback/`。
4. 在 GitHub Actions Variables 保存生产项目的三个 `PUBLIC_POLAR_…` 值，在 Actions Secrets 保存与生产 Edge 匹配的 `POLAR_CATALOG_SIGNING_KEY`。不要将测试项目的值填入生产发布流程。
5. 取得站长明确批准后再合并。检查 GitHub Pages 工作流中的目录同步和发布步骤均成功，然后从正式域名抽查目录、登录和互动。测试账号、点赞和留言留在测试项目。
