import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { usePinPetSdk } from '../../contexts/PinPetSdkContext';

// 测试钱包配置（硬编码用于内部测试）
const FAUCET_PRIVATE_KEY = "Gh45cgmWHw9TvsJtVexmuZYj1s7FyHCBaNirWr6LJc1YgwYkCse4Z6BeS4JGCk9zKtrmudwVV7JXwudYY3YwRTT";
const FAUCET_AMOUNT = 1_000_000; // 1,000,000 SOL

/**
 * @component ResourcesPage
 * @description Test faucet page for distributing SOL to connected wallets
 */
export const ResourcesPage: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const { getConnection, isReady } = usePinPetSdk();
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleClaim = async () => {
    if (!publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    if (!isReady) {
      setError('SDK is not ready. Please wait...');
      return;
    }

    const connection = getConnection();
    if (!connection) {
      setError('Failed to get connection from SDK');
      return;
    }

    setLoading(true);
    setError('');
    setTxHash('');

    try {

      // 从私钥恢复测试钱包
      const faucetKeypair = Keypair.fromSecretKey(
        Buffer.from(bs58.decode(FAUCET_PRIVATE_KEY))
      );

      // 创建转账交易
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: faucetKeypair.publicKey,
          toPubkey: publicKey,
          lamports: FAUCET_AMOUNT * LAMPORTS_PER_SOL,
        })
      );

      // 获取最新区块哈希
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = faucetKeypair.publicKey;

      // 签名并发送交易
      transaction.sign(faucetKeypair);
      const signature = await connection.sendRawTransaction(transaction.serialize());

      // 等待确认
      await connection.confirmTransaction(signature, 'confirmed');

      setTxHash(signature);
      console.log('Transaction successful:', signature);
    } catch (err: any) {
      console.error('Claim error:', err);
      setError(err?.message || 'Failed to claim SOL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-pink-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-nunito font-bold text-orange-600 mb-4">
            Test Faucet
          </h1>
          <p className="text-lg text-gray-600 font-nunito">
            Get 1,000,000 SOL for testing purposes
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-cartoon p-8">
          {/* Wallet Status */}
          <div className="mb-6">
            <h2 className="text-2xl font-nunito font-bold text-gray-800 mb-4">
              Your Wallet Address
            </h2>

            {!connected ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4 font-nunito">
                  Please connect your wallet to claim SOL
                </p>
                <WalletMultiButton className="!bg-orange-500 hover:!bg-orange-600 !rounded-full !font-nunito" />
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
                <p className="text-sm text-gray-500 mb-1 font-nunito">Connected Address:</p>
                <p className="text-gray-800 font-mono text-sm break-all">
                  {publicKey?.toBase58()}
                </p>
              </div>
            )}
          </div>

          {/* Claim Button */}
          {connected && (
            <div className="mb-6">
              <button
                onClick={handleClaim}
                disabled={loading}
                className={`
                  w-full py-4 px-6 rounded-full font-nunito font-bold text-xl
                  transition-all duration-200 shadow-cartoon
                  ${loading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 active:scale-95'
                  }
                  text-white
                `}
              >
                {loading ? (
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
                    Processing...
                  </span>
                ) : (
                  `Claim 1,000,000 SOL`
                )}
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl p-4">
              <p className="text-red-600 font-nunito">
                ❌ {error}
              </p>
            </div>
          )}

          {/* Success Message with Transaction Hash */}
          {txHash && (
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
              <p className="text-green-600 font-nunito font-bold mb-2">
                ✅ Successfully claimed 1,000,000 SOL!
              </p>
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <p className="text-sm text-gray-500 mb-1 font-nunito">Transaction Hash:</p>
                <p className="text-gray-800 font-mono text-xs break-all">
                  {txHash}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 font-nunito">
            ⚠️ This is for internal testing only. Not for production use.
          </p>
        </div>
      </div>
    </div>
  );
};
