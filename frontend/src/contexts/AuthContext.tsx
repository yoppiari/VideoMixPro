import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import apiClient from '../utils/api/client';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  credits: number;
  isActive: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthAction {
  type: 'LOGIN_START' | 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGOUT' | 'SET_LOADING' | 'UPDATE_USER';
  payload?: any;
}

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('authToken'),
  isLoading: true,
  isAuthenticated: false,
};

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'LOGIN_START':
      return { ...state, isLoading: true };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload,
      };
    default:
      return state;
  }
};

interface AuthContextType {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const login = async (email: string, password: string): Promise<void> => {
    try {
      dispatch({ type: 'LOGIN_START' });
      const response = await apiClient.login(email, password);

      if (response.success) {
        const { token, user } = response.data;
        localStorage.setItem('authToken', token);
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { token, user },
        });
      } else {
        throw new Error(response.error || 'Login failed');
      }
    } catch (error: any) {
      dispatch({ type: 'LOGIN_FAILURE' });
      throw error;
    }
  };

  const register = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<void> => {
    try {
      dispatch({ type: 'LOGIN_START' });
      const response = await apiClient.register(data);

      if (response.success) {
        const { token, user } = response.data;
        localStorage.setItem('authToken', token);
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { token, user },
        });
      } else {
        throw new Error(response.error || 'Registration failed');
      }
    } catch (error: any) {
      dispatch({ type: 'LOGIN_FAILURE' });
      throw error;
    }
  };

  const logout = (): void => {
    localStorage.removeItem('authToken');
    dispatch({ type: 'LOGOUT' });
    // Optional: call API logout endpoint
    apiClient.logout().catch(() => {
      // Ignore errors on logout
    });
  };

  const checkAuth = async (): Promise<void> => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      dispatch({ type: 'SET_LOADING', payload: false });
      return;
    }

    try {
      const response = await apiClient.getProfile();
      if (response.success) {
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { token, user: response.data },
        });
      } else {
        throw new Error('Invalid token');
      }
    } catch (error) {
      localStorage.removeItem('authToken');
      dispatch({ type: 'LOGIN_FAILURE' });
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const contextValue: AuthContextType = {
    state,
    login,
    register,
    logout,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};