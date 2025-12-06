import React, { useState, useEffect, useCallback } from 'react';
import { calculateSOLFromTokens, formatDisplayNumber } from '../../utils/priceCalculator';
import { usePinPetSdk } from '../../contexts/PinPetSdkContext';
import { useWalletContext } from '../../contexts/WalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { TradingToast } from '../common';
import { getActualSlippage } from '../../config/tradingConfig';

interface SellPanelProps {
  mintAddress?: string;
  tokenSymbol?: string;
  tokenBalance?: number;
  slippageSettings?: { slippage: number };
  onSell?: (amount: any, type: any) => Promise<void> | void;
  onRefreshData?: () => void;
  onUserInputDebounce?: () => void;
  onQuickActionRefresh?: () => void;
  tradingData?: any;
}

const SellPanel = React.memo(({
  mintAddress = "",
  tokenSymbol = "FRIENDS",
  tokenBalance = 0,
  slippageSettings = { slippage: 2 },
  onSell = () => {},
  onRefreshData = () => {},
  onUserInputDebounce = () => {}, // 新增：用户输入防抖回调
  onQuickActionRefresh = () => {}, // 新增：快捷操作刷新回调
  tradingData = {}
}: SellPanelProps) => {
  const { downOrders1000, lastPrice, loading } = tradingData;
  const [amount, setAmount] = useState('0');
  const [isValid, setIsValid] = useState(true);
  
  // 优化后的代币卖出数量状态
  const [optimizedTokenAmount, setOptimizedTokenAmount] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  // SDK 和钱包 hooks
  const { sdk, isReady } = usePinPetSdk();
  const { walletAddress, connected } = useWalletContext();
  const { signTransaction } = useWallet();
  
  // 卖出状态
  const [isProcessing, setIsProcessing] = useState(false);

  // Cooldown 验证状态
  const [needsApproval, setNeedsApproval] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // 提示框状态
  const [toast, setToast] = useState({
    isVisible: false,
    type: 'success', // 'success', 'error', 'info'
    message: '',
    txHash: ''
  });
  
  // 精度转换函数
  const convertToTokenDecimals = (amount, decimals = 6) => {
    const factor = Math.pow(10, decimals);
    return new anchor.BN(Math.floor(amount * factor).toString());
  };
  
  const convertToSolDecimals = (amount, decimals = 9) => {
    const factor = Math.pow(10, decimals);
    return new anchor.BN(Math.floor(amount * factor).toString());
  };
  
  // 滑点计算函数 - 计算最小 SOL 输出
  const calculateMinSolOutput = (solAmount, slippagePercent) => {
    if (slippagePercent > 99) {
      return convertToSolDecimals(0, 9);;
    }
    const slippageMultiplier = 1 - (slippagePercent / 100);
    const minAmount = parseFloat(solAmount) * slippageMultiplier;
    return convertToSolDecimals(minAmount, 9);
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

  // 循环检查 validateCooldown (最多10次，每次间隔3秒)
  const checkCooldownWithRetry = useCallback(async (maxRetries = 10, interval = 3000) => {
    if (!isReady || !sdk || !mintAddress || !walletAddress || tokenBalance <= 0) {
      // console.log('[SellPanel] Skip cooldown check - conditions not met');
      setNeedsApproval(false);
      return;
    }

    // console.log('[SellPanel] Starting cooldown validation with retry...');
    let retries = 0;

    const checkOnce = async () => {
      try {
        retries++;
        // console.log(`[SellPanel] Cooldown validation attempt ${retries}/${maxRetries}`);

        // 调用 validateCooldown，传入 tokenBalance 优化
        const tokenBalanceBN = convertToTokenDecimals(tokenBalance, 6);
        const result = await sdk.tools.validateCooldown({
          mint: mintAddress,
          wallet: new PublicKey(walletAddress),  // validateCooldown 支持直接传入 PublicKey
          tokenBalance: tokenBalanceBN
        });

        // console.log('[SellPanel] Cooldown validation result:', {
          // isValid: result.isValid,
          // exists: result.exists,
          // reason: result.reason,
          // message: result.message
        // });

        if (result.isValid) {
          // 验证通过，显示 Sell 按钮
          // console.log('[SellPanel] ✅ Cooldown validation passed');
          setNeedsApproval(false);
          return true; // 验证通过，停止重试
        } else {
          // 验证不通过，显示 Approve 按钮
          // console.log('[SellPanel] ❌ Cooldown validation failed:', result.reason);
          setNeedsApproval(true);

          // 如果还有重试次数，继续重试
          if (retries < maxRetries) {
            // console.log(`[SellPanel] Will retry in ${interval}ms...`);
            await new Promise(resolve => setTimeout(resolve, interval));
            return await checkOnce();
          } else {
            // console.log('[SellPanel] Max retries reached, needs approval');
            return false;
          }
        }
      } catch (error) {
        // console.error(`[SellPanel] Cooldown validation error (attempt ${retries}):`, error);

        // 如果还有重试次数，继续重试
        if (retries < maxRetries) {
          // console.log(`[SellPanel] Will retry in ${interval}ms...`);
          await new Promise(resolve => setTimeout(resolve, interval));
          return await checkOnce();
        } else {
          // console.log('[SellPanel] Max retries reached after errors');
          setNeedsApproval(false); // 出错时默认显示 Sell 按钮
          return false;
        }
      }
    };

    await checkOnce();
  }, [isReady, sdk, mintAddress, walletAddress, tokenBalance, convertToTokenDecimals]);

  // 二分法优化 sellTokenAmount
  const optimizeSellTokenAmount = useCallback(async (currentAmount, _initialSellTokenAmount) => {
    const userInputTokenAmount = convertToTokenDecimals(parseFloat(currentAmount), 6);
    
    let low = new anchor.BN('1000000'); // 下界：1 token (精度10^6)
    let high = userInputTokenAmount; // 上界：用户输入的数量
    let bestTokenAmount = low;
    let iterations = 0;
    const maxIterations = 15;
    const precision = new anchor.BN('10000000'); // 精度：0.01 token
    
    // console.log('[SellPanel] 开始二分法优化:', {
      // userInputTokenAmount: userInputTokenAmount.toString(),
      // low: low.toString(),
      // high: high.toString(),
      // precision: precision.toString()
    // });

    while (low.lte(high) && iterations < maxIterations) {
      iterations++;
      
      // 计算中点
      const mid = low.add(high).div(new anchor.BN('2'));
      
      try {
        // console.log(`[SellPanel] 二分法迭代----`, lastPrice, downOrders1000);
        // 调用模拟器
        const result = await sdk.simulator.simulateTokenSell(
          mintAddress,
          mid.toString(),
          null,
          lastPrice,
          downOrders1000
        );
        
        const suggestedTokenAmount = result.suggestedTokenAmount || '0';
        
        // console.log(`[SellPanel] 二分法迭代 ${iterations}:`, {
          // mid: mid.toString(),
          // suggestedTokenAmount,
          // userInputTokenAmount: userInputTokenAmount.toString(),
          // satisfies: new anchor.BN(suggestedTokenAmount).lte(userInputTokenAmount)
        // });
        
        // 检查是否满足条件：suggestedTokenAmount <= userInputTokenAmount
        if (new anchor.BN(suggestedTokenAmount).lte(userInputTokenAmount)) {
          bestTokenAmount = mid;
          low = mid.add(new anchor.BN('1')); // 尝试更大的值
        } else {
          high = mid.sub(new anchor.BN('1')); // 尝试更小的值
        }
        
        // 精度检查
        if (high.sub(low).lt(precision)) {
          // console.log('[SellPanel] 达到精度要求，提前结束');
          break;
        }
        
      } catch (error) {
        // console.error(`[SellPanel] 二分法迭代 ${iterations} 失败:`, error);
        high = mid.sub(new anchor.BN('1'));
      }
    }
    
    // console.log('[SellPanel] 二分法优化完成:', {
      // iterations,
      // bestTokenAmount: bestTokenAmount.toString(),
      // bestTokenDisplay: (parseFloat(bestTokenAmount.toString()) / 1e6).toFixed(6)
    // });
    
    return bestTokenAmount;
  }, [sdk, mintAddress, lastPrice, downOrders1000]);

  // 调用 SDK 模拟代币卖出 (参考 BuyPanel)
  const simulateTokenSellOrder = useCallback(async (currentAmount) => {
    if (!isReady || !sdk || !mintAddress || !lastPrice || !downOrders1000) {
      // console.log('[SellPanel] SDK not ready or missing data for sell simulation');
      setOptimizedTokenAmount(null);
      return;
    }

    try {
      setIsOptimizing(true);
      
      // 计算初始 sellTokenAmount (u64 格式，精度 10^6)
      const tokenAmount = parseFloat(currentAmount);
      const initialSellTokenAmount = convertToTokenDecimals(tokenAmount, 6);

      // console.log('[SellPanel] 开始优化代币卖出数量:', {
        // mint: mintAddress,
        // currentAmount,
        // tokenAmount,
        // initialSellTokenAmount: initialSellTokenAmount.toString(),
        // hasLastPrice: !!lastPrice,
        // hasOrdersData: !!downOrders1000
      // });

      // 使用二分法优化
      const optimizedSellTokenAmount = await optimizeSellTokenAmount(currentAmount, initialSellTokenAmount);
      
      // 进行最终模拟验证
      const finalResult = await sdk.simulator.simulateTokenSell(
        mintAddress,
        optimizedSellTokenAmount.toString(),
        null,
        lastPrice,
        downOrders1000
      );

      // console.log('[SellPanel] 最终优化结果 JSON:', JSON.stringify(finalResult, (key, value) =>
        // typeof value === 'bigint' ? value.toString() : value
      // , 2));

      // 保存优化后的数量和 SOL 数量
      setOptimizedTokenAmount({
        tokenAmount: optimizedSellTokenAmount,
        displayAmount: (parseFloat(optimizedSellTokenAmount.toString()) / 1e6).toFixed(6),
        simulationResult: finalResult,
        suggestedSolAmount: finalResult.suggestedSolAmount || '0'
      });

    } catch (error) {
      // console.error('[SellPanel] Token sell simulation failed:', error);
      setOptimizedTokenAmount(null);
    } finally {
      setIsOptimizing(false);
    }
  }, [isReady, sdk, mintAddress, lastPrice, downOrders1000, optimizeSellTokenAmount]);

  // Calculate how much SOL user will receive using precise decimal calculation
  const calculateSOL = (tokenAmount) => {
    if (!lastPrice) return '0';
    const solAmount = calculateSOLFromTokens(tokenAmount, lastPrice);
    return formatDisplayNumber(solAmount, 9);
  };

  // Handle percentage buttons
  const handlePercentage = (type) => {
    let newAmount = '0';
    switch(type) {
      case 'reset':
        newAmount = '0';
        break;
      case '25':
        newAmount = (tokenBalance * 0.25).toString();
        break;
      case '50':
        newAmount = (tokenBalance * 0.5).toString();
        break;
      case '75':
        newAmount = (tokenBalance * 0.75).toString();
        break;
      case '100':
        newAmount = tokenBalance.toString();
        break;
      default:
        break;
    }

    setAmount(newAmount);

    // 快捷按钮（除了 Reset）立即刷新数据
    if (type !== 'reset' && parseFloat(newAmount) > 0) {
      // console.log('[SellPanel] Quick percentage button clicked, triggering refresh...');
      onQuickActionRefresh();
    }
  };

  // Handle amount input change
  const handleAmountChange = (e) => {
    const value = e.target.value;
    setAmount(value);

    // 清空之前的优化结果
    setOptimizedTokenAmount(null);

    const numValue = parseFloat(value) || 0;
    setIsValid(numValue <= tokenBalance && numValue > 0);

    // 用户输入时触发防抖刷新
    if (numValue > 0) {
      // console.log('[SellPanel] Amount input changed, triggering debounced refresh...');
      onUserInputDebounce();
    }
  };

  // Handle approve action
  const handleApprove = async () => {
    // 验证前置条件
    if (!connected) {
      showToast('error', 'Please connect your wallet first');
      return;
    }

    if (!isReady || !sdk) {
      showToast('error', 'SDK not ready, please try again later');
      return;
    }

    if (!mintAddress) {
      showToast('error', 'Token address not found');
      return;
    }

    if (!walletAddress) {
      showToast('error', 'Unable to get wallet address');
      return;
    }

    try {
      setIsApproving(true);
      console.log('[SellPanel] 开始 approveTrade 流程...');

      // ========================================
      // 步骤 1: 调用 SDK approveTrade 接口
      // ========================================
      // 功能: 批准当前 token 余额用于交易，创建或更新 TradeCooldown PDA
      // 参数说明:
      //   - mint: 代币地址
      //   - wallet: 用户钱包对象，SDK 会通过 wallet.publicKey 提取公钥
      // 返回: { transaction, signers, accounts }
      console.log('[SellPanel] 调用 sdk.tools.approveTrade...',mintAddress,walletAddress);
      const result = await sdk.tools.approveTrade({
        mint: mintAddress,
        wallet: { publicKey: new PublicKey(walletAddress) }
      });

      console.log('[SellPanel] approveTrade 交易构建成功:', result);

      // ========================================
      // 步骤 2: 更新交易的 blockhash 和 feePayer
      // ========================================
      // 说明: 与 BuyPanel/SellPanel 保持一致的方式
      console.log('[SellPanel] 获取最新 blockhash...');
      const connection = sdk.connection || sdk.getConnection();
      const { blockhash } = await connection.getLatestBlockhash();
      result.transaction.recentBlockhash = blockhash;
      result.transaction.feePayer = new PublicKey(walletAddress);

      console.log('[SellPanel] 更新 blockhash:', blockhash);

      // ========================================
      // 步骤 3: 使用钱包签名
      // ========================================
      // 说明: SDK 只构建交易，不签名。签名由钱包插件完成（如 Phantom）
      console.log('[SellPanel] 请求钱包签名...');
      const signedTransaction = await signTransaction(result.transaction);

      console.log('[SellPanel] 钱包签名完成');

      // ========================================
      // 步骤 4: 发送交易并等待确认
      // ========================================
      console.log('[SellPanel] 发送交易...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());

      console.log('[SellPanel] 等待交易确认...');
      await connection.confirmTransaction(signature, 'confirmed');

      console.log('[SellPanel] ✅ approveTrade 成功!');
      console.log('[SellPanel] 交易签名:', signature);

      // 显示成功提示框
      showToast('success', `Successfully approved ${tokenSymbol} for trading`, signature);

      // ========================================
      // 步骤 5: 重新验证 Cooldown 状态
      // ========================================
      // 说明: Approve 成功后，cooldown PDA 已更新，重新检查验证状态
      console.log('[SellPanel] 重新检查 cooldown 验证...');
      await checkCooldownWithRetry();

    } catch (error) {
      console.error('[SellPanel] approveTrade 失败:', error);

      // 根据错误类型显示友好的错误信息
      let errorMessage = error.message;
      if (error.message.includes('User rejected')) {
        errorMessage = 'Transaction was rejected by user';
      } else if (error.message.includes('blockhash')) {
        errorMessage = 'Network busy, please try again later';
      } else if (error.message.includes('Attempt to debit') || error.message.includes('Simulation failed')) {
        errorMessage = 'Transaction simulation failed. Please try again or check your token balance.';
      }

      // 显示错误提示框
      showToast('error', errorMessage);
    } finally {
      setIsApproving(false);
    }
  };

  // Handle sell action
  const handleSell = async () => {
    if (!isValid || parseFloat(amount) <= 0) {
      // console.log('[SellPanel] Invalid amount or conditions');
      return;
    }

    // 验证前置条件
    if (!connected) {
      showToast('error', 'Please connect your wallet first');
      return;
    }

    if (!isReady || !sdk) {
      showToast('error', 'SDK not ready, please try again later');
      return;
    }

    if (!mintAddress) {
      showToast('error', 'Token address not found');
      return;
    }

    if (!walletAddress) {
      showToast('error', 'Unable to get wallet address');
      return;
    }

    try {
      setIsProcessing(true);
      // console.log('[SellPanel] 开始卖出流程...');

      // 计算参数 - 优先使用优化后的值
      let sellTokenAmount;
      let displayTokenAmount;
      
      if (optimizedTokenAmount && optimizedTokenAmount.tokenAmount) {
        // 使用优化后的代币数量
        sellTokenAmount = optimizedTokenAmount.tokenAmount;
        displayTokenAmount = parseFloat(optimizedTokenAmount.displayAmount);
        // console.log('[SellPanel] 使用优化后的代币数量:', sellTokenAmount.toString());
      } else {
        // 使用原始计算的代币数量
        const tokenAmount = parseFloat(amount);
        sellTokenAmount = convertToTokenDecimals(tokenAmount, 6);
        displayTokenAmount = tokenAmount;
        // console.log('[SellPanel] 使用原始计算的代币数量:', sellTokenAmount.toString());
      }
      
      // 计算最小 SOL 输出 - 基于优化后的 suggestedSolAmount 或原始计算
      let calculatedSOLFloat;
      if (optimizedTokenAmount && optimizedTokenAmount.suggestedSolAmount) {
        calculatedSOLFloat = parseFloat(optimizedTokenAmount.suggestedSolAmount) / 1e9;
      } else {
        const calculatedSOLStr = calculateSOL(amount);
        calculatedSOLFloat = parseFloat(calculatedSOLStr.replace(/,/g, ''));
      }
      
      const actualSlippage = getActualSlippage(slippageSettings.slippage);
      const minSolOutput = calculateMinSolOutput(calculatedSOLFloat, actualSlippage);

      // console.log('[SellPanel] 卖出参数:', {
        // mintAddress,
        // displayTokenAmount,
        // slippagePercent: slippageSettings.slippage,
        // actualSlippagePercent: actualSlippage,
        // calculatedSOL: calculatedSOLFloat,
        // sellTokenAmount: sellTokenAmount.toString(),
        // minSolOutput: minSolOutput.toString(),
        // walletAddress,
        // usingOptimized: !!(optimizedTokenAmount && optimizedTokenAmount.tokenAmount)
      // });

      // 调用 SDK 卖出接口
      // console.log('[SellPanel] 调用 sdk.trading.sell...');
      const result = await sdk.trading.sell({
        mintAccount: mintAddress,
        sellTokenAmount: sellTokenAmount,
        minSolOutput: minSolOutput,
        payer: new PublicKey(walletAddress)
      });

      // console.log('[SellPanel] SDK 返回结果:', result);

      // 获取最新的 blockhash
      // console.log('[SellPanel] 获取最新 blockhash...');
      const connection = sdk.connection || sdk.getConnection();
      const { blockhash } = await connection.getLatestBlockhash();
      result.transaction.recentBlockhash = blockhash;
      result.transaction.feePayer = new PublicKey(walletAddress);

      // console.log('[SellPanel] 更新 blockhash:', blockhash);

      // 钱包签名
      // console.log('[SellPanel] 请求钱包签名...');
      const signedTransaction = await signTransaction(result.transaction);

      // console.log('[SellPanel] 钱包签名完成');

      // 发送交易
      // console.log('[SellPanel] 发送交易...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());

      // console.log('[SellPanel] 等待交易确认...');
      await connection.confirmTransaction(signature, 'confirmed');

      // console.log('[SellPanel] ✅ 卖出成功!');
      // console.log('[SellPanel] 交易签名:', signature);
      
      // 调用原有的回调（保持兼容性）
      onSell(amount, 'sell');
      
      // 刷新余额数据
      // console.log('[SellPanel] 刷新余额数据...');
      onRefreshData();
      
      // 显示成功提示框
      showToast('success', `Successfully sold ${displayTokenAmount.toFixed(6)} ${tokenSymbol}`, signature);

    } catch (error) {
      // console.error('[SellPanel] 卖出失败:', error);
      
      let errorMessage = error.message;
      if (error.message.includes('User rejected')) {
        errorMessage = 'Transaction was rejected by user';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient token balance';
      } else if (error.message.includes('blockhash')) {
        errorMessage = 'Network busy, please try again later';
      }
      
      // 显示错误提示框
      showToast('error', errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const hasInsufficientBalance = parseFloat(amount) > tokenBalance;
  const calculatedSOL = calculateSOL(amount);
  
  // 获取显示用的 SOL 数量（优先使用优化后的值）
  const getDisplaySolAmount = () => {
    if (isOptimizing) {
      return 'Optimizing...';
    }
    if (optimizedTokenAmount && optimizedTokenAmount.suggestedSolAmount) {
      // 将模拟器返回的 suggestedSolAmount 转换为显示格式
      const solAmount = parseFloat(optimizedTokenAmount.suggestedSolAmount) / 1e9;
      return solAmount.toFixed(9);
    }
    return calculatedSOL;
  };

  // 监听 tokenBalance 变化，触发 cooldown 验证
  useEffect(() => {
    if (tokenBalance > 0 && isReady && sdk && mintAddress && walletAddress) {
      // console.log('[SellPanel] tokenBalance > 0, triggering cooldown validation...');
      checkCooldownWithRetry();
    } else {
      // tokenBalance = 0 时，默认显示 Sell 按钮
      setNeedsApproval(false);
    }
  }, [tokenBalance, isReady, sdk, mintAddress, walletAddress, checkCooldownWithRetry]);

  // 监听 amount 变化，触发模拟器调用 (参考 BuyPanel)
  useEffect(() => {
    try {
      const currentAmount = parseFloat(amount);
      // console.log('[SellPanel] Amount changed:', currentAmount);
      // 检查是否满足计算条件
      if (currentAmount > 0 && isReady && mintAddress && lastPrice && downOrders1000) {
        // console.log('[SellPanel] Amount changed, triggering sell simulation...');
        simulateTokenSellOrder(amount);
      } else {
        // console.log('[SellPanel] Amount changed, skipping ', isReady, mintAddress, lastPrice, downOrders1000);
      }
    } catch (error) {
      // console.error('[SellPanel] useEffect error:', error);
    }
  }, [amount, isReady, mintAddress, lastPrice, downOrders1000, simulateTokenSellOrder]);

  return (
    <div className="space-y-4">
      {/* Token Balance Display */}
      <div className="text-gray-700 font-nunito">
        {tokenSymbol} balance: <span className="font-bold">{tokenBalance}</span>
      </div>

      {/* Amount Input */}
      <div className="relative">
        <input
          type="text"
          value={amount}
          onChange={handleAmountChange}
          className="w-full bg-white text-black text-2xl font-bold p-4 rounded-lg border-2 border-black focus:border-red-500 focus:outline-none"
          placeholder="0"
        />
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
          <span className="text-black font-nunito">{tokenSymbol}</span>
          <div className="w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center">
            <span className="text-xs">🐾</span>
          </div>
        </div>
      </div>

      {/* Percentage Buttons */}
      <div className="flex space-x-2">
        <button
          onClick={() => handlePercentage('reset')}
          className="flex-1 bg-gray-600 text-white py-2 px-1 rounded font-nunito text-xs hover:bg-gray-700 transition-colors"
        >
          Reset
        </button>
        <button
          onClick={() => handlePercentage('25')}
          className="flex-1 bg-gray-600 text-white py-2 px-1 rounded font-nunito text-xs hover:bg-gray-700 transition-colors"
        >
          25%
        </button>
        <button
          onClick={() => handlePercentage('50')}
          className="flex-1 bg-gray-600 text-white py-2 px-1 rounded font-nunito text-xs hover:bg-gray-700 transition-colors"
        >
          50%
        </button>
        <button
          onClick={() => handlePercentage('75')}
          className="flex-1 bg-gray-600 text-white py-2 px-1 rounded font-nunito text-xs hover:bg-gray-700 transition-colors"
        >
          75%
        </button>
        <button
          onClick={() => handlePercentage('100')}
          className="flex-1 bg-gray-600 text-white py-2 px-1 rounded font-nunito text-xs hover:bg-gray-700 transition-colors"
        >
          100%
        </button>
      </div>

      {/* Insufficient Balance Warning */}
      {hasInsufficientBalance && (
        <div className="text-red-500 text-sm font-nunito">
          Insufficient balance: you have {tokenBalance} {tokenSymbol}
        </div>
      )}

      {/* Calculated Result */}
      <div className="text-gray-700 font-nunito text-lg">
        you receive {getDisplaySolAmount()} SOL
      </div>


      {/* Sell/Approve Button */}
      <button
        onClick={needsApproval ? handleApprove : handleSell}
        disabled={
          !connected ||
          !isReady ||
          !mintAddress ||
          (needsApproval ? isApproving : (
            !isValid ||
            hasInsufficientBalance ||
            parseFloat(amount) <= 0 ||
            loading ||
            isProcessing
          ))
        }
        className={`w-full ${needsApproval ? 'bg-blue-500 hover:bg-blue-600' : 'bg-red-500 hover:bg-red-600'} disabled:bg-gray-500 disabled:cursor-not-allowed text-white py-4 rounded-lg text-lg font-nunito font-bold border-2 border-black cartoon-shadow trading-button`}
      >
        {!connected
          ? 'Connect Wallet First'
          : !isReady
            ? 'SDK Not Ready'
            : !mintAddress
              ? 'Token Address Missing'
              : needsApproval
                ? (isApproving ? `Approving ${tokenSymbol}...` : `Approve ${tokenSymbol}`)
                : (isProcessing ? `Selling ${tokenSymbol}...` : `Sell ${tokenSymbol}`)
        }
      </button>
      
      {/* 交易结果提示框 */}
      <TradingToast
        isVisible={toast.isVisible}
        type={toast.type}
        message={toast.message}
        txHash={toast.txHash}
        onClose={closeToast}
      />
    </div>
  );
}, (prevProps: SellPanelProps, nextProps: SellPanelProps) => {
  // 优化重渲染：只有关键props变化才重新渲染
  return prevProps.mintAddress === nextProps.mintAddress &&
         prevProps.tokenSymbol === nextProps.tokenSymbol &&
         prevProps.tokenBalance === nextProps.tokenBalance &&
         prevProps.slippageSettings?.slippage === nextProps.slippageSettings?.slippage &&
         JSON.stringify(prevProps.tradingData) === JSON.stringify(nextProps.tradingData);
});

export default SellPanel;