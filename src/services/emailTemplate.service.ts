import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';
import logger from '@/utils/logger';

export interface EmailTemplateData {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    credits: number;
    licenseType: string;
    createdAt: Date;
  };
  payment?: {
    id: string;
    receiptNumber: string;
    amount: number;
    credits: number;
    status: string;
    paymentMethod: string;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
  };
  stats?: {
    projectsThisMonth: number;
    videosProcessed: number;
    creditsUsed: number;
    averageCredits: number;
  };
  resetUrl?: string;
  frontendUrl?: string;
  requestTime?: Date;
  ipAddress?: string;
  [key: string]: any;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  category: 'payment' | 'user' | 'system' | 'marketing';
  description: string;
  variables: string[];
  htmlContent: string;
  textContent?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type EmailTemplateType =
  | 'payment_created'
  | 'payment_confirmed'
  | 'payment_failed'
  | 'receipt_delivery'
  | 'credits_low'
  | 'welcome'
  | 'password_reset';

class EmailTemplateService {
  private templatesPath: string;
  private compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor() {
    this.templatesPath = path.join(process.cwd(), 'src', 'templates', 'emails');
    this.registerHelpers();
  }

  private registerHelpers(): void {
    // Currency formatter helper
    Handlebars.registerHelper('formatCurrency', (amount: number) => {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
      }).format(amount);
    });

    // Date formatter helper
    Handlebars.registerHelper('formatDate', (date: Date | string) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return dateObj.toLocaleString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    });

    // Conditional helper
    Handlebars.registerHelper('if', function(conditional, options) {
      if (conditional) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });

    // Comparison helper
    Handlebars.registerHelper('eq', function(a, b) {
      return a === b;
    });

    // Math helpers
    Handlebars.registerHelper('add', function(a: number, b: number) {
      return a + b;
    });

    Handlebars.registerHelper('multiply', function(a: number, b: number) {
      return a * b;
    });

    // Array helpers
    Handlebars.registerHelper('each', function(context, options) {
      let ret = '';
      for (let i = 0, j = context.length; i < j; i++) {
        ret = ret + options.fn(context[i]);
      }
      return ret;
    });
  }

  /**
   * Load and compile email template
   */
  private async loadTemplate(templateName: string): Promise<HandlebarsTemplateDelegate> {
    try {
      // Check if template is already compiled
      if (this.compiledTemplates.has(templateName)) {
        return this.compiledTemplates.get(templateName)!;
      }

      const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const compiledTemplate = Handlebars.compile(templateContent);

      // Cache compiled template
      this.compiledTemplates.set(templateName, compiledTemplate);

      return compiledTemplate;
    } catch (error) {
      logger.error(`Failed to load email template ${templateName}:`, error);
      throw new Error(`Email template not found: ${templateName}`);
    }
  }

  /**
   * Render email template with data
   */
  async renderTemplate(templateType: EmailTemplateType, data: EmailTemplateData): Promise<{
    html: string;
    subject: string;
  }> {
    try {
      const template = await this.loadTemplate(templateType);

      // Add default values
      const templateData = {
        ...data,
        frontendUrl: data.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3002',
      };

      const html = template(templateData);
      const subject = this.getSubjectForTemplate(templateType, templateData);

      return { html, subject };
    } catch (error) {
      logger.error(`Failed to render email template ${templateType}:`, error);
      throw error;
    }
  }

  /**
   * Get subject line for template type
   */
  private getSubjectForTemplate(templateType: EmailTemplateType, data: EmailTemplateData): string {
    const subjects: Record<EmailTemplateType, string> = {
      payment_created: `Payment Created - Invoice ${data.payment?.receiptNumber} - VideoMixPro`,
      payment_confirmed: `Payment Confirmed - ${data.payment?.credits} Credits Added - VideoMixPro`,
      payment_failed: `Payment Issue - Invoice ${data.payment?.receiptNumber} - VideoMixPro`,
      receipt_delivery: `Receipt - ${data.payment?.receiptNumber} - VideoMixPro`,
      credits_low: `⚡ Low Credits Alert - Only ${data.user.credits} Credits Remaining - VideoMixPro`,
      welcome: `Welcome to VideoMixPro - Let's Get Started!`,
      password_reset: `Reset Your VideoMixPro Password`,
    };

    return subjects[templateType];
  }

  /**
   * Get all available templates
   */
  async getAvailableTemplates(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.templatesPath);
      return files
        .filter(file => file.endsWith('.hbs'))
        .map(file => file.replace('.hbs', ''));
    } catch (error) {
      logger.error('Failed to read templates directory:', error);
      return [];
    }
  }

  /**
   * Validate template data
   */
  validateTemplateData(templateType: EmailTemplateType, data: EmailTemplateData): boolean {
    const requiredFields: Record<EmailTemplateType, string[]> = {
      payment_created: ['user', 'payment'],
      payment_confirmed: ['user', 'payment'],
      payment_failed: ['user', 'payment'],
      receipt_delivery: ['user', 'payment'],
      credits_low: ['user', 'stats'],
      welcome: ['user'],
      password_reset: ['user', 'resetUrl'],
    };

    const required = requiredFields[templateType];

    for (const field of required) {
      if (!data[field]) {
        logger.warn(`Missing required field '${field}' for template '${templateType}'`);
        return false;
      }
    }

    return true;
  }

  /**
   * Create custom template
   */
  async createCustomTemplate(
    name: string,
    htmlContent: string,
    subject: string,
    category: EmailTemplate['category'],
    description: string
  ): Promise<void> {
    try {
      const templatePath = path.join(this.templatesPath, `custom_${name}.hbs`);
      await fs.writeFile(templatePath, htmlContent, 'utf-8');

      // Clear cache for this template
      this.compiledTemplates.delete(`custom_${name}`);

      logger.info(`Custom email template created: ${name}`);
    } catch (error) {
      logger.error(`Failed to create custom template ${name}:`, error);
      throw error;
    }
  }

  /**
   * Update existing template
   */
  async updateTemplate(templateName: string, htmlContent: string): Promise<void> {
    try {
      const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
      await fs.writeFile(templatePath, htmlContent, 'utf-8');

      // Clear cache for this template
      this.compiledTemplates.delete(templateName);

      logger.info(`Email template updated: ${templateName}`);
    } catch (error) {
      logger.error(`Failed to update template ${templateName}:`, error);
      throw error;
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(templateName: string): Promise<void> {
    try {
      const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
      await fs.unlink(templatePath);

      // Clear cache for this template
      this.compiledTemplates.delete(templateName);

      logger.info(`Email template deleted: ${templateName}`);
    } catch (error) {
      logger.error(`Failed to delete template ${templateName}:`, error);
      throw error;
    }
  }

  /**
   * Get template content for editing
   */
  async getTemplateContent(templateName: string): Promise<string> {
    try {
      const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
      return await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      logger.error(`Failed to get template content ${templateName}:`, error);
      throw error;
    }
  }

  /**
   * Preview template with sample data
   */
  async previewTemplate(templateType: EmailTemplateType, customData?: Partial<EmailTemplateData>): Promise<{
    html: string;
    subject: string;
  }> {
    const sampleData: EmailTemplateData = {
      user: {
        id: 'user_sample_123',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        credits: 50,
        licenseType: 'PREMIUM',
        createdAt: new Date(),
      },
      payment: {
        id: 'payment_sample_123',
        receiptNumber: 'INV-2024-01-000123',
        amount: 500000,
        credits: 100,
        status: 'PAID',
        paymentMethod: 'Bank Transfer',
        notes: 'Sample payment for testing',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      stats: {
        projectsThisMonth: 5,
        videosProcessed: 12,
        creditsUsed: 35,
        averageCredits: 7,
      },
      resetUrl: 'https://videomixpro.com/reset-password?token=sample_token',
      frontendUrl: 'http://localhost:3002',
      requestTime: new Date(),
      ipAddress: '192.168.1.1',
      ...customData,
    };

    return this.renderTemplate(templateType, sampleData);
  }

  /**
   * Get template analytics
   */
  getTemplateAnalytics(): {
    totalTemplates: number;
    cachedTemplates: number;
    availableTypes: EmailTemplateType[];
  } {
    return {
      totalTemplates: this.compiledTemplates.size,
      cachedTemplates: this.compiledTemplates.size,
      availableTypes: [
        'payment_created',
        'payment_confirmed',
        'payment_failed',
        'receipt_delivery',
        'credits_low',
        'welcome',
        'password_reset',
      ],
    };
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.compiledTemplates.clear();
    logger.info('Email template cache cleared');
  }

  /**
   * Warm up cache by preloading all templates
   */
  async warmUpCache(): Promise<void> {
    try {
      const templates = await this.getAvailableTemplates();
      const loadPromises = templates.map(template => this.loadTemplate(template));
      await Promise.all(loadPromises);
      logger.info(`Email template cache warmed up with ${templates.length} templates`);
    } catch (error) {
      logger.error('Failed to warm up email template cache:', error);
    }
  }
}

export const emailTemplateService = new EmailTemplateService();
export default emailTemplateService;