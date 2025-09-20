import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import {
  KeyIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  CloudArrowUpIcon,
  ShieldCheckIcon,
  CalendarDaysIcon,
  CpuChipIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

interface LicenseInfo {
  key: string;
  status: 'active' | 'expired' | 'invalid' | 'trial' | 'suspended';
  type: 'trial' | 'basic' | 'professional' | 'enterprise';
  owner: {
    name: string;
    email: string;
    company?: string;
  };
  features: string[];
  limits: {
    projects: number;
    videosPerProject: number;
    processingMinutes: number;
    storage: number; // in GB
    users: number;
  };
  dates: {
    activated: string;
    expires: string;
    lastVerified: string;
  };
  usage: {
    projects: number;
    processingMinutes: number;
    storage: number;
  };
}

interface LicenseVerificationProps {
  onVerificationComplete?: (license: LicenseInfo) => void;
  showUpgrade?: boolean;
}

const LicenseVerification: React.FC<LicenseVerificationProps> = ({
  onVerificationComplete,
  showUpgrade = true
}) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isOnlineMode, setIsOnlineMode] = useState(true);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load saved license from localStorage
    const savedLicense = localStorage.getItem('licenseInfo');
    if (savedLicense) {
      try {
        const parsed = JSON.parse(savedLicense);
        setLicenseInfo(parsed);
        setLicenseKey(parsed.key);
      } catch (e) {
        console.error('Failed to parse saved license:', e);
      }
    }

    // Check online status
    const checkOnlineStatus = () => {
      setIsOnlineMode(navigator.onLine);
    };

    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', checkOnlineStatus);

    return () => {
      window.removeEventListener('online', checkOnlineStatus);
      window.removeEventListener('offline', checkOnlineStatus);
    };
  }, []);

  const formatLicenseKey = (key: string) => {
    // Format as XXXX-XXXX-XXXX-XXXX
    const cleaned = key.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const chunks = cleaned.match(/.{1,4}/g) || [];
    return chunks.join('-').substring(0, 19); // Max 4 groups of 4 chars
  };

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatLicenseKey(e.target.value);
    setLicenseKey(formatted);
  };

  const verifyLicense = async () => {
    if (!licenseKey || licenseKey.length < 19) {
      setError('Please enter a valid license key');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      if (isOnlineMode) {
        // Online verification
        const response = await api.post('/license/verify', { key: licenseKey });
        const licenseData = response.data;

        // Save to localStorage
        localStorage.setItem('licenseInfo', JSON.stringify(licenseData));
        setLicenseInfo(licenseData);

        toast.success('License verified successfully!');

        if (onVerificationComplete) {
          onVerificationComplete(licenseData);
        }
      } else {
        // Offline verification (check against saved data)
        const savedLicense = localStorage.getItem('licenseInfo');
        if (savedLicense) {
          const parsed = JSON.parse(savedLicense);

          if (parsed.key === licenseKey) {
            // Check if license is still valid based on saved expiry
            const expiryDate = new Date(parsed.dates.expires);
            const now = new Date();

            if (expiryDate > now) {
              setLicenseInfo(parsed);
              toast.info('License verified offline. Connect to internet for latest status.');
            } else {
              setError('License has expired. Please connect to internet to renew.');
            }
          } else {
            setError('Invalid license key for offline verification');
          }
        } else {
          setError('No offline license data found. Please connect to internet.');
        }
      }
    } catch (error: any) {
      console.error('License verification failed:', error);
      setError(error.response?.data?.message || 'Failed to verify license');
      toast.error('License verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const activateLicense = async () => {
    if (!licenseKey) {
      setError('Please enter a license key');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const response = await api.post('/license/activate', {
        key: licenseKey,
        deviceId: getDeviceId()
      });

      const licenseData = response.data;
      localStorage.setItem('licenseInfo', JSON.stringify(licenseData));
      setLicenseInfo(licenseData);

      toast.success('License activated successfully!');

      if (onVerificationComplete) {
        onVerificationComplete(licenseData);
      }
    } catch (error: any) {
      console.error('License activation failed:', error);
      setError(error.response?.data?.message || 'Failed to activate license');
      toast.error('License activation failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const deactivateLicense = async () => {
    if (!window.confirm('Are you sure you want to deactivate this license?')) return;

    setIsVerifying(true);

    try {
      await api.post('/license/deactivate', {
        key: licenseKey,
        deviceId: getDeviceId()
      });

      localStorage.removeItem('licenseInfo');
      setLicenseInfo(null);
      setLicenseKey('');

      toast.success('License deactivated');
    } catch (error) {
      console.error('Failed to deactivate license:', error);
      toast.error('Failed to deactivate license');
    } finally {
      setIsVerifying(false);
    }
  };

  const getDeviceId = () => {
    // Generate or retrieve a unique device ID
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'trial': return 'text-blue-600 bg-blue-100';
      case 'expired': return 'text-red-600 bg-red-100';
      case 'suspended': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'enterprise': return 'text-purple-600';
      case 'professional': return 'text-indigo-600';
      case 'basic': return 'text-blue-600';
      case 'trial': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  const calculateDaysRemaining = (expiryDate: string) => {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <KeyIcon className="w-8 h-8 text-indigo-600 mr-3" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">License Management</h2>
              <p className="text-sm text-gray-600 mt-1">
                {isOnlineMode ? (
                  <span className="flex items-center text-green-600">
                    <span className="w-2 h-2 bg-green-600 rounded-full mr-2"></span>
                    Online Mode
                  </span>
                ) : (
                  <span className="flex items-center text-yellow-600">
                    <span className="w-2 h-2 bg-yellow-600 rounded-full mr-2"></span>
                    Offline Mode
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* License Input */}
        {!licenseInfo && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                License Key
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={licenseKey}
                  onChange={handleKeyChange}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono uppercase"
                  maxLength={19}
                />
                <button
                  onClick={verifyLicense}
                  disabled={isVerifying || !licenseKey}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                >
                  {isVerifying ? (
                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <ShieldCheckIcon className="w-5 h-5 mr-2" />
                      Verify
                    </>
                  )}
                </button>
                <button
                  onClick={activateLicense}
                  disabled={isVerifying || !licenseKey || !isOnlineMode}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center"
                >
                  <CloudArrowUpIcon className="w-5 h-5 mr-2" />
                  Activate
                </button>
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-600 flex items-center">
                  <ExclamationTriangleIcon className="w-4 h-4 mr-1" />
                  {error}
                </p>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">How to get a license:</h3>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>Purchase a license from our website</li>
                <li>You'll receive a license key via email</li>
                <li>Enter the key above and click "Activate"</li>
                <li>Your license will be bound to this device</li>
              </ol>
            </div>
          </div>
        )}

        {/* License Info Display */}
        {licenseInfo && (
          <div className="space-y-6">
            {/* Status Bar */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(licenseInfo.status)}`}>
                    {licenseInfo.status.toUpperCase()}
                  </span>
                  <span className={`text-lg font-semibold ${getTypeColor(licenseInfo.type)}`}>
                    {licenseInfo.type.charAt(0).toUpperCase() + licenseInfo.type.slice(1)} License
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {licenseInfo.status === 'active' && (
                    <div className="text-sm text-gray-600">
                      <CalendarDaysIcon className="w-4 h-4 inline mr-1" />
                      {calculateDaysRemaining(licenseInfo.dates.expires)} days remaining
                    </div>
                  )}
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="px-3 py-1 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                  >
                    {showDetails ? 'Hide' : 'Show'} Details
                  </button>
                  <button
                    onClick={deactivateLicense}
                    className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            </div>

            {/* License Details */}
            {showDetails && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Owner Information */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">License Owner</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">Name:</span>
                      <span className="ml-2 text-gray-900">{licenseInfo.owner.name}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <span className="ml-2 text-gray-900">{licenseInfo.owner.email}</span>
                    </div>
                    {licenseInfo.owner.company && (
                      <div>
                        <span className="text-gray-500">Company:</span>
                        <span className="ml-2 text-gray-900">{licenseInfo.owner.company}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500">License Key:</span>
                      <span className="ml-2 text-gray-900 font-mono text-xs">{licenseInfo.key}</span>
                    </div>
                  </div>
                </div>

                {/* Important Dates */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Important Dates</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">Activated:</span>
                      <span className="ml-2 text-gray-900">
                        {new Date(licenseInfo.dates.activated).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Expires:</span>
                      <span className="ml-2 text-gray-900">
                        {new Date(licenseInfo.dates.expires).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Last Verified:</span>
                      <span className="ml-2 text-gray-900">
                        {new Date(licenseInfo.dates.lastVerified).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Usage Stats */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Usage Statistics</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">Projects</span>
                        <span className="text-gray-900">
                          {licenseInfo.usage.projects} / {licenseInfo.limits.projects}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-indigo-600 h-2 rounded-full"
                          style={{
                            width: `${(licenseInfo.usage.projects / licenseInfo.limits.projects) * 100}%`
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">Processing Minutes</span>
                        <span className="text-gray-900">
                          {licenseInfo.usage.processingMinutes} / {licenseInfo.limits.processingMinutes}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-indigo-600 h-2 rounded-full"
                          style={{
                            width: `${(licenseInfo.usage.processingMinutes / licenseInfo.limits.processingMinutes) * 100}%`
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">Storage</span>
                        <span className="text-gray-900">
                          {licenseInfo.usage.storage}GB / {licenseInfo.limits.storage}GB
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-indigo-600 h-2 rounded-full"
                          style={{
                            width: `${(licenseInfo.usage.storage / licenseInfo.limits.storage) * 100}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Features */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Included Features</h3>
                  <div className="space-y-1">
                    {licenseInfo.features.map((feature, index) => (
                      <div key={index} className="flex items-center text-sm">
                        <CheckCircleIcon className="w-4 h-4 text-green-500 mr-2" />
                        <span className="text-gray-700">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Upgrade Section */}
            {showUpgrade && licenseInfo.type !== 'enterprise' && (
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg p-6 text-white">
                <h3 className="text-lg font-semibold mb-2">Upgrade Your License</h3>
                <p className="text-sm mb-4 opacity-90">
                  Unlock more features and increase your limits with a higher tier license.
                </p>
                <button className="px-4 py-2 bg-white text-indigo-600 rounded-lg font-medium hover:bg-gray-100">
                  View Upgrade Options
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LicenseVerification;