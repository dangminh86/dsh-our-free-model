/**
 * The disclaimer copy both surfaces show: the plugin's settings page and the
 * standalone/desktop console.
 *
 * The product carries no WorkBuddy and no Huawei Cloud channel. Those two are
 * excluded mechanically (`src/magpie-policy.js`, and the aggregate registry
 * through it), but an exclusion with no explanation leaves a user wondering
 * whether the channel is broken. This copy answers the two questions that
 * matter instead: those channels are not part of what this build offers, and
 * anything a user does with a channel is their own responsibility.
 *
 * The copy is data, not markup: each surface renders it in its own idiom, so
 * there is exactly one place to change what the product says. It is deliberately
 * short — a wall of legal text is read by nobody — and states the project's
 * purpose plainly, because that is the honest description of what it is.
 */

export const DISCLAIMER_VERSION = 2

/** Channels this build does not offer, named for the reader. */
export const EXCLUDED_CHANNELS = Object.freeze([
  'WorkBuddy 国内版（workbuddy，亦称 CodeBuddy）',
  'WorkBuddy 国际版（workbuddy-ai）',
  '华为云 Huawei Cloud MaaS（huaweicloud，含 Token Plan）',
])

export const DISCLAIMER = Object.freeze({
  version: DISCLAIMER_VERSION,
  title: '使用须知与免责声明',
  subtitle: '关于本插件未提供的渠道，以及你需要知道的责任边界',
  intro: '本插件是一个个人学习与技术研究项目，用于学习模型网关、协议适配与本地路由的实现方式，按「现状」提供，不构成任何商业服务或产品承诺。',
  sections: Object.freeze([
    {
      id: 'excluded',
      heading: '本插件不提供这三个渠道',
      body: '本插件不包含、也不提供 WorkBuddy 国内版（workbuddy，亦称 CodeBuddy）、WorkBuddy 国际版（workbuddy-ai）与华为云 Huawei Cloud MaaS（huaweicloud，含 Token Plan）。这三者在插件端与桌面端均被移除：渠道列表、预设、登录入口、插件市场与模型目录里都不会出现，也无法通过导入配置或安装第三方插件启用。目录中看不到它们不是故障，是本项目的明确取舍，后续更新不会重新引入。',
    },
    {
      id: 'responsibility',
      heading: '使用第三方渠道与我们无关',
      body: '你若在本插件之外通过任何方式使用上述渠道或其他第三方服务，包括自行配置地址、导入凭据、安装第三方软件或登录他人账号，均属于你的个人行为，与本项目作者及团队无关。我们不参与、不背书、不提供支持，也不对其可用性、合规性或任何后果承担任何责任。',
    },
    {
      id: 'accounts',
      heading: '账号与凭据由你自己负责',
      body: '本插件只在你本机保存你主动导入的凭据，不会上传到任何服务器。请确保你使用这些账号的方式符合对应服务商的条款与所在地法律；由此产生的封禁、扣费、数据风险或其他损失，由使用者自行承担。',
    },
    {
      id: 'no-warranty',
      heading: '不提供任何担保',
      body: '本项目不对正确性、稳定性、适销性或特定用途适用性作任何明示或默示担保。使用本插件造成的任何直接或间接损失，作者与团队均不承担责任。请自行评估风险，并优先遵守所在地区的法律法规与服务商协议。',
    },
    {
      id: 'lawful',
      heading: '请合法合规使用',
      body: '本项目仅用于个人学习与技术研究。请勿将其用于违反服务商条款、规避授权限制、批量滥用额度或其他违法用途。因使用方式不当引发的争议、索赔或法律责任，均由使用者自行承担。',
    },
  ]),
  accept: '我已阅读并了解',
  reopen: '查看免责声明',
})

export const DISCLAIMER_EN = Object.freeze({
  version: DISCLAIMER_VERSION,
  title: 'Terms of Use & Disclaimer',
  subtitle: 'About unsupported channels and boundaries of responsibility',
  intro: 'This project is a personal learning and technical research initiative for studying model gateways, protocol adaptation, and local routing. It is provided "as is", without any commercial service or product commitments.',
  sections: Object.freeze([
    {
      id: 'excluded',
      heading: 'This build excludes three specific channels',
      body: 'This software does not include or provide WorkBuddy Domestic (workbuddy / CodeBuddy), WorkBuddy International (workbuddy-ai), or Huawei Cloud MaaS (huaweicloud, including Token Plan). All three have been removed on both the plugin and desktop surfaces. Their absence is an intentional project decision, not a bug, and future updates will not reintroduce them.',
    },
    {
      id: 'responsibility',
      heading: 'Third-party channel use is solely your responsibility',
      body: 'If you use these channels or other third-party services outside this plugin by any means—including custom endpoint configurations, credential imports, third-party software, or third-party accounts—you do so entirely at your own risk. The project authors and team do not participate, endorse, support, or assume liability for third-party availability or compliance.',
    },
    {
      id: 'accounts',
      heading: 'You are responsible for your accounts and credentials',
      body: 'Credentials you provide are stored locally on your machine and never uploaded to external servers. Please ensure your account usage complies with service provider terms and local laws. Any bans, billing charges, data risks, or losses are the sole responsibility of the user.',
    },
    {
      id: 'no-warranty',
      heading: 'No warranty provided',
      body: 'This project makes no express or implied warranties regarding correctness, stability, merchantability, or fitness for a particular purpose. Authors and contributors assume no liability for direct or indirect damages arising from use.',
    },
    {
      id: 'lawful',
      heading: 'Please use lawfully and in compliance',
      body: 'This project is strictly for personal learning and technical research. Do not use it to violate provider terms of service, bypass authorization controls, abuse quotas in bulk, or for any unlawful purposes.',
    },
  ]),
  accept: 'I have read and understand',
  reopen: 'View Disclaimer',
})

export function getDisclaimer(locale) {
  return String(locale).toLowerCase().startsWith('en') ? DISCLAIMER_EN : DISCLAIMER
}

/** Whether a stored acknowledgement matches the current copy version. */
export function disclaimerAcknowledged(settings) {
  return Number(settings?.disclaimerAck) === DISCLAIMER_VERSION
}
