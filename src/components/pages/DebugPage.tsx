import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  TokenAccountNotFoundError
} from '@solana/spl-token';
import { usePinPetSdk } from '../../contexts/PinPetSdkContext';

/**
 * @component DebugPage
 * @description 代币/SOL转账页面 - 支持代币和SOL转账功能
 */
const DebugPage = () => {
  const { publicKey, connected, signTransaction } = useWallet();
  const { getConnection, isReady } = usePinPetSdk();

  // Tab状态
  const [activeTab, setActiveTab] = useState<'token' | 'sol'>('token');

  // 代币地址相关状态
  const [tokenMint, setTokenMint] = useState('');
  const [tokenBalance, setTokenBalance] = useState<string>('');
  const [tokenDecimals, setTokenDecimals] = useState<number>(6);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState('');

  // 转账相关状态
  const [recipientAddress, setRecipientAddress] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [transferError, setTransferError] = useState('');

  // SOL转账相关状态
  const [solBalance, setSolBalance] = useState<string>('');
  const [solRecipient, setSolRecipient] = useState('');
  const [solAmount, setSolAmount] = useState('');
  const [solTransferring, setSolTransferring] = useState(false);
  const [solTxHash, setSolTxHash] = useState('');
  const [solError, setSolError] = useState('');
  const [loadingSolBalance, setLoadingSolBalance] = useState(false);

  // 查询代币余额
  const handleQueryBalance = async () => {
    if (!publicKey || !connected) {
      setBalanceError('请先连接钱包');
      return;
    }

    if (!tokenMint.trim()) {
      setBalanceError('请输入代币地址');
      return;
    }

    if (!isReady) {
      setBalanceError('SDK 未就绪，请稍候...');
      return;
    }

    const connection = getConnection();
    if (!connection) {
      setBalanceError('无法获取连接');
      return;
    }

    setLoadingBalance(true);
    setBalanceError('');
    setTokenBalance('');

    try {
      // 验证代币地址格式
      const mintPubkey = new PublicKey(tokenMint.trim());

      // 获取用户的关联代币账户地址
      const userTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      // 查询代币账户信息
      const accountInfo = await getAccount(
        connection,
        userTokenAccount,
        'confirmed',
        TOKEN_PROGRAM_ID
      );

      // 获取代币精度
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
      if (mintInfo.value && 'parsed' in mintInfo.value.data) {
        const decimals = mintInfo.value.data.parsed.info.decimals;
        setTokenDecimals(decimals);

        // 转换余额为可读格式
        const balance = Number(accountInfo.amount) / Math.pow(10, decimals);
        setTokenBalance(balance.toFixed(decimals));
      } else {
        // 默认使用6位小数
        const balance = Number(accountInfo.amount) / Math.pow(10, 6);
        setTokenBalance(balance.toFixed(6));
        setTokenDecimals(6);
      }

    } catch (err: any) {
      // console.error('查询余额错误:', err);

      if (err instanceof TokenAccountNotFoundError) {
        setBalanceError('该钱包没有此代币账户');
        setTokenBalance('0');
      } else if (err.message?.includes('Invalid public key')) {
        setBalanceError('无效的代币地址');
      } else {
        setBalanceError(err.message || '查询余额失败');
      }
    } finally {
      setLoadingBalance(false);
    }
  };

  // 处理代币转账
  const handleTransfer = async () => {
    if (!publicKey || !connected) {
      setTransferError('请先连接钱包');
      return;
    }

    if (!signTransaction) {
      setTransferError('钱包不支持签名功能');
      return;
    }

    if (!tokenMint.trim()) {
      setTransferError('请输入代币地址');
      return;
    }

    if (!recipientAddress.trim()) {
      setTransferError('请输入接收地址');
      return;
    }

    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      setTransferError('请输入有效的转账数量');
      return;
    }

    if (!isReady) {
      setTransferError('SDK 未就绪，请稍候...');
      return;
    }

    const connection = getConnection();
    if (!connection) {
      setTransferError('无法获取连接');
      return;
    }

    setTransferring(true);
    setTransferError('');
    setTxHash('');

    try {
      // 验证地址格式
      const mintPubkey = new PublicKey(tokenMint.trim());
      const recipientPubkey = new PublicKey(recipientAddress.trim());

      // 计算转账金额(考虑精度)
      const amount = Math.floor(parseFloat(transferAmount) * Math.pow(10, tokenDecimals));

      if (amount <= 0) {
        throw new Error('转账数量必须大于0');
      }

      // 获取发送方的代币账户
      const senderTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      // 获取接收方的代币账户
      const recipientTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        recipientPubkey,
        false,
        TOKEN_PROGRAM_ID
      );

      // 检查发送方账户是否存在
      try {
        await getAccount(connection, senderTokenAccount, 'confirmed', TOKEN_PROGRAM_ID);
      } catch (err) {
        throw new Error('您没有此代币的账户或余额不足');
      }

      // 创建转账交易
      const transaction = new Transaction();

      // 检查接收方账户是否存在,如果不存在则创建
      try {
        await getAccount(connection, recipientTokenAccount, 'confirmed', TOKEN_PROGRAM_ID);
      } catch (err) {
        if (err instanceof TokenAccountNotFoundError) {
          // 接收方账户不存在,添加创建账户指令
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey,                  // payer
              recipientTokenAccount,      // ata
              recipientPubkey,           // owner
              mintPubkey,                // mint
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          );
        } else {
          throw err;
        }
      }

      // 添加转账指令
      transaction.add(
        createTransferInstruction(
          senderTokenAccount,
          recipientTokenAccount,
          publicKey,
          amount,
          [],
          TOKEN_PROGRAM_ID
        )
      );

      // 获取最新区块哈希
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // 钱包签名
      const signedTransaction = await signTransaction(transaction);

      // 发送交易
      const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });

      // 等待确认
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');

      setTxHash(signature);

      // 清空表单
      setTransferAmount('');
      setRecipientAddress('');

      // 刷新余额
      setTimeout(() => {
        handleQueryBalance();
      }, 1000);

    } catch (err: any) {
      // console.error('转账错误:', err);

      if (err.message?.includes('Invalid public key')) {
        setTransferError('无效的地址格式');
      } else if (err.message?.includes('insufficient')) {
        setTransferError('余额不足');
      } else {
        setTransferError(err.message || '转账失败');
      }
    } finally {
      setTransferring(false);
    }
  };

  // 查询SOL余额
  const handleQuerySolBalance = async () => {
    if (!publicKey || !connected) {
      setSolError('请先连接钱包');
      return;
    }

    if (!isReady) {
      setSolError('SDK 未就绪，请稍候...');
      return;
    }

    const connection = getConnection();
    if (!connection) {
      setSolError('无法获取连接');
      return;
    }

    setLoadingSolBalance(true);
    setSolError('');
    setSolBalance('');

    try {
      const balance = await connection.getBalance(publicKey);
      const solBalance = balance / LAMPORTS_PER_SOL;
      setSolBalance(solBalance.toFixed(9));
    } catch (err: any) {
      setSolError(err.message || '查询SOL余额失败');
    } finally {
      setLoadingSolBalance(false);
    }
  };

  // 处理SOL转账
  const handleSolTransfer = async () => {
    if (!publicKey || !connected) {
      setSolError('请先连接钱包');
      return;
    }

    if (!signTransaction) {
      setSolError('钱包不支持签名功能');
      return;
    }

    if (!solRecipient.trim()) {
      setSolError('请输入接收地址');
      return;
    }

    if (!solAmount || parseFloat(solAmount) <= 0) {
      setSolError('请输入有效的转账数量');
      return;
    }

    if (!isReady) {
      setSolError('SDK 未就绪，请稍候...');
      return;
    }

    const connection = getConnection();
    if (!connection) {
      setSolError('无法获取连接');
      return;
    }

    setSolTransferring(true);
    setSolError('');
    setSolTxHash('');

    try {
      // 验证接收地址格式
      const recipientPubkey = new PublicKey(solRecipient.trim());

      // 计算转账金额(转换为lamports)
      const lamports = Math.floor(parseFloat(solAmount) * LAMPORTS_PER_SOL);

      if (lamports <= 0) {
        throw new Error('转账数量必须大于0');
      }

      // 检查余额是否足够
      const balance = await connection.getBalance(publicKey);
      if (balance < lamports) {
        throw new Error('SOL余额不足');
      }

      // 创建转账交易
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipientPubkey,
          lamports: lamports,
        })
      );

      // 获取最新区块哈希
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // 钱包签名
      const signedTransaction = await signTransaction(transaction);

      // 发送交易
      const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });

      // 等待确认
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');

      setSolTxHash(signature);

      // 清空表单
      setSolAmount('');
      setSolRecipient('');

      // 刷新余额
      setTimeout(() => {
        handleQuerySolBalance();
      }, 1000);

    } catch (err: any) {
      if (err.message?.includes('Invalid public key')) {
        setSolError('无效的地址格式');
      } else if (err.message?.includes('insufficient')) {
        setSolError('余额不足');
      } else {
        setSolError(err.message || '转账失败');
      }
    } finally {
      setSolTransferring(false);
    }
  };

  // 监听钱包连接状态变化,清空状态
  useEffect(() => {
    if (!connected) {
      setTokenBalance('');
      setBalanceError('');
      setTxHash('');
      setTransferError('');
      setSolBalance('');
      setSolError('');
      setSolTxHash('');
    }
  }, [connected]);

  // 监听Tab切换,自动查询对应余额
  useEffect(() => {
    if (connected && publicKey) {
      if (activeTab === 'sol') {
        handleQuerySolBalance();
      }
    }
  }, [activeTab, connected, publicKey]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-pink-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-nunito font-bold text-orange-600 mb-4">
            转账工具
          </h1>
          <p className="text-lg text-gray-600 font-nunito">
            支持 SOL 和代币转账
          </p>
        </div>

        {/* Wallet Connection */}
        {!connected ? (
          <div className="bg-white rounded-3xl shadow-cartoon p-8 text-center">
            <p className="text-gray-500 mb-4 font-nunito text-lg">
              请先连接钱包
            </p>
            <WalletMultiButton className="!bg-orange-500 hover:!bg-orange-600 !rounded-full !font-nunito" />
          </div>
        ) : (
          <>
            {/* Tab Navigation */}
            <div className="bg-white rounded-3xl shadow-cartoon p-2 mb-6">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('sol')}
                  className={`
                    flex-1 py-3 px-6 rounded-2xl font-nunito font-bold text-lg
                    transition-all duration-200
                    ${activeTab === 'sol'
                      ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-cartoon'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                >
                  SOL 转账
                </button>
                <button
                  onClick={() => setActiveTab('token')}
                  className={`
                    flex-1 py-3 px-6 rounded-2xl font-nunito font-bold text-lg
                    transition-all duration-200
                    ${activeTab === 'token'
                      ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-cartoon'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                >
                  代币转账
                </button>
              </div>
            </div>

            {/* SOL Transfer Tab */}
            {activeTab === 'sol' && (
              <>
                {/* SOL Balance Section */}
                <div className="bg-white rounded-3xl shadow-cartoon p-8 mb-6">
                  <h2 className="text-3xl font-nunito font-bold text-gray-800 mb-6">
                    SOL 余额
                  </h2>

                  {/* Query Button */}
                  <button
                    onClick={handleQuerySolBalance}
                    disabled={loadingSolBalance}
                    className={`
                      w-full py-3 px-6 rounded-full font-nunito font-bold text-lg
                      transition-all duration-200 shadow-cartoon
                      ${loadingSolBalance
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 active:scale-95'
                      }
                      text-white mb-4
                    `}
                  >
                    {loadingSolBalance ? '查询中...' : '刷新余额'}
                  </button>

                  {/* Balance Display */}
                  {solBalance && !solError && (
                    <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
                      <p className="text-sm text-gray-500 mb-1 font-nunito">当前 SOL 余额:</p>
                      <p className="text-3xl font-bold text-purple-600 font-nunito">
                        {solBalance} SOL
                      </p>
                    </div>
                  )}

                  {/* Balance Error */}
                  {solError && !solTxHash && (
                    <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                      <p className="text-red-600 font-nunito">❌ {solError}</p>
                    </div>
                  )}
                </div>

                {/* SOL Transfer Section */}
                <div className="bg-white rounded-3xl shadow-cartoon p-8">
                  <h2 className="text-3xl font-nunito font-bold text-gray-800 mb-6">
                    转账 SOL
                  </h2>

                  {/* Recipient Address Input */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-nunito">
                      接收地址 (Recipient Address):
                    </label>
                    <input
                      type="text"
                      value={solRecipient}
                      onChange={(e) => setSolRecipient(e.target.value)}
                      placeholder="输入接收方钱包地址..."
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-purple-500 font-mono text-sm"
                    />
                  </div>

                  {/* Transfer Amount Input */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-nunito">
                      转账数量 (Amount in SOL):
                    </label>
                    <input
                      type="number"
                      value={solAmount}
                      onChange={(e) => setSolAmount(e.target.value)}
                      placeholder="输入转账数量..."
                      step="0.000000001"
                      min="0"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-purple-500 font-nunito text-lg"
                    />
                    {solBalance && (
                      <p className="text-xs text-gray-400 mt-1 font-nunito">
                        可用余额: {solBalance} SOL
                      </p>
                    )}
                  </div>

                  {/* Transfer Button */}
                  <button
                    onClick={handleSolTransfer}
                    disabled={solTransferring || !solRecipient.trim() || !solAmount}
                    className={`
                      w-full py-4 px-6 rounded-full font-nunito font-bold text-xl
                      transition-all duration-200 shadow-cartoon
                      ${solTransferring || !solRecipient.trim() || !solAmount
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 active:scale-95'
                      }
                      text-white mb-4
                    `}
                  >
                    {solTransferring ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        转账中...
                      </span>
                    ) : (
                      '转账 SOL'
                    )}
                  </button>

                  {/* Transfer Error */}
                  {solError && solError !== '请先连接钱包' && solError !== 'SDK 未就绪，请稍候...' && solError !== '无法获取连接' && !solTxHash && (
                    <div className="mb-4 bg-red-50 border-2 border-red-200 rounded-xl p-4">
                      <p className="text-red-600 font-nunito">❌ {solError}</p>
                    </div>
                  )}

                  {/* Transfer Success */}
                  {solTxHash && (
                    <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                      <p className="text-green-600 font-nunito font-bold mb-2">
                        ✅ 转账成功!
                      </p>
                      <div className="bg-white rounded-lg p-3 border border-green-200">
                        <p className="text-sm text-gray-500 mb-1 font-nunito">交易哈希:</p>
                        <p className="text-gray-800 font-mono text-xs break-all">
                          {solTxHash}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Token Transfer Tab */}
            {activeTab === 'token' && (
              <>
            {/* Token Balance Query Section */}
            <div className="bg-white rounded-3xl shadow-cartoon p-8 mb-6">
              <h2 className="text-3xl font-nunito font-bold text-gray-800 mb-6">
                查询代币余额
              </h2>

              {/* Token Mint Address Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2 font-nunito">
                  代币地址 (Token Mint Address):
                </label>
                <input
                  type="text"
                  value={tokenMint}
                  onChange={(e) => setTokenMint(e.target.value)}
                  placeholder="输入代币铸造地址..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-orange-500 font-mono text-sm"
                />
              </div>

              {/* Query Button */}
              <button
                onClick={handleQueryBalance}
                disabled={loadingBalance || !tokenMint.trim()}
                className={`
                  w-full py-3 px-6 rounded-full font-nunito font-bold text-lg
                  transition-all duration-200 shadow-cartoon
                  ${loadingBalance || !tokenMint.trim()
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 active:scale-95'
                  }
                  text-white mb-4
                `}
              >
                {loadingBalance ? '查询中...' : '查询余额'}
              </button>

              {/* Balance Display */}
              {tokenBalance && !balanceError && (
                <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500 mb-1 font-nunito">当前余额:</p>
                  <p className="text-3xl font-bold text-green-600 font-nunito">
                    {tokenBalance}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 font-nunito">
                    精度: {tokenDecimals} 位小数
                  </p>
                </div>
              )}

              {/* Balance Error */}
              {balanceError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                  <p className="text-red-600 font-nunito">❌ {balanceError}</p>
                </div>
              )}
            </div>

            {/* Token Transfer Section */}
            <div className="bg-white rounded-3xl shadow-cartoon p-8">
              <h2 className="text-3xl font-nunito font-bold text-gray-800 mb-6">
                转账代币
              </h2>

              {/* Recipient Address Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2 font-nunito">
                  接收地址 (Recipient Address):
                </label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="输入接收方钱包地址..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-orange-500 font-mono text-sm"
                />
              </div>

              {/* Transfer Amount Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2 font-nunito">
                  转账数量 (Amount):
                </label>
                <input
                  type="number"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="输入转账数量..."
                  step="0.000001"
                  min="0"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-orange-500 font-nunito text-lg"
                />
                {tokenBalance && (
                  <p className="text-xs text-gray-400 mt-1 font-nunito">
                    可用余额: {tokenBalance}
                  </p>
                )}
              </div>

              {/* Transfer Button */}
              <button
                onClick={handleTransfer}
                disabled={transferring || !tokenMint.trim() || !recipientAddress.trim() || !transferAmount}
                className={`
                  w-full py-4 px-6 rounded-full font-nunito font-bold text-xl
                  transition-all duration-200 shadow-cartoon
                  ${transferring || !tokenMint.trim() || !recipientAddress.trim() || !transferAmount
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 active:scale-95'
                  }
                  text-white mb-4
                `}
              >
                {transferring ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    转账中...
                  </span>
                ) : (
                  '转账代币'
                )}
              </button>

              {/* Transfer Error */}
              {transferError && (
                <div className="mb-4 bg-red-50 border-2 border-red-200 rounded-xl p-4">
                  <p className="text-red-600 font-nunito">❌ {transferError}</p>
                </div>
              )}

              {/* Transfer Success */}
              {txHash && (
                <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                  <p className="text-green-600 font-nunito font-bold mb-2">
                    ✅ 转账成功!
                  </p>
                  <div className="bg-white rounded-lg p-3 border border-green-200">
                    <p className="text-sm text-gray-500 mb-1 font-nunito">交易哈希:</p>
                    <p className="text-gray-800 font-mono text-xs break-all">
                      {txHash}
                    </p>
                  </div>
                </div>
              )}
            </div>
              </>
            )}

            {/* Current Wallet Info */}
            <div className="mt-6 bg-white rounded-2xl shadow-cartoon p-4">
              <p className="text-sm text-gray-500 mb-1 font-nunito">当前连接钱包:</p>
              <p className="text-gray-800 font-mono text-xs break-all">
                {publicKey?.toBase58()}
              </p>
            </div>
          </>
        )}

        {/* Footer Note */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 font-nunito">
            ⚠️ 请确保接收地址正确,转账操作不可撤销
          </p>
        </div>
      </div>
    </div>
  );
};

export default DebugPage;