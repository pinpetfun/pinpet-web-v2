import React, { useState, useEffect, useCallback } from 'react';
import { AdjustmentsHorizontalIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import ClosedOrderItem from './ClosedOrderItem';
import { useWalletContext } from '../../contexts/WalletContext';
import { config, convertIpfsUrl } from '../../config';
import { getEmojiImage } from '../../config/emojiConfig';
import PinPetSDK from 'pinpet-sdk';

const ClosedOrdersPanel = ({ mintAddress = null }) => {
  // 从 localStorage 读取过滤模式，默认为 "all"
  const getInitialFilterMode = () => {
    try {
      const saved = localStorage.getItem('pinpet_closed_orders_filter_mode');
      return saved === 'current' ? 'current' : 'all';
    } catch {
      return 'all';
    }
  };

  const [filterMode, setFilterMode] = useState(getInitialFilterMode());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [closedOrders, setClosedOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // 获取钱包地址
  const { walletAddress, connected } = useWalletContext();

  // 转换API数据到UI格式 (需要传入 tokenMap)
  const transformApiData = useCallback((apiRecords, tokenMap = {}) => {
    const { CurveAMM } = PinPetSDK;

    return apiRecords.map((record) => {
      const { order, close_info, mint } = record;

      // 获取 Token 信息
      const tokenData = tokenMap[mint];

      // 关闭原因映射 (根据API文档: 1=manual, 2=stop_loss, 3=take_profit)
      const closeReasonMap = {
        1: 'manual',
        2: 'stop_loss',
        3: 'take_profit'
      };

      // 计算盈亏
      let totalProfitSolLamports = 0;

      if (order.order_type === 1) {
        // 做多订单的盈利计算
        // 1. realized_sol_amount: 半平仓已兑现的利润
        const realizedSol = order.realized_sol_amount;

        // 检查是否为强制清算 (close_reason = 2)
        if (close_info.close_reason === 2) {
          // 强平：总获利 = realized_sol_amount - margin_init_sol_amount
          // 因为被强平了，保证金全部损失，只剩下之前半平仓的利润
          totalProfitSolLamports = realizedSol - order.margin_init_sol_amount;

          console.log('[ClosedOrdersPanel] 做多订单强制清算盈利计算:', {
            mint,
            order_id: order.order_id,
            close_reason: close_info.close_reason,
            realized_sol_amount: realizedSol,
            margin_init_sol_amount: order.margin_init_sol_amount,
            total_profit_lamports: totalProfitSolLamports
          });
        } else {
          // 正常平仓（手动或止盈止损）
          // 2. 计算最后平仓时能赚多少 SOL
          // sellFromPriceWithTokenInput 返回 [交易完成后的价格, 得到的SOL数量]
          const sellResult = CurveAMM.sellFromPriceWithTokenInput(
            close_info.close_price,
            order.lock_lp_token_amount
          );

          if (sellResult === null) {
            console.error('[ClosedOrdersPanel] sellFromPriceWithTokenInput 返回 null:', {
              close_price: close_info.close_price,
              lock_lp_token_amount: order.lock_lp_token_amount
            });
            totalProfitSolLamports = 0;
          } else {
            const [, finalSellSol] = sellResult; // 取第二个元素：得到的SOL数量

            // 3. 总获利 = realized_sol_amount + (最后赚取的sol - lock_lp_sol_amount) - margin_init_sol_amount
            totalProfitSolLamports = realizedSol + (Number(finalSellSol) - order.lock_lp_sol_amount) - order.margin_init_sol_amount;

            console.log('[ClosedOrdersPanel] 做多订单正常平仓盈利计算:', {
              mint,
              order_id: order.order_id,
              close_reason: close_info.close_reason,
              realized_sol_amount: realizedSol,
              close_price: close_info.close_price,
              lock_lp_token_amount: order.lock_lp_token_amount,
              final_sell_sol: Number(finalSellSol),
              lock_lp_sol_amount: order.lock_lp_sol_amount,
              margin_init_sol_amount: order.margin_init_sol_amount,
              total_profit_lamports: totalProfitSolLamports
            });
          }
        }
      } else if (order.order_type === 2) {
        // 做空订单的盈利计算
        // 1. realized_sol_amount: 半平仓已兑现的利润
        const realizedSol = order.realized_sol_amount;

        // 检查是否为强制清算 (close_reason = 2)
        if (close_info.close_reason === 2) {
          // 强平：保证金刚好扣完，总获利 = realized_sol_amount
          totalProfitSolLamports = realizedSol - order.margin_sol_amount;

          console.log('[ClosedOrdersPanel] 做空订单强制清算盈利计算:', {
            mint,
            order_id: order.order_id,
            close_reason: close_info.close_reason,
            realized_sol_amount: realizedSol,
            total_profit_lamports: totalProfitSolLamports
          });
        } else {
          // 正常平仓（手动或止盈止损）
          // 2. borrow_amount: 需要归还的Token数量
          // 3. 计算平仓需要花费的 SOL
          // buyFromPriceWithTokenOutput 返回 [交易完成后的价格, 需要支付的SOL数量]
          const buyResult = CurveAMM.buyFromPriceWithTokenOutput(
            close_info.close_price,
            order.borrow_amount
          );

          if (buyResult === null) {
            console.error('[ClosedOrdersPanel] buyFromPriceWithTokenOutput 返回 null:', {
              close_price: close_info.close_price,
              borrow_amount: order.borrow_amount
            });
            totalProfitSolLamports = realizedSol;
          } else {
            const [, closeCostSol] = buyResult; // 取第二个元素：平仓需要支付的SOL数量

            // 4. 最后平仓收益 = margin_sol_amount - 平仓成本 + lock_lp_sol_amount (锁定的LP SOL返还)
            const finalProfit =  order.lock_lp_sol_amount - Number(closeCostSol) - order.margin_sol_amount  ;

            // 5. 总获利 = realized_sol_amount + 最后平仓收益
            totalProfitSolLamports = realizedSol + finalProfit;

            console.log('[ClosedOrdersPanel] 做空订单正常平仓盈利计算:', {
              mint,
              order_id: order.order_id,
              close_reason: close_info.close_reason,
              realized_sol_amount: realizedSol,
              close_price: close_info.close_price,
              borrow_amount: order.borrow_amount,
              close_cost_sol: Number(closeCostSol),
              margin_sol_amount: order.margin_sol_amount,
              lock_lp_sol_amount: order.lock_lp_sol_amount,
              final_profit: finalProfit,
              total_profit_lamports: totalProfitSolLamports,
              计算公式: `realized_sol(${realizedSol}) + margin_sol(${order.margin_sol_amount}) - close_cost(${Number(closeCostSol)}) + lock_lp_sol(${order.lock_lp_sol_amount})`
            });
          }
        }
      } else {
        // 未知订单类型
        console.warn('[ClosedOrdersPanel] 未知订单类型:', order.order_type);
        totalProfitSolLamports = 0;
      }

      // 计算盈亏百分比 = (总获利sol数 / margin_init_sol_amount) * 100
      const profitPercentage = order.margin_init_sol_amount > 0
        ? (totalProfitSolLamports / order.margin_init_sol_amount) * 100
        : 0;

      // 将 lamports 转换为 SOL
      const marginSol = (order.margin_init_sol_amount / 1_000_000_000).toFixed(4);
      const profitSol = (totalProfitSolLamports / 1_000_000_000).toFixed(4);

      // 格式化关闭时间
      const closeTime = new Date(close_info.close_timestamp * 1000).toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      return {
        id: `${mint}_${order.order_id}`,
        tokenSymbol: tokenData?.symbol || 'UNKNOWN',
        tokenImage: convertIpfsUrl(tokenData?.uri_data?.image) || getEmojiImage('default', 40),
        direction: order.order_type === 1 ? 'long' : 'short',
        closeTime: closeTime,
        margin: marginSol,
        profitPercentage: profitPercentage,
        profitAmount: profitSol,
        closeReason: closeReasonMap[close_info.close_reason] || 'manual',
        mint: mint,

        // 保留原始数据以备后用
        rawOrder: order,
        rawCloseInfo: close_info,
        tokenData: tokenData
      };
    });
  }, []);

  // 获取历史订单数据
  const fetchClosedOrders = useCallback(async () => {
    if (!connected || !walletAddress) {
      setClosedOrders([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const historyUrl = `${config.pinpetApiUrl}/api/orderbook/user/${walletAddress}/history?page=1&page_size=1000`;

      console.log('[ClosedOrdersPanel] 正在调用的API URL:', historyUrl);
      console.log('[ClosedOrdersPanel] walletAddress:', walletAddress);

      const response = await fetch(historyUrl, {
        headers: { 'accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      console.log('[ClosedOrdersPanel] 历史订单接口响应:', {
        code: result.code,
        msg: result.msg,
        订单数量: result.data?.records?.length || 0
      });

      // 检查响应格式
      if (result.code !== 200) {
        throw new Error(result.msg || 'Invalid response format');
      }

      const records = result.data?.records || [];

      if (records.length === 0) {
        console.log('[ClosedOrdersPanel] 没有历史订单');
        setClosedOrders([]);
        setIsLoading(false);
        return;
      }

      // 提取唯一的 mint 地址
      const uniqueMints = [...new Set(records.map(r => r.mint))];

      console.log('[ClosedOrdersPanel] 需要获取Token信息的mint数量:', uniqueMints.length);

      // 批量获取 Token 详情
      const tokensData = await Promise.all(
        uniqueMints.map(async (mint) => {
          try {
            const tokenUrl = `${config.pinpetApiUrl}/api/tokens/mint/${mint}`;
            const response = await fetch(tokenUrl, {
              headers: { 'accept': 'application/json' }
            });

            if (!response.ok) {
              console.warn(`[ClosedOrdersPanel] Token ${mint} 获取失败: ${response.status}`);
              return null;
            }

            const result = await response.json();

            // 兼容 code: 200/0 两种格式
            if (result.code !== 200 && result.code !== 0) {
              console.warn(`[ClosedOrdersPanel] Token ${mint} 响应错误: ${result.message}`);
              return null;
            }

            return result.data;
          } catch (error) {
            console.error(`[ClosedOrdersPanel] Token ${mint} 请求失败:`, error);
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

      console.log('[ClosedOrdersPanel] Token数据获取完成:', {
        请求数量: uniqueMints.length,
        成功数量: Object.keys(tokenMap).length,
        失败数量: uniqueMints.length - Object.keys(tokenMap).length
      });

      const transformedOrders = transformApiData(records, tokenMap);
      console.log('[ClosedOrdersPanel] 转换后的历史订单数量:', transformedOrders.length);
      setClosedOrders(transformedOrders);

    } catch (error) {
      console.error('[ClosedOrdersPanel] Failed to fetch closed orders:', error);
      setError(error.message);
      setClosedOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [connected, walletAddress, transformApiData]);

  // 处理过滤模式切换
  const handleFilterToggle = () => {
    const newMode = filterMode === 'all' ? 'current' : 'all';
    setFilterMode(newMode);

    // 保存到 localStorage
    try {
      localStorage.setItem('pinpet_closed_orders_filter_mode', newMode);
    } catch (error) {
      console.warn('[ClosedOrdersPanel] Failed to save filter mode to localStorage:', error);
    }
  };

  // 根据过滤模式决定显示的订单
  const getFilteredOrders = () => {
    if (filterMode === 'current' && mintAddress) {
      return closedOrders.filter(order => order.mint === mintAddress);
    }

    // Show All 模式：如果有当前 mint，将其排在最前面
    if (filterMode === 'all' && mintAddress) {
      const currentMintOrders = closedOrders.filter(order => order.mint === mintAddress);
      const otherOrders = closedOrders.filter(order => order.mint !== mintAddress);
      return [...currentMintOrders, ...otherOrders];
    }

    return closedOrders; // Show All (无当前 mint)
  };

  const displayedOrders = getFilteredOrders();

  // 组件挂载和钱包连接变化时获取数据
  useEffect(() => {
    fetchClosedOrders();
  }, [fetchClosedOrders]);

  // 10秒循环获取数据
  useEffect(() => {
    if (!connected || !walletAddress) {
      return;
    }

    const interval = setInterval(() => {
      fetchClosedOrders();
    }, 10000); // 10秒

    return () => clearInterval(interval);
  }, [connected, walletAddress, fetchClosedOrders]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchClosedOrders();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
  };

  return (
    <div className="bg-white border-4 border-black rounded-2xl h-fit mt-4">
      {/* 头部区域 */}
      <div className="p-4 border-b-2 border-black flex justify-between items-center">
        <h2 className="text-lg font-nunito text-black">Closed Orders History</h2>
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

      {/* 订单列表区域 */}
      <div className="p-3 space-y-2">
        {isLoading && closedOrders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-2xl mb-2">⏳</div>
            <div className="font-nunito text-lg">Loading Closed Orders...</div>
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
            <div className="text-sm mt-1">Please connect your wallet to view closed orders</div>
          </div>
        ) : displayedOrders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-3xl mb-2">📋</div>
            <div className="font-nunito text-lg">No Closed Orders</div>
            <div className="text-sm mt-1">Your trading history will appear here</div>
          </div>
        ) : (
          displayedOrders.map((order) => (
            <ClosedOrderItem
              key={order.id}
              order={order}
            />
          ))
        )}
      </div>

      {/* 过滤状态提示 */}
      {filterMode === 'current' && mintAddress && (
        <div className="p-2 bg-blue-50 border-t-2 border-black text-center">
          <div className="text-xs text-blue-600 font-nunito">
            Showing closed orders for current token only
          </div>
        </div>
      )}
    </div>
  );
};

export default ClosedOrdersPanel;
