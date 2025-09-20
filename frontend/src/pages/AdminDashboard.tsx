import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalAdmins: number;
  totalPayments: number;
  totalRevenue: number;
  pendingPayments: number;
  recentUsers: number;
  recentPayments: number;
}

interface SystemHealth {
  database: 'healthy' | 'warning' | 'error';
  emailService: 'healthy' | 'warning' | 'error';
  storage: 'healthy' | 'warning' | 'error';
  uptime: number;
  memoryUsage: number;
}

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      if (!token) {
        navigate('/login');
        return;
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const [statsResponse, healthResponse] = await Promise.all([
        fetch('/api/v1/admin/stats', { headers }),
        fetch('/api/v1/admin/health', { headers }),
      ]);

      if (!statsResponse.ok || !healthResponse.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const [statsData, healthData] = await Promise.all([
        statsResponse.json(),
        healthResponse.json(),
      ]);

      setStats(statsData.data);
      setHealth(healthData.data);
      setError(null);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
    }).format(amount);
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Dashboard Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">VideoMixPro Administration Panel</p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => navigate('/admin/users')}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Manage Users
              </button>
              <button
                onClick={() => navigate('/admin/payments')}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                Manage Payments
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
              >
                User Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* System Health Status */}
        {health && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">System Health</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Database</p>
                    <p className={`text-sm font-medium px-2 py-1 rounded ${getHealthStatusColor(health.database)}`}>
                      {health.database.toUpperCase()}
                    </p>
                  </div>
                  <div className="text-2xl">🗄️</div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Email Service</p>
                    <p className={`text-sm font-medium px-2 py-1 rounded ${getHealthStatusColor(health.emailService)}`}>
                      {health.emailService.toUpperCase()}
                    </p>
                  </div>
                  <div className="text-2xl">📧</div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Uptime</p>
                    <p className="text-lg font-semibold text-gray-800">
                      {formatUptime(health.uptime)}
                    </p>
                  </div>
                  <div className="text-2xl">⏱️</div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Memory Usage</p>
                    <p className="text-lg font-semibold text-gray-800">
                      {health.memoryUsage.toFixed(1)} MB
                    </p>
                  </div>
                  <div className="text-2xl">💾</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">Total Users</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.totalUsers.toLocaleString()}</p>
                  <p className="text-sm text-gray-500">{stats.activeUsers} active</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-full">
                  <div className="text-blue-600 text-2xl">👥</div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">Total Revenue</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats.totalRevenue)}</p>
                  <p className="text-sm text-gray-500">{stats.totalPayments} payments</p>
                </div>
                <div className="bg-green-100 p-3 rounded-full">
                  <div className="text-green-600 text-2xl">💰</div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">Pending Payments</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.pendingPayments}</p>
                  <p className="text-sm text-red-500">Requires attention</p>
                </div>
                <div className="bg-yellow-100 p-3 rounded-full">
                  <div className="text-yellow-600 text-2xl">⏳</div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">Recent Activity</p>
                  <p className="text-lg font-bold text-gray-900">{stats.recentUsers} new users</p>
                  <p className="text-sm text-gray-500">{stats.recentPayments} new payments</p>
                </div>
                <div className="bg-purple-100 p-3 rounded-full">
                  <div className="text-purple-600 text-2xl">📊</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">Quick Actions</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                onClick={() => navigate('/admin/users')}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="flex items-center">
                  <div className="text-2xl mr-3">👤</div>
                  <div>
                    <p className="font-medium text-gray-900">User Management</p>
                    <p className="text-sm text-gray-600">View and manage all users</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/admin/payments')}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="flex items-center">
                  <div className="text-2xl mr-3">💳</div>
                  <div>
                    <p className="font-medium text-gray-900">Payment Management</p>
                    <p className="text-sm text-gray-600">Approve and manage payments</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/admin/analytics')}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="flex items-center">
                  <div className="text-2xl mr-3">📈</div>
                  <div>
                    <p className="font-medium text-gray-900">Analytics</p>
                    <p className="text-sm text-gray-600">View detailed analytics</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/admin/emails')}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="flex items-center">
                  <div className="text-2xl mr-3">📧</div>
                  <div>
                    <p className="font-medium text-gray-900">Email Management</p>
                    <p className="text-sm text-gray-600">Manage email templates and logs</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/admin/logs')}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="flex items-center">
                  <div className="text-2xl mr-3">📋</div>
                  <div>
                    <p className="font-medium text-gray-900">Activity Logs</p>
                    <p className="text-sm text-gray-600">View admin activity logs</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/admin/settings')}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="flex items-center">
                  <div className="text-2xl mr-3">⚙️</div>
                  <div>
                    <p className="font-medium text-gray-900">System Settings</p>
                    <p className="text-sm text-gray-600">Configure system settings</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Recent Activity Summary */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800">System Overview</h2>
            <button
              onClick={fetchDashboardData}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
            >
              <span className="mr-1">🔄</span>
              Refresh
            </button>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Platform Status</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total Users</span>
                    <span className="font-medium">{stats?.totalUsers}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Active Users</span>
                    <span className="font-medium">{stats?.activeUsers}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Admin Users</span>
                    <span className="font-medium">{stats?.totalAdmins}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Status</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total Payments</span>
                    <span className="font-medium">{stats?.totalPayments}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Pending Payments</span>
                    <span className="font-medium text-yellow-600">{stats?.pendingPayments}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total Revenue</span>
                    <span className="font-medium text-green-600">{formatCurrency(stats?.totalRevenue || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};