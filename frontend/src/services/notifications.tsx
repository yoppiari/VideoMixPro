import React from 'react';
import { toast } from 'react-toastify';
import { ExclamationTriangleIcon, CheckCircleIcon, CreditCardIcon } from '@heroicons/react/24/outline';

export const showCreditWarning = (creditsRequired: number, userCredits: number) => {
  const toastContent = (
    <div className="flex items-start">
      <ExclamationTriangleIcon className="w-5 h-5 mr-2 text-yellow-600" />
      <div>
        <p className="font-medium text-yellow-800">Insufficient Credits</p>
        <p className="text-sm text-yellow-700 mt-1">
          You need {creditsRequired} credits but only have {userCredits}.
        </p>
        <div className="mt-3">
          <button
            onClick={() => {
              window.location.href = '/credits';
              toast.dismiss();
            }}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-yellow-700 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
          >
            <CreditCardIcon className="w-4 h-4 mr-1" />
            Buy Credits
          </button>
        </div>
      </div>
    </div>
  );

  toast.warning(toastContent, {
    autoClose: 8000,
    closeOnClick: false,
    draggable: true,
    hideProgressBar: false,
  });
};

export const showProcessingStarted = (outputCount: number, creditsUsed: number) => {
  const toastContent = (
    <div className="flex items-start">
      <CheckCircleIcon className="w-5 h-5 mr-2 text-green-600" />
      <div>
        <p className="font-medium text-green-800">Processing Started!</p>
        <p className="text-sm text-green-700 mt-1">
          Generating {outputCount} video variations using {creditsUsed} credits.
        </p>
        <p className="text-xs text-green-600 mt-1">
          You'll be notified when processing is complete.
        </p>
      </div>
    </div>
  );

  toast.success(toastContent, {
    autoClose: 5000,
    hideProgressBar: false,
  });
};

export const showProcessingError = (error: string) => {
  const toastContent = (
    <div className="flex items-start">
      <ExclamationTriangleIcon className="w-5 h-5 mr-2 text-red-600" />
      <div>
        <p className="font-medium text-red-800">Processing Failed</p>
        <p className="text-sm text-red-700 mt-1">{error}</p>
      </div>
    </div>
  );

  toast.error(toastContent, {
    autoClose: 6000,
    hideProgressBar: false,
  });
};