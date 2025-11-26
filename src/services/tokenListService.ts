import { config, convertIpfsUrl, shortenAddress } from '../config.js'
import { getTokenEmojiImage } from '../config/emojiConfig'

/**
 * Token列表API响应接口
 */
interface TokenApiResponse {
  code: number
  msg: string
  data: {
    tokens: TokenData[]
    total: number
    next_cursor: string
  }
}

/**
 * Token数据接口
 */
interface TokenData {
  payer: string
  mint_account: string
  curve_account: string
  pool_token_account: string
  pool_sol_account: string
  fee_recipient: string
  base_fee_recipient: string
  params_account: string
  swap_fee: number
  borrow_fee: number
  fee_discount_flag: number
  name: string
  symbol: string
  uri: string
  up_orderbook: string
  down_orderbook: string
  latest_price: string
  created_at: number
  created_slot: number
  updated_at: number
  uri_data: {
    name: string
    symbol: string
    description: string
    image: string
    twitter: string
    website: string
    telegram: string
  }
  extras: Record<string, unknown>
}

/**
 * 获取Token列表
 * @param {string} sortBy - 排序方式: 'hot' | 'created' | 'ascending'
 * @param {number} limit - 限制返回数量，默认100
 * @returns {Promise<{success: boolean, data?: TokenData[], error?: string}>}
 */
export const fetchTokenList = async (sortBy: 'hot' | 'created' | 'ascending' = 'hot', limit: number = 100) => {
  try {
    const response = await fetch(`${config.pinpetApiUrl}/api/tokens/list?sort_by=${sortBy}&limit=${limit}`, {
      method: 'GET',
      headers: {
        'accept': '*/*'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result: TokenApiResponse = await response.json()

    if (result.code !== 200) {
      throw new Error(result.msg || 'Failed to fetch token list')
    }

    return {
      success: true,
      data: result.data.tokens || [],
      total: result.data.total,
      nextCursor: result.data.next_cursor
    }
  } catch (error) {
    console.error('Error fetching token list:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * 转换API数据为HotProject格式
 * @param {TokenData} token - API返回的token数据
 * @returns {Object} - HotProject格式的数据
 */
export const transformToHotProject = (token: TokenData) => {
  // 生成随机颜色
  const colors = ['32CD32', 'FFA500', '87CEEB', '9370DB', 'FF69B4', '20B2AA']
  const randomColor = colors[Math.floor(Math.random() * colors.length)]

  // 生成随机进度 (0-100)
  const randomProgress = Math.floor(Math.random() * 100)

  // 随机决定是否为Hot (20%概率)
  const isHot = Math.random() < 0.2

  // 转换图片URL
  const petImage = token.uri_data?.image ?
    convertIpfsUrl(token.uri_data.image) :
    getTokenEmojiImage(token.symbol, 400, 200, `#${randomColor}`)

  return {
    name: token.symbol || token.name || 'Unknown',
    marketCap: `$${Math.floor(Math.random() * 200)}K`, // 使用随机值
    progress: randomProgress,
    color: randomColor,
    isHot: isHot,
    petImage: petImage,
    contractAddress: shortenAddress(token.mint_account),
    mintAccount: token.mint_account // 保存完整地址用于跳转
  }
}

/**
 * 转换API数据为FeaturedToken格式
 * @param {TokenData} token - API返回的token数据
 * @returns {Object} - FeaturedToken格式的数据
 */
export const transformToFeaturedToken = (token: TokenData) => {
  // 生成随机进度 (0-100)
  const randomProgress = Math.floor(Math.random() * 100)

  // 随机决定是否为Completed (30%概率)
  const isCompleted = Math.random() < 0.3

  // 转换图片URL
  const image = token.uri_data?.image ?
    convertIpfsUrl(token.uri_data.image) :
    getTokenEmojiImage(token.symbol, 400, 200, '#FFD700')

  return {
    name: token.symbol || token.name || 'Unknown',
    contractAddress: shortenAddress(token.mint_account),
    marketCap: `$${Math.floor(Math.random() * 200)}K`, // 使用随机值
    progress: randomProgress,
    image: image,
    isCompleted: isCompleted,
    mintAccount: token.mint_account // 保存完整地址用于跳转
  }
}

/**
 * 获取热门项目数据
 * @param {number} limit - 限制返回数量，默认3
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export const fetchHotProjects = async (limit: number = 3) => {
  try {
    // 获取100个token,然后取前N个
    const result = await fetchTokenList('hot', 100)

    if (!result.success) {
      throw new Error(result.error)
    }

    if (!result.data || result.data.length === 0) {
      return {
        success: true,
        data: []
      }
    }

    // 转换数据格式并限制数量
    const hotProjects = result.data
      .slice(0, limit)
      .map(transformToHotProject)

    return {
      success: true,
      data: hotProjects
    }
  } catch (error) {
    console.error('Error fetching hot projects:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * 获取精选代币数据
 * @param {number} limit - 限制返回数量，默认15
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export const fetchFeaturedTokens = async (limit: number = 15) => {
  try {
    // 获取100个token,然后取前N个
    const result = await fetchTokenList('hot', 100)

    if (!result.success) {
      throw new Error(result.error)
    }

    if (!result.data || result.data.length === 0) {
      return {
        success: true,
        data: []
      }
    }

    // 转换数据格式并限制数量
    const featuredTokens = result.data
      .slice(0, limit)
      .map(transformToFeaturedToken)

    return {
      success: true,
      data: featuredTokens
    }
  } catch (error) {
    console.error('Error fetching featured tokens:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
