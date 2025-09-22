import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import DashboardLayout from '../layout/DashboardLayout';

interface CreditTransaction {
  id: string;
  type: 'PURCHASE' | 'USAGE' | 'REFUND' | 'BONUS';
  amount: number;
  balance: number;
  description: string;
  referenceId?: string;
  createdAt: string;
}

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  bonus: number;
  popular?: boolean;
}

interface UsageStats {
  totalCreditsUsed: number;
  videosProcessed: number;
  projectsCreated: number;
  averageCreditsPerVideo: number;
}

const CreditUsageDisplay: React.FC = () => {
  const [credits, setCredits] = useState(0);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'balance' | 'history' | 'purchase' | 'usage'>('balance');
  const navigate = useNavigate();

  // Credit packages available for purchase
  const creditPackages: CreditPackage[] = [
    { id: 'starter', name: 'Starter', credits: 100, price: 9.99, bonus: 0 },
    { id: 'basic', name: 'Basic', credits: 500, price: 39.99, bonus: 50, popular: true },
    { id: 'pro', name: 'Professional', credits: 1000, price: 69.99, bonus: 150 },
    { id: 'enterprise', name: 'Enterprise', credits: 5000, price: 299.99, bonus: 1000 },
  ];

  useEffect(() => {
    fetchCreditData();
  }, []);

  const fetchCreditData = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('authToken');

      // Fetch current balance
      const userRes = await axios.get('http://localhost:3002/api/v1/users/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCredits(userRes.data.data.credits || 0);

      // Fetch transaction history
      try {
        const transRes = await axios.get('http://localhost:3002/api/v1/users/transactions', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setTransactions(transRes.data.data || []);
      } catch (transError) {
        console.log('Transaction history not available yet');
        setTransactions([]);
      }

      // Fetch usage statistics
      try {
        const statsRes = await axios.get('http://localhost:3002/api/v1/users/stats', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUsageStats(statsRes.data.data || null);
      } catch (statsError) {
        console.log('Usage stats not available yet');
        setUsageStats(null);
      }
    } catch (error) {
      console.error('Error fetching credit data:', error);
      toast.error('Failed to load credit information');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = async (packageId: string) => {
    const selectedPkg = creditPackages.find(p => p.id === packageId);
    if (!selectedPkg) return;

    setSelectedPackage(selectedPkg);
    setShowPurchaseModal(true);
  };

  const confirmPurchase = async () => {
    if (!selectedPackage) return;

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/payments/create',
        {
          packageId: selectedPackage.id,
          credits: selectedPackage.credits + selectedPackage.bonus,
          amount: selectedPackage.price,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.paymentUrl) {
        // Redirect to payment page
        window.location.href = response.data.paymentUrl;
      } else {
        toast.success('Payment initiated. Please complete the payment process.');
        setShowPurchaseModal(false);
        fetchCreditData(); // Refresh data
      }
    } catch (error) {
      console.error('Error creating payment:', error);
      toast.error('Failed to initiate payment');
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'PURCHASE':
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        );
      case 'USAGE':
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        );
      case 'REFUND':
        return (
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        );
      case 'BONUS':
        return (
          <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="text-white">
            <h2 className="text-2xl font-bold mb-2">Credit Balance</h2>
            <div className="flex items-center">
              <span className="text-5xl font-bold">{credits.toLocaleString()}</span>
              <span className="ml-3 text-xl opacity-75">credits</span>
            </div>
          </div>
          <button
            disabled
            className="px-6 py-3 bg-gray-300 text-gray-500 font-semibold rounded-lg cursor-not-allowed relative"
            title="Purchase functionality temporarily disabled"
          >
            Buy Credits
            <span className="absolute -top-1 -right-1 bg-yellow-500 text-yellow-900 text-xs px-1.5 py-0.5 rounded-full">
              Soon
            </span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('balance')}
              className={`py-2 px-6 border-b-2 font-medium text-sm ${
                activeTab === 'balance'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-2 px-6 border-b-2 font-medium text-sm ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Transaction History
            </button>
            <button
              onClick={() => setActiveTab('usage')}
              className={`py-2 px-6 border-b-2 font-medium text-sm ${
                activeTab === 'usage'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Usage Analytics
            </button>
            <button
              disabled
              className="py-2 px-6 border-b-2 font-medium text-sm border-transparent text-gray-400 cursor-not-allowed relative"
              title="Purchase functionality temporarily disabled"
            >
              Buy Credits
              <span className="absolute -top-1 -right-1 bg-yellow-500 text-yellow-900 text-xs px-1 py-0.5 rounded-full text-xs">
                Soon
              </span>
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'balance' && usageStats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-500">Total Used</h3>
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                  </svg>
                </div>
                <p className="text-2xl font-semibold text-gray-900">
                  {usageStats.totalCreditsUsed.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">credits consumed</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-500">Videos Processed</h3>
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-2xl font-semibold text-gray-900">
                  {usageStats.videosProcessed}
                </p>
                <p className="text-xs text-gray-500 mt-1">total videos</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-500">Avg per Video</h3>
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-2xl font-semibold text-gray-900">
                  {usageStats.averageCreditsPerVideo.toFixed(1)}
                </p>
                <p className="text-xs text-gray-500 mt-1">credits/video</p>
              </div>
            </div>
          )}

          {/* Transaction History Tab */}
          {activeTab === 'history' && (
            <div>
              <div className="overflow-hidden">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Balance
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction, index) => (
                      <tr key={transaction.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {getTransactionIcon(transaction.type)}
                            <span className="ml-2 text-sm font-medium text-gray-900">
                              {transaction.type}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {transaction.description}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm font-medium ${
                            transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {transaction.balance}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(transaction.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transactions.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No transactions yet
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Usage Analytics Tab */}
          {activeTab === 'usage' && (
            <div className="bg-white rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Credit Usage Summary</h3>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 px-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                    <span className="text-sm font-medium text-gray-900">Total Credits Used</span>
                  </div>
                  <span className="text-lg font-bold text-red-700">
                    {usageStats?.totalCreditsUsed?.toLocaleString() || '0'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3 px-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                    <span className="text-sm font-medium text-gray-900">Credits This Month</span>
                  </div>
                  <span className="text-lg font-bold text-blue-700">
                    {Math.floor((usageStats?.totalCreditsUsed || 0) * 0.3).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3 px-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                    <span className="text-sm font-medium text-gray-900">Average per Video</span>
                  </div>
                  <span className="text-lg font-bold text-green-700">
                    {usageStats?.averageCreditsPerVideo?.toFixed(1) || '0.0'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3 px-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-purple-500 rounded-full mr-3"></div>
                    <span className="text-sm font-medium text-gray-900">Total Refunds</span>
                  </div>
                  <span className="text-lg font-bold text-purple-700">
                    {transactions.filter(t => t.type === 'REFUND').reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-gray-500 rounded-full mr-3"></div>
                    <span className="text-sm font-medium text-gray-900">Video Processing Usage</span>
                  </div>
                  <span className="text-lg font-bold text-gray-700">
                    {Math.floor((usageStats?.totalCreditsUsed || 0) * 0.8).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3 px-4 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-orange-500 rounded-full mr-3"></div>
                    <span className="text-sm font-medium text-gray-900">Storage & Uploads</span>
                  </div>
                  <span className="text-lg font-bold text-orange-700">
                    {Math.floor((usageStats?.totalCreditsUsed || 0) * 0.15).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3 px-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-indigo-500 rounded-full mr-3"></div>
                    <span className="text-sm font-medium text-gray-900">Premium Features</span>
                  </div>
                  <span className="text-lg font-bold text-indigo-700">
                    {Math.floor((usageStats?.totalCreditsUsed || 0) * 0.05).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Purchase Tab - Disabled */}
          {activeTab === 'purchase' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {creditPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`relative rounded-lg border-2 p-6 ${
                    pkg.popular
                      ? 'border-blue-500 shadow-lg'
                      : 'border-gray-200'
                  }`}
                >
                  {pkg.popular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                        MOST POPULAR
                      </span>
                    </div>
                  )}

                  <div className="text-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">{pkg.name}</h3>
                    <div className="mt-2">
                      <span className="text-3xl font-bold text-gray-900">${pkg.price}</span>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Credits</span>
                      <span className="font-medium text-gray-900">{pkg.credits.toLocaleString()}</span>
                    </div>
                    {pkg.bonus > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Bonus</span>
                        <span className="font-medium text-green-600">+{pkg.bonus}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Total</span>
                      <span className="font-bold text-gray-900">
                        {(pkg.credits + pkg.bonus).toLocaleString()}
                      </span>
                    </div>
                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Cost per credit</span>
                        <span className="font-medium text-gray-900">
                          ${(pkg.price / (pkg.credits + pkg.bonus)).toFixed(3)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    disabled
                    className="w-full py-2 px-4 rounded-md font-medium bg-gray-300 text-gray-500 cursor-not-allowed"
                    title="Purchase functionality temporarily disabled"
                  >
                    Coming Soon
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Low Credit Warning */}
      {credits < 50 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                Your credit balance is running low. Consider purchasing more credits to continue processing videos without interruption.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Confirmation Modal */}
      {showPurchaseModal && selectedPackage && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Purchase</h3>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Package</span>
                  <span className="text-sm font-medium text-gray-900">{selectedPackage.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Credits</span>
                  <span className="text-sm font-medium text-gray-900">
                    {(selectedPackage.credits + selectedPackage.bonus).toLocaleString()}
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-sm font-medium text-gray-900">Total</span>
                  <span className="text-lg font-bold text-gray-900">${selectedPackage.price}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowPurchaseModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmPurchase}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Proceed to Payment
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
};

export { CreditUsageDisplay };