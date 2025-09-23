/**
 * Database Helper for SQLite/PostgreSQL Compatibility
 * Provides utilities for handling differences between SQLite and PostgreSQL
 */

// Enum constants for validation (since we use strings in the database)
export const ProcessingJobStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
} as const;

export const CreditTransactionType = {
  PURCHASE: 'PURCHASE',
  USAGE: 'USAGE',
  REFUND: 'REFUND',
  BONUS: 'BONUS'
} as const;

export const NotificationType = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ERROR: 'ERROR'
} as const;

export const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN'
} as const;

export const LicenseType = {
  FREE: 'FREE',
  BASIC: 'BASIC',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE'
} as const;

// Type definitions
export type ProcessingJobStatusType = typeof ProcessingJobStatus[keyof typeof ProcessingJobStatus];
export type CreditTransactionTypeType = typeof CreditTransactionType[keyof typeof CreditTransactionType];
export type NotificationTypeType = typeof NotificationType[keyof typeof NotificationType];
export type UserRoleType = typeof UserRole[keyof typeof UserRole];
export type LicenseTypeType = typeof LicenseType[keyof typeof LicenseType];

/**
 * Database helper class for handling SQLite/PostgreSQL compatibility
 */
export class DbHelper {
  private static isPostgreSQL(): boolean {
    const provider = process.env.DATABASE_PROVIDER || '';
    const url = process.env.DATABASE_URL || '';
    return provider === 'postgresql' || url.startsWith('postgres');
  }

  /**
   * Serialize JSON data for storage
   * SQLite stores as string, PostgreSQL can use native JSON
   */
  static serializeJson(data: any): string | object {
    if (!data) return null;
    
    // For SQLite, always stringify
    if (!this.isPostgreSQL()) {
      return typeof data === 'string' ? data : JSON.stringify(data);
    }
    
    // For PostgreSQL, we also stringify for consistency
    // This ensures the schema works for both databases
    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  /**
   * Deserialize JSON data from storage
   */
  static deserializeJson(data: string | object | null): any {
    if (!data) return null;
    
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data; // Return as-is if not valid JSON
      }
    }
    
    return data;
  }

  /**
   * Convert array to comma-separated string for storage
   * (Used for originalVideoIds in ProcessedVideo)
   */
  static arrayToString(arr: string[]): string {
    if (!arr || !Array.isArray(arr)) return '';
    return arr.join(',');
  }

  /**
   * Convert comma-separated string back to array
   */
  static stringToArray(str: string): string[] {
    if (!str) return [];
    return str.split(',').filter(Boolean);
  }

  /**
   * Validate enum value
   */
  static validateEnum<T extends Record<string, string>>(
    value: string,
    enumObj: T,
    defaultValue?: string
  ): string {
    const validValues = Object.values(enumObj);
    if (validValues.includes(value)) {
      return value;
    }
    if (defaultValue && validValues.includes(defaultValue)) {
      return defaultValue;
    }
    throw new Error(`Invalid enum value: ${value}. Must be one of: ${validValues.join(', ')}`);
  }

  /**
   * Convert BigInt to number safely
   */
  static bigIntToNumber(value: bigint | number): number {
    if (typeof value === 'bigint') {
      // Check if the value is safe to convert to number
      if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
        return Number(value);
      }
      console.warn(`BigInt value ${value} exceeds safe integer range`);
      return Number(value); // May lose precision
    }
    return value;
  }

  /**
   * Convert number to BigInt
   */
  static numberToBigInt(value: number): bigint {
    return BigInt(Math.floor(value));
  }

  /**
   * Get current timestamp for database
   */
  static getCurrentTimestamp(): Date {
    return new Date();
  }

  /**
   * Format date for database query
   */
  static formatDate(date: Date | string): Date {
    if (typeof date === 'string') {
      return new Date(date);
    }
    return date;
  }

  /**
   * Check if database supports JSON columns
   */
  static supportsJsonColumns(): boolean {
    // For compatibility, we always use string storage
    return false;
  }

  /**
   * Get database type
   */
  static getDatabaseType(): 'sqlite' | 'postgresql' {
    return this.isPostgreSQL() ? 'postgresql' : 'sqlite';
  }

  /**
   * Handle case sensitivity in LIKE queries
   * SQLite is case-insensitive by default, PostgreSQL is not
   */
  static getCaseInsensitiveLike(field: string, value: string): object {
    if (this.isPostgreSQL()) {
      // PostgreSQL: use ILIKE for case-insensitive
      return {
        [field]: {
          contains: value,
          mode: 'insensitive'
        }
      };
    }
    // SQLite: regular contains is already case-insensitive
    return {
      [field]: {
        contains: value
      }
    };
  }

  /**
   * Handle database-specific transaction options
   */
  static getTransactionOptions(): any {
    if (this.isPostgreSQL()) {
      return {
        isolationLevel: 'ReadCommitted'
      };
    }
    // SQLite doesn't support all isolation levels
    return {};
  }

  /**
   * Check if database supports full-text search
   */
  static supportsFullTextSearch(): boolean {
    return this.isPostgreSQL();
  }

  /**
   * Build full-text search query
   */
  static buildFullTextSearch(fields: string[], searchTerm: string): any {
    if (!this.supportsFullTextSearch()) {
      // Fallback to OR conditions for SQLite
      return {
        OR: fields.map(field => ({
          [field]: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        }))
      };
    }

    // PostgreSQL full-text search
    return {
      OR: fields.map(field => ({
        [field]: {
          search: searchTerm
        }
      }))
    };
  }
}