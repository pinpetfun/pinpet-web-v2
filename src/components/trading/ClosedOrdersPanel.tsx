import React, { useState } from 'react';
import { AdjustmentsHorizontalIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import ClosedOrderItem from './ClosedOrderItem';

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

  // TODO: 这里将来需要从API获取已关闭的订单数据
  // 目前使用模拟数据展示UI
  const mockClosedOrders = [
    {
      id: '1',
      tokenSymbol: 'PEPE',
      tokenImage: 'https://via.placeholder.com/40',
      direction: 'long',
      closeTime: '2025-11-27 14:30:00',
      margin: '1.50',
      profitPercentage: 15.8,
      profitAmount: '0.237',
      closeReason: 'manual', // manual, stop_loss, take_profit
      mint: 'ABC123...'
    },
    {
      id: '2',
      tokenSymbol: 'DOGE',
      tokenImage: 'https://via.placeholder.com/40',
      direction: 'short',
      closeTime: '2025-11-27 13:15:00',
      margin: '2.00',
      profitPercentage: -8.5,
      profitAmount: '-0.170',
      closeReason: 'stop_loss',
      mint: 'DEF456...'
    },
    {
      id: '3',
      tokenSymbol: 'SHIB',
      tokenImage: 'https://via.placeholder.com/40',
      direction: 'long',
      closeTime: '2025-11-27 12:00:00',
      margin: '0.80',
      profitPercentage: 22.3,
      profitAmount: '0.178',
      closeReason: 'take_profit',
      mint: 'GHI789...'
    }
  ];

  const [closedOrders] = useState(mockClosedOrders);

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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // TODO: 调用API刷新数据
    console.log('[ClosedOrdersPanel] Refreshing closed orders...');
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
      <div className="p-4 space-y-4">
        {displayedOrders.length === 0 ? (
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
