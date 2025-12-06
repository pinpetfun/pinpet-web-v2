import React, { useState, useEffect, useCallback } from 'react';
import { AdjustmentsHorizontalIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import PositionItem from './PositionItem';
import { useWalletContext } from '../../contexts/WalletContext';
import { usePinPetSdk } from '../../contexts/PinPetSdkContext';
import { config, convertIpfsUrl } from '../../config';
import { calculateLongProfitPercentage, calculateShortProfitPercentage, formatProfitPercentage } from '../../utils/profitCalculator';
import { getEmojiImage } from '../../config/emojiConfig';

const PositionPanel = ({ mintAddress = null }) => {
  // 从 localStorage 读取过滤模式，默认为 "all"
  const getInitialFilterMode = () => {
    try {
      const saved = localStorage.getItem('pinpet_position_filter_mode');
      return saved === 'current' ? 'current' : 'all';
    } catch {
      return 'all';
    }
  };
  
  const [filterMode, setFilterMode] = useState(getInitialFilterMode());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [positions, setPositions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 获取钱包地址和 SDK
  const { walletAddress, connected } = useWalletContext();
  const { sdk, isReady } = usePinPetSdk();

  // 转换API数据到UI格式
  const transformApiData = useCallback((apiOrders) => {
    return apiOrders.map((order) => {
      // 专注调试价格传递问题
      // console.log('[PositionPanel] 🔍 API order latest_price 调试:', {
        // 原始latest_price: order.latest_price,
        // 类型: typeof order.latest_price,
        // 字符串形式: String(order.latest_price),
        // 是否为undefined: order.latest_price === undefined,
        // 是否为null: order.latest_price === null
      // });

      // 调试 realized_sol_amount
      // console.log('[PositionPanel] 🔍 API order realized_sol_amount 调试:', {
        // 原始realized_sol_amount: order.realized_sol_amount,
        // 类型: typeof order.realized_sol_amount,
        // 字符串形式: String(order.realized_sol_amount),
        // 是否为undefined: order.realized_sol_amount === undefined,
        // 是否为null: order.realized_sol_amount === null,
        // order_pda: order.order_pda
      // });
      
      // 计算完整的盈亏数据 - 直接使用原始 order 对象
      let profitResult = null;
      if (isReady && sdk && order.order_type) {
        if (order.order_type === 1) {
          profitResult = calculateLongProfitPercentage(sdk, order);
        } else if (order.order_type === 2) {
          profitResult = calculateShortProfitPercentage(sdk, order);
        }
      }
      
      const profitPercentage = profitResult ? profitResult.profitPercentage : null;
      const netProfit = profitResult ? profitResult.netProfit : null;
      const grossProfit = profitResult ? profitResult.grossProfit : null;
      const stopLossPercentage = profitResult ? profitResult.stopLossPercentage : null;
      const profitDisplay = formatProfitPercentage(profitPercentage);

      // 🔍 调试：检查 order_id 在转换前
      // console.log('[PositionPanel transformApiData] 🔍 转换前 order.order_id:', order.order_id);

      const transformedPosition = {
        // UI显示字段（保持现有逻辑）
        id: order.order_pda,
        tokenSymbol: order.symbol,
        tokenImage: convertIpfsUrl(order.image) || getEmojiImage('default', 40),
        pair: order.symbol,
        direction: order.order_type === 1 ? 'long' : 'short',
        orderPda: order.order_pda.slice(0, 6),
        mint: order.mint, // 保留 mint 字段用于过滤

        // 新增盈亏相关字段
        profitPercentage: profitPercentage,
        profitDisplay: profitDisplay,
        netProfit: netProfit,
        grossProfit: grossProfit,
        stopLossPercentage: stopLossPercentage,

        // 完整的 order 数据（保留所有字段以备后用）
        order_id: order.order_id, // ✅ 新增：订单ID（用于新版平仓接口）
        order_type: order.order_type,
        user: order.user,
        lock_lp_start_price: order.lock_lp_start_price,
        lock_lp_end_price: order.lock_lp_end_price,
        lock_lp_sol_amount: order.lock_lp_sol_amount,
        lock_lp_token_amount: order.lock_lp_token_amount,
        start_time: order.start_time,
        end_time: order.end_time,
        margin_init_sol_amount: order.margin_init_sol_amount,
        margin_sol_amount: order.margin_sol_amount,
        borrow_amount: order.borrow_amount,
        position_asset_amount: order.position_asset_amount,
        borrow_fee: order.borrow_fee,
        realized_sol_amount: order.realized_sol_amount, // 实现盈亏的sol数量
        order_pda_full: order.order_pda, // 完整的 order_pda
        latest_price: order.latest_price,
        latest_trade_time: order.latest_trade_time,
        name: order.name,
        symbol: order.symbol,
        image: order.image // 原始图片URL
      };

      // 🔍 调试：检查转换后的 order_id
      // console.log('[PositionPanel transformApiData] 🔍 转换后 transformedPosition.order_id:', transformedPosition.order_id);

      return transformedPosition;
    });
  }, [isReady, sdk]);

  // 获取持仓数据
  const fetchPositions = useCallback(async () => {
    if (!connected || !walletAddress) {
      setPositions([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // ✅ 新接口: 获取用户活跃订单 (一次性获取1000条)
      const ordersUrl = `${config.pinpetApiUrl}/api/orderbook/user/${walletAddress}/active?page=1&page_size=1000`;

      // console.log('[PositionPanel] 正在调用的API URL:', ordersUrl);
      // console.log('[PositionPanel] config.pinpetApiUrl:', config.pinpetApiUrl);
      // console.log('[PositionPanel] walletAddress:', walletAddress);

      const ordersResponse = await fetch(ordersUrl, {
        headers: { 'accept': 'application/json' }
      });

      if (!ordersResponse.ok) {
        throw new Error(`HTTP error! status: ${ordersResponse.status}`);
      }

      const ordersResult = await ordersResponse.json();

      // console.log('[PositionPanel] 订单接口响应:', {
        // code: ordersResult.code,
        // message: ordersResult.message,
        // 订单数量: ordersResult.data?.orders?.length || 0
      // });

      // 检查响应格式 (兼容 code: 200/0 和 success: true 两种格式)
      const isSuccess = ordersResult.code === 200 || ordersResult.code === 0 || ordersResult.success === true;
      if (!isSuccess) {
        throw new Error(ordersResult.message || 'Invalid response format');
      }

      const orders = ordersResult.data?.orders || [];

      if (orders.length === 0) {
        // console.log('[PositionPanel] 没有活跃订单');
        setPositions([]);
        setIsLoading(false);
        return;
      }

      // 提取唯一的 mint 地址
      const uniqueMints = [...new Set(orders.map(o => o.mint))];

      // console.log('[PositionPanel] 需要获取Token信息的mint数量:', uniqueMints.length);

      // 批量获取 Token 详情
      const tokensData = await Promise.all(
        uniqueMints.map(async (mint) => {
          try {
            const tokenUrl = `${config.pinpetApiUrl}/api/tokens/mint/${mint}`;
            const response = await fetch(tokenUrl, {
              headers: { 'accept': 'application/json' }
            });

            if (!response.ok) {
              // console.warn(`[PositionPanel] Token ${mint} 获取失败: ${response.status}`);
              return null;
            }

            const result = await response.json();

            // 兼容 code: 200/0 两种格式
            if (result.code !== 200 && result.code !== 0) {
              // console.warn(`[PositionPanel] Token ${mint} 响应错误: ${result.message}`);
              return null;
            }

            return result.data;
          } catch (error) {
            // console.error(`[PositionPanel] Token ${mint} 请求失败:`, error);
            return null;
          }
        })
      );

      // 创建 mint -> tokenData 映射
      const tokenMap = {};
      tokensData.forEach((tokenData, index) => {
        if (tokenData) {
          tokenMap[uniqueMints[index]] = tokenData;
        }
      });

      // console.log('[PositionPanel] Token数据获取完成:', {
        // 请求数量: uniqueMints.length,
        // 成功数量: Object.keys(tokenMap).length,
        // 失败数量: uniqueMints.length - Object.keys(tokenMap).length
      // });

      // 合并订单数据和 Token 数据
      const enrichedOrders = orders.map(order => {
        const tokenData = tokenMap[order.mint];

        if (!tokenData) {
          // console.warn(`[PositionPanel] Token数据缺失 mint: ${order.mint}`);
        }

        // 🔍 调试：检查原始 order 对象
        // console.log('[PositionPanel] 🔍 原始 API order 对象:', order);
        // console.log('[PositionPanel] 🔍 order.order_id:', order.order_id);
        // console.log('[PositionPanel] 🔍 order 所有键:', Object.keys(order));

        return {
          ...order,
          // 补充缺失字段
          order_pda: `${order.mint}_${order.order_id}`, // 自定义唯一标识
          symbol: tokenData?.symbol || 'UNKNOWN',
          name: tokenData?.name || 'Unknown Token',
          image: tokenData?.uri_data?.image || null,
          latest_price: tokenData?.latest_price || '0',
          latest_trade_time: tokenData?.updated_at || Math.floor(Date.now() / 1000),
        };
      });

      const transformedPositions = transformApiData(enrichedOrders);
      // console.log('[PositionPanel] 转换后的持仓数量:', transformedPositions.length);
      setPositions(transformedPositions);

    } catch (error) {
      // console.error('[PositionPanel] Failed to fetch positions:', error);
      setError(error.message);
      setPositions([]);
    } finally {
      setIsLoading(false);
    }
  }, [connected, walletAddress, transformApiData]);

  // 组件挂载和钱包连接变化时获取数据
  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  // 10秒循环获取数据
  useEffect(() => {
    if (!connected || !walletAddress) {
      return;
    }

    const interval = setInterval(() => {
      fetchPositions();
    }, 10000); // 10秒

    return () => clearInterval(interval);
  }, [connected, walletAddress, fetchPositions]);

  // 处理过滤模式切换
  const handleFilterToggle = () => {
    const newMode = filterMode === 'all' ? 'current' : 'all';
    setFilterMode(newMode);
    
    // 保存到 localStorage
    try {
      localStorage.setItem('pinpet_position_filter_mode', newMode);
    } catch (error) {
      // console.warn('[PositionPanel] Failed to save filter mode to localStorage:', error);
    }
  };

  // 根据过滤模式决定显示的持仓
  const getFilteredPositions = () => {
    if (filterMode === 'current' && mintAddress) {
      return positions.filter(position => position.mint === mintAddress);
    }
    
    // Show All 模式：如果有当前 mint，将其排在最前面
    if (filterMode === 'all' && mintAddress) {
      const currentMintPositions = positions.filter(position => position.mint === mintAddress);
      const otherPositions = positions.filter(position => position.mint !== mintAddress);
      return [...currentMintPositions, ...otherPositions];
    }
    
    return positions; // Show All (无当前 mint)
  };

  const displayedPositions = getFilteredPositions();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchPositions();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
  };

  const handleClosePosition = (positionId) => {
    // console.log(`平仓持仓 ${positionId}`);
  };

  const handlePartialClose = (positionId) => {
    // console.log(`部分平仓 ${positionId}`);
  };

  const handleBoost = (positionId) => {
    // console.log(`增强持仓 ${positionId}`);
  };

  return (
    <div className="bg-white border-4 border-black rounded-2xl h-fit mt-4">
      {/* 头部区域 */}
      <div className="p-4 border-b-2 border-black flex justify-between items-center">
        <h2 className="text-lg font-nunito text-black">Margin Position List</h2>
        <div className="flex items-center space-x-4">
          <button 
            onClick={handleFilterToggle}
            className="text-sm text-gray-600 hover:text-black flex items-center font-nunito transition-colors"
          >
            <AdjustmentsHorizontalIcon className="h-5 w-5 mr-1" />
            {filterMode === 'all' ? 'Show One' : 'Show All'}
          </button>
          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-sm text-gray-600 hover:text-black flex items-center font-nunito transition-colors disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-5 w-5 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* 持仓列表区域 */}
      <div className="p-4 space-y-4">
        {isLoading && positions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-2xl mb-2">⏳</div>
            <div className="font-nunito text-lg">Loading Positions...</div>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">
            <div className="text-2xl mb-2">❌</div>
            <div className="font-nunito text-lg">Failed to Load</div>
            <div className="text-sm mt-1">{error}</div>
            <button 
              onClick={handleRefresh}
              className="mt-2 px-4 py-2 bg-red-500 text-white rounded font-nunito text-sm hover:bg-red-600"
            >
              Retry
            </button>
          </div>
        ) : !connected ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-3xl mb-2">🔌</div>
            <div className="font-nunito text-lg">Connect Wallet</div>
            <div className="text-sm mt-1">Please connect your wallet to view positions</div>
          </div>
        ) : displayedPositions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-3xl mb-2">📊</div>
            <div className="font-nunito text-lg">No Positions</div>
            <div className="text-sm mt-1">Start your first trade in the trading panel!</div>
          </div>
        ) : (
          displayedPositions.map((position) => (
            <PositionItem
              key={position.id}
              position={position}
              onClose={() => handleClosePosition(position.id)}
              onPartialClose={() => handlePartialClose(position.id)}
              _onInfo={() => handleBoost(position.id)}
              onRefresh={fetchPositions}
            />
          ))
        )}
      </div>

      {/* 过滤状态提示 */}
      {filterMode === 'current' && mintAddress && (
        <div className="p-2 bg-blue-50 border-t-2 border-black text-center">
          <div className="text-xs text-blue-600 font-nunito">
            Showing positions for current token only
          </div>
        </div>
      )}
    </div>
  );
};

export default PositionPanel;