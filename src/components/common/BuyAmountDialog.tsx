import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface BuyAmountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (solAmount: string) => void;
  coinName: string;
  isProcessing?: boolean;
}

const BuyAmountDialog: React.FC<BuyAmountDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  coinName,
  isProcessing = false
}) => {
  const [solAmount, setSolAmount] = useState('');
  const [error, setError] = useState('');

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSolAmount('');
      setError('');
    }
  }, [isOpen]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Only allow numbers and decimal point
    if (value && !/^\d*\.?\d*$/.test(value)) {
      return;
    }

    setSolAmount(value);
    setError('');
  };

  // Handle confirm
  const handleConfirm = () => {
    // Validate input
    const amount = parseFloat(solAmount);

    if (solAmount && (isNaN(amount) || amount < 0)) {
      setError('Please enter a valid amount');
      return;
    }

    // Allow empty or 0 - will create without buying
    onConfirm(solAmount);
  };

  // Handle close
  const handleClose = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  // Handle overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isProcessing) {
      handleClose();
    }
  };

  // Handle ESC key and prevent background scrolling
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isProcessing) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);

      // Prevent background scrolling
      const scrollY = window.scrollY;
      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      if (isOpen) {
        const scrollY = document.body.style.top;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.paddingRight = '';
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    };
  }, [isOpen, isProcessing]);

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isProcessing) {
      handleConfirm();
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999
      }}
      onClick={handleOverlayClick}
    >
      <div className="bg-white rounded-2xl border-4 border-black shadow-cartoon w-full max-w-md mx-4 p-6 space-y-4">
        {/* Close button */}
        {!isProcessing && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl font-bold leading-none"
          >
            ×
          </button>
        )}

        {/* Title */}
        <h2 className="text-xl font-nunito text-gray-900 text-center mb-2">
          Choose how many [{coinName}] you want to buy (optional)
        </h2>

        {/* Tip */}
        <p className="text-sm text-gray-600 text-center mb-4 font-nunito">
          Tip: its optional but buying a small amount of coins helps protect your coin from snipers
        </p>

        {/* Switch to token display (read-only) */}
        <div className="text-right mb-2">
          <span className="text-gray-500 text-sm font-nunito">Switch to {coinName}</span>
        </div>

        {/* Input field */}
        <div className="relative">
          <input
            type="text"
            value={solAmount}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="0"
            disabled={isProcessing}
            className="w-full bg-gray-100 border-2 border-gray-300 rounded-lg px-4 py-4 pr-20 text-gray-900 text-2xl font-nunito focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-4">
            <span className="text-gray-900 font-nunito font-semibold text-lg mr-2">SOL</span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center">
              <span className="text-white text-xs font-bold">◎</span>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="text-red-500 text-sm font-nunito text-center">
            {error}
          </div>
        )}

        {/* Create coin button */}
        <button
          onClick={handleConfirm}
          disabled={isProcessing}
          className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-nunito font-bold text-lg py-4 rounded-xl border-2 border-black shadow-cartoon transition-all duration-200 active:scale-95"
        >
          {isProcessing ? 'Creating coin...' : 'Create coin'}
        </button>

        {/* Additional info */}
        {solAmount && parseFloat(solAmount) > 0 && (
          <p className="text-xs text-gray-500 text-center font-nunito">
            You will spend approximately {solAmount} SOL to buy {coinName} tokens
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default BuyAmountDialog;
