import React from 'react';
import { getEmojiImage } from '../../config/emojiConfig';

interface ClosedOrderItemProps {
  order: {
    id: string;
    tokenSymbol: string;
    tokenImage: string;
    direction: 'long' | 'short';
    closeTime: string;
    margin: string;
    profitPercentage: number;
    profitAmount: string;
    closeReason: 'manual' | 'stop_loss' | 'take_profit';
    mint: string;
  };
}

const ClosedOrderItem = ({ order }: ClosedOrderItemProps) => {
  const {
    tokenSymbol,
    tokenImage,
    direction,
    closeTime,
    margin,
    profitPercentage,
    profitAmount,
    closeReason
  } = order;

  // 根据多空方向确定边框颜色和标签样式
  const directionStyles = direction === 'long'
    ? {
        borderColor: 'border-l-emerald-500',
        tagBg: 'bg-emerald-100',
        tagText: 'text-emerald-600',
        tagLabel: 'LONG'
      }
    : {
        borderColor: 'border-l-red-500',
        tagBg: 'bg-red-100',
        tagText: 'text-red-600',
        tagLabel: 'SHORT'
      };

  // 根据关闭原因显示不同的徽章
  const closeReasonConfig = {
    manual: {
      label: 'Manual Close',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-600'
    },
    stop_loss: {
      label: 'Stop Loss',
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-600'
    },
    take_profit: {
      label: 'Take Profit',
      bgColor: 'bg-green-100',
      textColor: 'text-green-600'
    }
  };

  const closeReasonStyle = closeReasonConfig[closeReason];

  // 判断盈亏颜色
  const profitColor = profitPercentage > 0
    ? 'text-green-600'
    : profitPercentage < 0
    ? 'text-red-600'
    : 'text-gray-600';

  return (
    <div className={`bg-white p-4 rounded-lg border-2 border-gray-200 border-l-4 ${directionStyles.borderColor} hover:border-gray-300 transition-all duration-200`}>
      <div className="flex items-center justify-between mb-3">
        {/* 左侧：代币信息 */}
        <div className="flex items-center space-x-3">
          <img
            alt={`${tokenSymbol} icon`}
            className="w-10 h-10 rounded-full border-2 border-gray-300"
            src={tokenImage}
            onError={(e) => {
              (e.target as HTMLImageElement).src = getEmojiImage('default', 40);
            }}
          />
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="font-nunito text-lg text-black font-bold">{tokenSymbol}</span>
              <span className={`text-xs font-semibold ${directionStyles.tagText} ${directionStyles.tagBg} px-2 py-0.5 rounded-full`}>
                {directionStyles.tagLabel}
              </span>
              <span className={`text-xs font-semibold ${closeReasonStyle.textColor} ${closeReasonStyle.bgColor} px-2 py-0.5 rounded-full`}>
                {closeReasonStyle.label}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              Margin: <span className="text-black font-medium">{margin} SOL</span>
              <span className="ml-3 text-xs text-gray-500">{closeTime}</span>
            </div>
          </div>
        </div>

        {/* 右侧：盈亏显示 */}
        <div className="text-right">
          <div className={`text-lg font-medium ${profitColor}`}>
            {profitPercentage > 0 ? '+' : ''}{profitPercentage.toFixed(2)}%
          </div>
          <div className={`text-xs mt-1 ${profitColor}`}>
            {profitPercentage > 0 ? '+' : ''}{profitAmount} SOL
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClosedOrderItem;
