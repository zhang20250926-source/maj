// 微信云托管：小程序经 callContainer 内网调用，不需要配置业务域名或备案。
const CLOUD_ENV_ID = 'prod-d1g3k4lm8f215cc54'
const CLOUD_SERVICE = 'express-8fh7'
const USE_CLOUD_RUN = true

// 仅用于本机 Node 服务联调。正式小程序不使用该地址。
const API_BASE_URL = 'http://127.0.0.1:8787'

module.exports = { API_BASE_URL, CLOUD_ENV_ID, CLOUD_SERVICE, USE_CLOUD_RUN }
