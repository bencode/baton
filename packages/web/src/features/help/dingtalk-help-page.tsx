import { Markdown } from '../../components/markdown'

// Public onboarding guide for the DingTalk internal-app + Stream-mode bot. The
// only thing we need back is Client ID + Client Secret — the rest is the robot
// capability + Stream, which cover group messaging without per-permission setup.
const GUIDE = `# 接入钉钉机器人

跟着走 ≈ 10 分钟,**不用申请一堆权限**。最后只把 **Client ID + Client Secret** 两个值发给我们即可。

## 1. 创建应用
用**管理员账号**登录钉钉开放平台 [open-dev.dingtalk.com](https://open-dev.dingtalk.com) →
「应用开发」→「**企业内部应用**」→ 创建应用。

## 2. 添加「机器人」能力
- 左侧「**添加应用能力**」→ 添加「**机器人**」。
- 进左侧「**机器人**」:打开机器人配置开关,填名称/图标/简介。
- **「消息接收模式」选「Stream 模式」**(无需公网回调地址)。

## 3. 事件订阅(Stream)
左侧「**事件订阅**」→「推送方式」选「**Stream 模式推送**」→ 保存。

## 4. 发布
左侧「**版本管理与发布**」→ 创建版本 →「**发布**」。
(企业内部应用发布后才能使用。)

## 5. 把机器人加进群
在要用的群里:群设置 →「智能群助手」→「添加机器人」→ 选你刚建的这个应用机器人。

## 6. 把凭证发给我们
左侧「**凭证与基础信息**」→ 复制这两个值发给我们:
- **Client ID**(原 AppKey)
- **Client Secret**(原 AppSecret)

> 请通过安全渠道发送,不要发在公开群里。

---

## 关于「权限」(重点)
**基本不用单独勾权限点。** 收发群消息靠的是上面的「机器人」能力 + Stream 模式,不是「权限管理」里那一长串:
- 收群里的 @ 消息 → 机器人能力 + Stream;
- 回复 → 用每条消息自带的临时回复地址,**不需要发送权限**;
- (发图片才用到的)消息文件下载 → 也归机器人能力,默认可用。

所以「权限管理」里那些大多保持「未开通」就行,**不用挨个开**。

## 常见问题
- **一定要公网/服务器吗?** 不用。Stream 是长连接,我们这边主动连钉钉,你这边无需任何公网地址。
- **改了配置不生效?** 钉钉应用「发布后当前修改才生效」—— 改完记得去「版本管理与发布」重新发布。
- **换群?** 在新群重复第 5 步加机器人即可,凭证不用变。
`

export const DingtalkHelpPage = () => (
  <div className="min-h-screen overflow-auto bg-gray-50">
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Markdown text={GUIDE} />
    </div>
  </div>
)
