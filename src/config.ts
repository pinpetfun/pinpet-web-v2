/**
 * @interface SolanaConfig
 * @description Solana配置接口
 */
interface SolanaConfig {
  rpcUrl: string;
  networks: string;
  explorerBaseUrl: string;
  explorerCluster: string;
}

/**
 * @interface AppConfig
 * @description 应用配置接口
 */
interface AppConfig {
  serverUrl: string;
  gatewayUrl: string;
  pinpetApiUrl: string;
  tradeQuoteWs: string;
  defaultDataSource: string;
  isDev: boolean;
  isProd: boolean;
  solana: SolanaConfig;
}

/**
 * @constant config
 * @description 环境变量配置
 */
export const config: AppConfig = {
  serverUrl: import.meta.env.VITE_SERVER_URL,
  gatewayUrl: import.meta.env.VITE_GATEWAY_URL,
  pinpetApiUrl: import.meta.env.VITE_PINPET_API_URL,
  tradeQuoteWs: import.meta.env.VITE_TRADE_QUOTE_WS,
  defaultDataSource: import.meta.env.VITE_DEFAULT_DATA_SOURCE || 'fast',
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  solana: {
    rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL,
    networks: import.meta.env.VITE_SOLANA_NETWORKS,
    explorerBaseUrl: import.meta.env.VITE_SOLANA_EXPLORER_BASE_URL || 'https://explorer.solana.com/tx/',
    explorerCluster: import.meta.env.VITE_SOLANA_EXPLORER_CLUSTER,
  }
}

// 临时调试：打印当前加载的环境变量
// console.log('🔍 Environment Debug:', {
  // MODE: import.meta.env.MODE,
  // VITE_SOLANA_RPC_URL: import.meta.env.VITE_SOLANA_RPC_URL,
  // VITE_SOLANA_NETWORKS: import.meta.env.VITE_SOLANA_NETWORKS,
  // VITE_PINPET_API_URL: import.meta.env.VITE_PINPET_API_URL,
  // VITE_SPINPET_API_URL: import.meta.env.VITE_SPINPET_API_URL,
// })

// 验证必需的环境变量
if (!config.serverUrl) {
  throw new Error('VITE_SERVER_URL is required')
}

if (!config.gatewayUrl) {
  throw new Error('VITE_GATEWAY_URL is required')
}

if (!config.pinpetApiUrl) {
  throw new Error('VITE_PINPET_API_URL is required')
}

/**
 * @function generateTxExplorerUrl
 * @description 生成交易浏览器链接的工具函数
 * @param {string} signature - 交易签名
 * @returns {string} 交易浏览器URL
 * @throws {Error} 当签名为空时抛出错误
 */
export const generateTxExplorerUrl = (signature: string): string => {
  if (!signature) {
    throw new Error('Transaction signature is required')
  }

  const baseUrl = config.solana.explorerBaseUrl
  const cluster = config.solana.explorerCluster

  // 确保 baseUrl 以 / 结尾
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`

  // 构建完整 URL
  let url = `${normalizedBaseUrl}${signature}`

  // 如果配置了集群且不是 mainnet，添加 cluster 参数
  if (cluster && cluster.toLowerCase() !== 'mainnet') {
    url += `?cluster=${cluster}`
  }

  return url
}

/**
 * @function convertIpfsUrl
 * @description 转换IPFS URL的工具函数
 * @param {string} ipfsUrl - IPFS URL
 * @returns {string | null} 转换后的URL或null
 */
export const convertIpfsUrl = (ipfsUrl: string): string | null => {
  if (!ipfsUrl) {
    return null
  }

  // 如果已经是gateway URL，直接返回
  if (ipfsUrl.startsWith('https://')) {
    // 如果是 ipfs.io 的URL，替换为我们的gateway
    if (ipfsUrl.includes('ipfs.io/ipfs/')) {
      const hash = ipfsUrl.split('ipfs.io/ipfs/')[1]
      return `https://${config.gatewayUrl}/ipfs/${hash}`
    }
    return ipfsUrl
  }

  // 处理 ipfs:// 格式
  if (ipfsUrl.startsWith('ipfs://')) {
    const hash = ipfsUrl.replace('ipfs://', '')
    return `https://${config.gatewayUrl}/ipfs/${hash}`
  }

  // 处理纯hash
  return `https://${config.gatewayUrl}/ipfs/${ipfsUrl}`
}

/**
 * @function shortenAddress
 * @description 生成简短的合约地址显示
 * @param {string} address - 完整地址
 * @returns {string} 简短地址
 */
export const shortenAddress = (address: string): string => {
  if (!address || address.length < 12) {
    return address
  }
  return `${address.slice(0, 6)}...${address.slice(-6)}`
}