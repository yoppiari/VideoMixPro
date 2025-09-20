import React, { useState, useEffect, useRef } from 'react';
import socketIOClient from 'socket.io-client';
import { toast } from 'react-toastify';
import api from '../services/api';
import {
  BellIcon,
  CheckIcon,
  XMarkIcon,
  TrashIcon,
  EnvelopeOpenIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  CreditCardIcon,
  FilmIcon,
  UserIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { BellIcon as BellIconSolid } from '@heroicons/react/24/solid';

const io = socketIOClient;
type Socket = SocketIOClient.Socket;

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NotificationCenterProps {
  userId: string;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ userId }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const socketRef = useRef<Socket | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Notification type icons and colors
  const notificationConfig: Record<string, { icon: any; color: string; bgColor: string }> = {
    payment_received: {
      icon: CreditCardIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    payment_pending: {
      icon: CreditCardIcon,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100'
    },
    payment_failed: {
      icon: XCircleIcon,
      color: 'text-red-600',
      bgColor: 'bg-red-100'
    },
    video_processing_started: {
      icon: FilmIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    video_processing_completed: {
      icon: CheckCircleIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    video_processing_failed: {
      icon: XCircleIcon,
      color: 'text-red-600',
      bgColor: 'bg-red-100'
    },
    project_created: {
      icon: FilmIcon,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100'
    },
    user_registered: {
      icon: UserIcon,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    system_update: {
      icon: Cog6ToothIcon,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100'
    },
    info: {
      icon: InformationCircleIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    warning: {
      icon: ExclamationCircleIcon,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100'
    },
    error: {
      icon: XCircleIcon,
      color: 'text-red-600',
      bgColor: 'bg-red-100'
    },
    success: {
      icon: CheckCircleIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    }
  };

  useEffect(() => {
    fetchNotifications();
    initializeWebSocket();

    // Click outside handler
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [userId]);

  const fetchNotifications = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/notifications');
      setNotifications(response.data);
      updateUnreadCount(response.data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const initializeWebSocket = () => {
    // Get token from localStorage
    const token = localStorage.getItem('token');
    if (!token) return;

    // Connect to WebSocket server
    socketRef.current = io(process.env.REACT_APP_WS_URL || 'ws://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    // Listen for new notifications
    socketRef.current.on('notification', (notification: Notification) => {
      // Add new notification to the list
      setNotifications(prev => [notification, ...prev]);

      // Update unread count
      if (!notification.isRead) {
        setUnreadCount(prev => prev + 1);
      }

      // Show toast notification
      showToastNotification(notification);
    });

    // Handle connection events
    socketRef.current.on('connect', () => {
      console.log('Connected to notification server');
    });

    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from notification server');
    });

    socketRef.current.on('error', (error: any) => {
      console.error('WebSocket error:', error);
    });
  };

  const showToastNotification = (notification: Notification) => {
    const config = notificationConfig[notification.type] || notificationConfig.info;
    const Icon = config.icon;

    const toastContent = (
      <div className="flex items-start">
        <Icon className={`w-5 h-5 mr-2 ${config.color}`} />
        <div>
          <p className="font-medium">{notification.title}</p>
          <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
        </div>
      </div>
    );

    // Show toast based on notification type
    if (notification.type.includes('error') || notification.type.includes('failed')) {
      toast.error(toastContent);
    } else if (notification.type.includes('warning')) {
      toast.warning(toastContent);
    } else if (notification.type.includes('success') || notification.type.includes('completed')) {
      toast.success(toastContent);
    } else {
      toast.info(toastContent);
    }
  };

  const updateUnreadCount = (notificationsList: Notification[]) => {
    const unread = notificationsList.filter(n => !n.isRead).length;
    setUnreadCount(unread);
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);

      setNotifications(prev => prev.map(n =>
        n.id === notificationId ? { ...n, isRead: true } : n
      ));

      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');

      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      toast.error('Failed to mark all as read');
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      await api.delete(`/notifications/${notificationId}`);

      setNotifications(prev => {
        const notification = prev.find(n => n.id === notificationId);
        if (notification && !notification.isRead) {
          setUnreadCount(count => Math.max(0, count - 1));
        }
        return prev.filter(n => n.id !== notificationId);
      });

      toast.success('Notification deleted');
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  const clearAllNotifications = async () => {
    if (!window.confirm('Are you sure you want to clear all notifications?')) return;

    try {
      await api.delete('/notifications/clear-all');
      setNotifications([]);
      setUnreadCount(0);
      toast.success('All notifications cleared');
    } catch (error) {
      console.error('Error clearing notifications:', error);
      toast.error('Failed to clear notifications');
    }
  };

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.isRead)
    : notifications;

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const getNotificationIcon = (type: string) => {
    const config = notificationConfig[type] || notificationConfig.info;
    const Icon = config.icon;
    return <Icon className={`w-5 h-5 ${config.color}`} />;
  };

  const getNotificationBgColor = (type: string) => {
    const config = notificationConfig[type] || notificationConfig.info;
    return config.bgColor;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none"
      >
        {unreadCount > 0 ? (
          <BellIconSolid className="w-6 h-6 text-indigo-600" />
        ) : (
          <BellIcon className="w-6 h-6" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 px-2 py-1 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
              <div className="flex space-x-2">
                <button
                  onClick={markAllAsRead}
                  className="text-sm text-indigo-600 hover:text-indigo-800"
                  disabled={unreadCount === 0}
                >
                  <EnvelopeOpenIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={clearAllNotifications}
                  className="text-sm text-red-600 hover:text-red-800"
                  disabled={notifications.length === 0}
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex space-x-4 mt-3">
              <button
                onClick={() => setFilter('all')}
                className={`text-sm font-medium ${
                  filter === 'all'
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`text-sm font-medium ${
                  filter === 'unread'
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="mt-2 text-gray-500">Loading notifications...</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <BellIcon className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                <p className="text-gray-500">
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredNotifications.map(notification => (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 hover:bg-gray-50 transition ${
                      !notification.isRead ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start">
                      <div className={`p-2 rounded-lg ${getNotificationBgColor(notification.type)} mr-3`}>
                        {getNotificationIcon(notification.type)}
                      </div>

                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className={`text-sm font-medium ${!notification.isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                              {notification.title}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {notification.message}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatTime(notification.createdAt)}
                            </p>
                          </div>

                          <div className="flex items-center space-x-1 ml-2">
                            {!notification.isRead && (
                              <button
                                onClick={() => markAsRead(notification.id)}
                                className="p-1 text-indigo-600 hover:text-indigo-800"
                                title="Mark as read"
                              >
                                <CheckIcon className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteNotification(notification.id)}
                              className="p-1 text-red-600 hover:text-red-800"
                              title="Delete"
                            >
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Additional Data Display */}
                        {notification.data && (
                          <div className="mt-2 p-2 bg-gray-100 rounded text-xs text-gray-600">
                            {notification.type === 'payment_received' && (
                              <>
                                Amount: ${notification.data.amount} |
                                Credits: {notification.data.credits} |
                                Invoice: {notification.data.invoiceNumber}
                              </>
                            )}
                            {notification.type.includes('video_processing') && (
                              <>
                                Project: {notification.data.projectName} |
                                Video: {notification.data.videoName}
                              </>
                            )}
                            {notification.type === 'project_created' && (
                              <>Project ID: {notification.data.projectId}</>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {filteredNotifications.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 text-center">
              <button
                onClick={fetchNotifications}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Refresh Notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;