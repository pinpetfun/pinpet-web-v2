import React, { useState } from 'react';
import { usePinPetSdk } from '../../contexts/PinPetSdkContext';
import { useWalletContext } from '../../contexts/WalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { TradingToast, PdaInfoDialog } from '../common';
import PartialCloseDialog from './PartialCloseDialog';
import { getEmojiImage } from '../../config/emojiConfig';

interface PositionItemProps {
  position: any;
  onClose: any;
  onPartialClose: any;
  _onInfo: any;
  onRefresh: any;
}

const PositionItem = ({ position, onClose, onPartialClose, _onInfo, onRefresh }: PositionItemProps) => {
  // 🔍 调试：打印完整的 position 对象
  console.log('[PositionItem] 🔍 完整 position 对象:', position);
  console.log('[PositionItem] 🔍 position.order_id:', position?.order_id);
  console.log('[PositionItem] 🔍 position 所有键:', Object.keys(position || {}));

  const {
    tokenImage,
    pair,
    direction,
    _orderPda,
    mint,
    order_pda_full,
    lock_lp_token_amount,
    lock_lp_sol_amount,
    order_type,
    profitDisplay,
    profitPercentage,
    _netProfit,
    grossProfit,
    _margin_sol_amount,
    margin_init_sol_amount,
    stopLossPercentage,
    realized_sol_amount,
    order_id,  // 新增：订单ID
    user       // 新增：订单创建者地址
  } = position;

  // SDK 和钱包 hooks
  const { sdk, isReady } = usePinPetSdk();
  const { walletAddress, connected } = useWalletContext();
  const { signTransaction } = useWallet();

  // 平仓状态
  const [isProcessing, setIsProcessing] = useState(false);

  // 部分平仓对话框状态
  const [showPartialDialog, setShowPartialDialog] = useState(false);
  
  // PDA信息对话框状态
  const [showPdaInfoDialog, setShowPdaInfoDialog] = useState(false);

  // 提示框状态
  const [toast, setToast] = useState({
    isVisible: false,
    type: 'success',
    message: '',
    txHash: ''
  });

  // 格式化保证金显示 (从 lamports 转换为 SOL，9位精度)
  const formatMarginSol = (marginLamports) => {
    if (!marginLamports || marginLamports === 0) return '0.00';
    const solAmount = marginLamports / 1000000000; // lamports 转 SOL
    return solAmount.toFixed(2);
  };

  // 格式化毛收益显示 (从 lamports 转换为 SOL，9位精度)
  const formatGrossProfitSol = (grossProfitLamports) => {
    if (grossProfitLamports === null || grossProfitLamports === undefined) return '--';
    const solAmount = grossProfitLamports / 1000000000; // lamports 转 SOL
    return solAmount.toFixed(2);
  };

  // 格式化止损位百分比显示
  const formatStopLossPercentage = (stopLossPercent) => {
    if (stopLossPercent === null || stopLossPercent === undefined) return '15%';
    return `${stopLossPercent.toFixed(1)}%`;
  };

  // 格式化实现盈亏显示 (从 lamports 转换为 SOL，保留2位小数)
  const formatRealizedSol = (realizedLamports) => {
    if (realizedLamports === null || realizedLamports === undefined || realizedLamports === 0) return null;
    const solAmount = realizedLamports / 1000000000; // lamports 转 SOL
    return solAmount.toFixed(2);
  };

  // 显示提示框
  const showToast = (type, message, txHash = '') => {
    setToast({
      isVisible: true,
      type,
      message,
      txHash
    });
  };

  // 关闭提示框
  const closeToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  // 处理部分平仓按钮点击
  const handlePartialClick = () => {
    setShowPartialDialog(true);
  };

  // 处理部分平仓对话框关闭
  const handlePartialDialogClose = () => {
    setShowPartialDialog(false);
  };

  // 处理PDA信息对话框打开
  const handleInfoClick = () => {
    setShowPdaInfoDialog(true);
  };

  // 处理PDA信息对话框关闭
  const handlePdaInfoDialogClose = () => {
    setShowPdaInfoDialog(false);
  };

  // 处理部分平仓确认 (now handled in PartialCloseDialog.jsx)
  const handlePartialCloseConfirm = async ({ position, buyAmount, estimatedReceive }) => {
    console.log('[PartialClose] Partial close confirmed in dialog:', {
      position: position.id,
      buyAmount,
      estimatedReceive
    });

    // The actual partial close logic is now handled in PartialCloseDialog.jsx
    // This callback is mainly for logging/tracking purposes
    
    // Call original callback if needed (for backward compatibility)
    if (onPartialClose) {
      onPartialClose(position, buyAmount);
    }
  };

  // 处理平仓逻辑
  const handleClosePosition = async () => {
    // 验证前置条件
    if (!connected) {
      showToast('error', 'Please connect your wallet first');
      return;
    }

    if (!isReady || !sdk) {
      showToast('error', 'SDK not ready, please try again later');
      return;
    }

    if (!mint) {
      showToast('error', 'Token address not found');
      return;
    }

    if (!walletAddress) {
      showToast('error', 'Unable to get wallet address');
      return;
    }

    if (!order_id) {
      showToast('error', 'Order ID not found');
      return;
    }

    try {
      setIsProcessing(true);
      console.log('[PositionItem] 开始平仓流程...', {
        orderType: order_type,
        direction,
        mint,
        orderId: order_id,
        lockLpTokenAmount: lock_lp_token_amount,
        lockLpSolAmount: lock_lp_sol_amount
      });

      let result;
      let closeOrderIndices;

      if (order_type === 1) { // Long 平仓
        console.log('[PositionItem] 执行 Long 平仓...');

        // 使用模拟器获取平仓候选索引
        try {
          const closeIndicesResult = await sdk.simulator.simulateLongClose(mint, order_id);
          closeOrderIndices = closeIndicesResult.closeOrderIndices;
          console.log('[PositionItem] 做多平仓候选索引:', closeOrderIndices);
        } catch (error) {
          console.error('[PositionItem] 生成做多平仓索引失败:', error);
          showToast('error', 'Failed to generate close indices');
          return;
        }

        result = await sdk.trading.closeLong({
          mintAccount: mint,
          sellTokenAmount: new anchor.BN(lock_lp_token_amount.toString()),
          minSolOutput: new anchor.BN("0"),
          closeOrderId: order_id,
          closeOrderIndices: closeOrderIndices,
          payer: new PublicKey(walletAddress),
          userSolAccount: user || walletAddress  // 使用订单创建者地址或当前钱包地址
        });
      } else { // Short 平仓
        console.log('[PositionItem] 执行 Short 平仓...');

        // 使用模拟器获取平仓候选索引
        try {
          const closeIndicesResult = await sdk.simulator.simulateShortClose(mint, order_id);
          closeOrderIndices = closeIndicesResult.closeOrderIndices;
          console.log('[PositionItem] 做空平仓候选索引:', closeOrderIndices);
        } catch (error) {
          console.error('[PositionItem] 生成做空平仓索引失败:', error);
          showToast('error', 'Failed to generate close indices');
          return;
        }

        result = await sdk.trading.closeShort({
          mintAccount: mint,
          buyTokenAmount: new anchor.BN(lock_lp_token_amount.toString()),
          maxSolAmount: new anchor.BN(lock_lp_sol_amount.toString()),
          closeOrderId: order_id,
          closeOrderIndices: closeOrderIndices,
          payer: new PublicKey(walletAddress),
          userSolAccount: user || walletAddress  // 使用订单创建者地址或当前钱包地址
        });
      }

      console.log('[PositionItem] SDK 返回结果:', result);

      // 获取最新的 blockhash
      console.log('[PositionItem] 获取最新 blockhash...');
      const connection = sdk.connection || sdk.getConnection();
      const { blockhash } = await connection.getLatestBlockhash();
      result.transaction.recentBlockhash = blockhash;
      result.transaction.feePayer = new PublicKey(walletAddress);

      console.log('[PositionItem] 更新 blockhash:', blockhash);

      // 钱包签名
      console.log('[PositionItem] 请求钱包签名...');
      const signedTransaction = await signTransaction(result.transaction);

      console.log('[PositionItem] 钱包签名完成');

      // 发送交易
      console.log('[PositionItem] 发送交易...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());

      console.log('[PositionItem] 等待交易确认...');
      await connection.confirmTransaction(signature, 'confirmed');

      console.log('[PositionItem] ✅ 平仓成功!');
      console.log('[PositionItem] 交易签名:', signature);

      // 显示成功提示框
      showToast('success', `Successfully closed ${direction} position`, signature);

      // 调用原有的回调
      if (onClose) {
        onClose(position.id);
      }

      // 刷新持仓列表
      if (onRefresh) {
        setTimeout(() => {
          onRefresh();
        }, 2000); // 2秒后刷新数据
      }

    } catch (error) {
      console.error('[PositionItem] 平仓失败:', error);

      let errorMessage = error.message;
      if (error.message.includes('User rejected')) {
        errorMessage = 'Transaction was rejected by user';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient SOL balance';
      } else if (error.message.includes('blockhash')) {
        errorMessage = 'Network busy, please try again later';
      }

      // 显示错误提示框
      showToast('error', errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

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

  return (
    <div className={`bg-white p-4 rounded-lg border-2 border-gray-200 border-l-4 ${directionStyles.borderColor} hover:border-gray-300 transition-all duration-200`}>
      <div className="flex items-center justify-between mb-3">
        {/* 左侧：代币信息 */}
        <div className="flex items-center space-x-3">
          <img
            alt={`${pair} icon`}
            className="w-10 h-10 rounded-full border-2 border-gray-300"
            src={tokenImage}
            onError={(e) => {
              (e.target as HTMLImageElement).src = getEmojiImage('default', 40);
            }}
          />
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="font-nunito text-lg text-black font-bold">{pair}</span>
              <span className={`text-xs font-semibold ${directionStyles.tagText} ${directionStyles.tagBg} px-2 py-0.5 rounded-full`}>
                {directionStyles.tagLabel}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              Margin: <span className="text-black font-medium">{formatMarginSol(margin_init_sol_amount)} SOL</span>
              <span className="ml-3">SL: <span className="text-black font-medium">{formatStopLossPercentage(stopLossPercentage)}</span></span>
              {formatRealizedSol(realized_sol_amount) && (
                <span className="ml-3">RLZ: <span className="text-black font-medium">{formatRealizedSol(realized_sol_amount)} SOL</span></span>
              )}
            </div>
          </div>
        </div>
        
        {/* 右侧：盈亏百分比和净收益显示 */}
        <div className="text-right">
          <div className={`text-lg font-medium ${
            profitPercentage === null || profitPercentage === undefined ? 'text-gray-400' :
            profitPercentage > 0 ? 'text-green-600' :
            profitPercentage < 0 ? 'text-red-600' :
            'text-gray-600'
          }`}>
            {profitDisplay}
          </div>
          <div className={`text-xs mt-1 ${
            grossProfit === null || grossProfit === undefined ? 'text-gray-400' :
            grossProfit > 0 ? 'text-green-500' :
            grossProfit < 0 ? 'text-red-500' :
            'text-gray-500'
          }`}>
            {formatGrossProfitSol(grossProfit)} SOL
          </div>
        </div>
      </div>
      
      {/* 操作按钮区域 */}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t-2 border-gray-200">
        <button 
          onClick={handleClosePosition}
          disabled={isProcessing || !connected || !isReady}
          className="w-full py-2 text-sm font-nunito text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
        >
          {isProcessing ? 'Closing...' : 'Close'}
        </button>
        <button 
          onClick={handlePartialClick}
          className="w-full py-2 text-sm font-nunito text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-all duration-200 active:scale-95"
        >
          Partial
        </button>
        <button 
          onClick={handleInfoClick}
          className="w-full py-2 text-sm font-nunito text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-all duration-200 active:scale-95"
        >
          Info
        </button>
      </div>
      
      {/* 交易结果提示框 */}
      <TradingToast
        isVisible={toast.isVisible}
        type={toast.type}
        message={toast.message}
        txHash={toast.txHash}
        onClose={closeToast}
      />
      
      {/* 部分平仓对话框 */}
      <PartialCloseDialog
        isOpen={showPartialDialog}
        onClose={handlePartialDialogClose}
        position={position}
        onConfirmPartialClose={handlePartialCloseConfirm}
        onRefresh={onRefresh}
      />
      
      {/* PDA信息对话框 */}
      <PdaInfoDialog
        isOpen={showPdaInfoDialog}
        onClose={handlePdaInfoDialogClose}
        title="MarginOrder"
        pdaType="MarginOrder"
        pdaAddress={order_pda_full}
      />
    </div>
  );
};

export default PositionItem;