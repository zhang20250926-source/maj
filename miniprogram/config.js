// 微信云托管环境信息保留，便于环境授权完成后切回私有链路。
const CLOUD_ENV_ID = 'prod-d7gf8lw3n60ac72fa'
const CLOUD_SERVICE = 'express-k468'
// 当前小游戏 AppID 尚未获 callContainer 环境权限，先走云托管公网 HTTPS 域名。
const USE_CLOUD_RUN = false

const API_BASE_URL = 'https://express-k468-316861-10-1492186961.sh.run.tcloudbase.com'

module.exports = { API_BASE_URL, CLOUD_ENV_ID, CLOUD_SERVICE, USE_CLOUD_RUN }
