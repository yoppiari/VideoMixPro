import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import EmailTemplateEditor from './EmailTemplateEditor';
import NotificationCenter from '../NotificationCenter';
import {
  EnvelopeIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
  UsersIcon,
  PaperAirplaneIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  FunnelIcon,
  CalendarIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

interface EmailStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
}

interface NotificationStats {
  total: number;
  read: number;
  unread: number;
  byType: Record<string, number>;
}

interface RecentEmail {
  id: string;
  recipient: string;
  subject: string;
  templateName: string;
  status: 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed';
  sentAt: string;
  openedAt?: string;
}

interface BroadcastMessage {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  targetUsers: 'all' | 'active' | 'premium' | 'custom';
  customUserIds?: string[];
}

const CommunicationDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'emails' | 'notifications' | 'broadcast'>('overview');
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [notificationStats, setNotificationStats] = useState<NotificationStats | null>(null);
  const [recentEmails, setRecentEmails] = useState<RecentEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Broadcast state
  const [broadcastMessage, setBroadcastMessage] = useState<BroadcastMessage>({
    title: '',
    message: '',
    type: 'info',
    targetUsers: 'all',
    customUserIds: []
  });
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [dateRange]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);

      const [emailStatsRes, notificationStatsRes, recentEmailsRes] = await Promise.all([
        api.get('/admin/communication/email-stats', { params: dateRange }),
        api.get('/admin/communication/notification-stats'),
        api.get('/admin/communication/recent-emails', { params: { limit: 10 } })
      ]);

      setEmailStats(emailStatsRes.data);
      setNotificationStats(notificationStatsRes.data);
      setRecentEmails(recentEmailsRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to fetch communication data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastMessage.title || !broadcastMessage.message) {
      toast.error('Please enter title and message');
      return;
    }

    if (!window.confirm(`Are you sure you want to send this broadcast to ${broadcastMessage.targetUsers} users?`)) {
      return;
    }

    setIsSendingBroadcast(true);
    try {
      const response = await api.post('/admin/communication/broadcast', broadcastMessage);
      toast.success(`Broadcast sent to ${response.data.recipientCount} users`);

      // Reset form
      setBroadcastMessage({
        title: '',
        message: '',
        type: 'info',
        targetUsers: 'all',
        customUserIds: []
      });

      // Refresh stats
      fetchDashboardData();
    } catch (error) {
      console.error('Error sending broadcast:', error);
      toast.error('Failed to send broadcast');
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  const resendEmail = async (emailId: string) => {
    try {
      await api.post(`/admin/communication/emails/${emailId}/resend`);
      toast.success('Email resent successfully');
      fetchDashboardData();
    } catch (error) {
      console.error('Error resending email:', error);
      toast.error('Failed to resend email');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
      case 'opened':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'bounced':
      case 'failed':
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
      case 'sent':
        return <ClockIcon className="w-4 h-4 text-yellow-500" />;
      default:
        return <ExclamationCircleIcon className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      sent: 'bg-yellow-100 text-yellow-800',
      delivered: 'bg-blue-100 text-blue-800',
      opened: 'bg-green-100 text-green-800',
      bounced: 'bg-orange-100 text-orange-800',
      failed: 'bg-red-100 text-red-800'
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  const calculatePercentage = (value: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  const filteredEmails = recentEmails.filter(email => {
    const matchesSearch = email.recipient.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          email.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || email.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow mb-6 p-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Communication Dashboard</h1>
              <p className="text-gray-600 mt-1">Manage emails, notifications, and broadcasts</p>
            </div>
            <div className="flex items-center space-x-4">
              <NotificationCenter userId={localStorage.getItem('userId') || ''} />
              <button
                onClick={fetchDashboardData}
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <ArrowPathIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 mt-6 border-b border-gray-200">
            {[
              { id: 'overview', label: 'Overview', icon: ChartBarIcon },
              { id: 'emails', label: 'Email Templates', icon: EnvelopeIcon },
              { id: 'notifications', label: 'Notifications', icon: BellIcon },
              { id: 'broadcast', label: 'Broadcast', icon: ChatBubbleLeftRightIcon }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center px-4 py-2 font-medium text-sm border-b-2 transition ${
                  activeTab === tab.id
                    ? 'text-indigo-600 border-indigo-600'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Email Stats Card */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <EnvelopeIcon className="w-8 h-8 text-indigo-600" />
                  <span className="text-2xl font-bold text-gray-900">
                    {emailStats?.sent || 0}
                  </span>
                </div>
                <h3 className="text-gray-600 font-medium">Emails Sent</h3>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Delivered</span>
                    <span className="font-medium">
                      {calculatePercentage(emailStats?.delivered || 0, emailStats?.sent || 0)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Opened</span>
                    <span className="font-medium">
                      {calculatePercentage(emailStats?.opened || 0, emailStats?.delivered || 0)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Notification Stats Card */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <BellIcon className="w-8 h-8 text-yellow-600" />
                  <span className="text-2xl font-bold text-gray-900">
                    {notificationStats?.total || 0}
                  </span>
                </div>
                <h3 className="text-gray-600 font-medium">Notifications</h3>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Read</span>
                    <span className="font-medium">{notificationStats?.read || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Unread</span>
                    <span className="font-medium text-yellow-600">
                      {notificationStats?.unread || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Success Rate Card */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <CheckCircleIcon className="w-8 h-8 text-green-600" />
                  <span className="text-2xl font-bold text-gray-900">
                    {emailStats && emailStats.sent > 0
                      ? calculatePercentage(emailStats.delivered, emailStats.sent)
                      : 0}%
                  </span>
                </div>
                <h3 className="text-gray-600 font-medium">Delivery Rate</h3>
                <div className="mt-4">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{
                        width: `${emailStats && emailStats.sent > 0
                          ? calculatePercentage(emailStats.delivered, emailStats.sent)
                          : 0}%`
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Failed/Bounced Card */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <XCircleIcon className="w-8 h-8 text-red-600" />
                  <span className="text-2xl font-bold text-gray-900">
                    {(emailStats?.failed || 0) + (emailStats?.bounced || 0)}
                  </span>
                </div>
                <h3 className="text-gray-600 font-medium">Failed/Bounced</h3>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Failed</span>
                    <span className="font-medium text-red-600">{emailStats?.failed || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Bounced</span>
                    <span className="font-medium text-orange-600">{emailStats?.bounced || 0}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Emails Table */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold">Recent Emails</h2>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search emails..."
                      className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="all">All Status</option>
                      <option value="sent">Sent</option>
                      <option value="delivered">Delivered</option>
                      <option value="opened">Opened</option>
                      <option value="bounced">Bounced</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Recipient
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Subject
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Template
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Sent At
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredEmails.map(email => (
                      <tr key={email.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {email.recipient}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {email.subject}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {email.templateName}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-1">
                            {getStatusIcon(email.status)}
                            {getStatusBadge(email.status)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(email.sentAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          {(email.status === 'failed' || email.status === 'bounced') && (
                            <button
                              onClick={() => resendEmail(email.id)}
                              className="text-indigo-600 hover:text-indigo-900 text-sm"
                            >
                              Resend
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'emails' && <EmailTemplateEditor />}

        {activeTab === 'notifications' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Notification Management</h2>
            <div className="space-y-4">
              <p className="text-gray-600">
                View and manage system notifications. The notification center is integrated
                in the header for real-time updates.
              </p>

              {/* Notification Type Stats */}
              {notificationStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  {Object.entries(notificationStats.byType).map(([type, count]) => (
                    <div key={type} className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-600 capitalize">
                        {type.replace(/_/g, ' ')}
                      </h4>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'broadcast' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-6">Send Broadcast Message</h2>

            <div className="space-y-6">
              {/* Message Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message Type
                </label>
                <div className="flex space-x-4">
                  {['info', 'success', 'warning', 'error'].map(type => (
                    <label key={type} className="flex items-center">
                      <input
                        type="radio"
                        value={type}
                        checked={broadcastMessage.type === type}
                        onChange={(e) => setBroadcastMessage({
                          ...broadcastMessage,
                          type: e.target.value as any
                        })}
                        className="mr-2"
                      />
                      <span className="capitalize">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Target Users */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Users
                </label>
                <select
                  value={broadcastMessage.targetUsers}
                  onChange={(e) => setBroadcastMessage({
                    ...broadcastMessage,
                    targetUsers: e.target.value as any
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="all">All Users</option>
                  <option value="active">Active Users (Last 30 days)</option>
                  <option value="premium">Premium Users</option>
                  <option value="custom">Custom User IDs</option>
                </select>
              </div>

              {/* Custom User IDs */}
              {broadcastMessage.targetUsers === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    User IDs (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={broadcastMessage.customUserIds?.join(', ')}
                    onChange={(e) => setBroadcastMessage({
                      ...broadcastMessage,
                      customUserIds: e.target.value.split(',').map(id => id.trim()).filter(Boolean)
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="user1, user2, user3..."
                  />
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={broadcastMessage.title}
                  onChange={(e) => setBroadcastMessage({
                    ...broadcastMessage,
                    title: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Enter broadcast title..."
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message
                </label>
                <textarea
                  value={broadcastMessage.message}
                  onChange={(e) => setBroadcastMessage({
                    ...broadcastMessage,
                    message: e.target.value
                  })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Enter your broadcast message..."
                />
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Preview</h3>
                <div className={`p-4 rounded-lg ${
                  broadcastMessage.type === 'info' ? 'bg-blue-100 text-blue-800' :
                  broadcastMessage.type === 'success' ? 'bg-green-100 text-green-800' :
                  broadcastMessage.type === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  <p className="font-medium">{broadcastMessage.title || 'Title'}</p>
                  <p className="text-sm mt-1">{broadcastMessage.message || 'Message content'}</p>
                </div>
              </div>

              {/* Send Button */}
              <button
                onClick={handleSendBroadcast}
                disabled={isSendingBroadcast || !broadcastMessage.title || !broadcastMessage.message}
                className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center"
              >
                {isSendingBroadcast ? (
                  <>
                    <ArrowPathIcon className="w-5 h-5 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="w-5 h-5 mr-2" />
                    Send Broadcast
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunicationDashboard;