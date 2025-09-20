import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import {
  EnvelopeIcon,
  EyeIcon,
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
  DocumentDuplicateIcon,
  PlusIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const EmailTemplateEditor: React.FC = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [editorSubject, setEditorSubject] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const editorRef = useRef<any>(null);

  // Template categories
  const categories = [
    'Authentication',
    'Transaction',
    'Notification',
    'Marketing',
    'System'
  ];

  // Default template structure
  const defaultTemplates = {
    welcome: `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .footer { padding: 20px; text-align: center; color: #666; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to VideoMixPro!</h1>
        </div>
        <div class="content">
            <p>Hi {{userName}},</p>
            <p>Welcome to VideoMixPro! We're excited to have you on board.</p>
            <p>Your account has been successfully created with the email: {{userEmail}}</p>
            <p>Get started by creating your first video project:</p>
            <p style="text-align: center;">
                <a href="{{loginUrl}}" class="button">Go to Dashboard</a>
            </p>
        </div>
        <div class="footer">
            <p>&copy; 2024 VideoMixPro. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`,
    payment: `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #10B981; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .footer { padding: 20px; text-align: center; color: #666; }
        .invoice-details { background: white; padding: 15px; margin: 15px 0; border: 1px solid #ddd; }
        .amount { font-size: 24px; color: #10B981; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Payment Confirmation</h1>
        </div>
        <div class="content">
            <p>Hi {{userName}},</p>
            <p>Your payment has been successfully processed!</p>
            <div class="invoice-details">
                <p><strong>Invoice Number:</strong> {{invoiceNumber}}</p>
                <p><strong>Date:</strong> {{paymentDate}}</p>
                <p><strong>Amount:</strong> <span class="amount">{{amount}}</span></p>
                <p><strong>Credits Added:</strong> {{credits}}</p>
            </div>
            <p>Your receipt has been attached to this email.</p>
        </div>
        <div class="footer">
            <p>&copy; 2024 VideoMixPro. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/admin/email-templates');
      setTemplates(response.data);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to fetch email templates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTemplateSelect = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setEditorContent(template.body);
    setEditorSubject(template.subject);

    // Extract variables from template
    const variables = extractVariables(template.body);
    const varObj: Record<string, string> = {};
    variables.forEach(v => {
      varObj[v] = '';
    });
    setTemplateVariables(varObj);

    setIsPreviewMode(false);
  };

  const extractVariables = (content: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();
    let match;
    while ((match = regex.exec(content)) !== null) {
      variables.add(match[1]);
    }
    return Array.from(variables);
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;

    setIsSaving(true);
    try {
      const response = await api.put(`/admin/email-templates/${selectedTemplate.id}`, {
        subject: editorSubject,
        body: editorContent,
        variables: extractVariables(editorContent)
      });

      toast.success('Template saved successfully');

      // Update local state
      const updatedTemplates = templates.map(t =>
        t.id === selectedTemplate.id ? response.data : t
      );
      setTemplates(updatedTemplates);
      setSelectedTemplate(response.data);
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!editorContent) return;

    try {
      const response = await api.post('/admin/email-templates/preview', {
        template: editorContent,
        variables: templateVariables
      });

      setPreviewHtml(response.data.html);
      setIsPreviewMode(true);
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Failed to generate preview');
    }
  };

  const handleSendTest = async () => {
    if (!testEmail || !selectedTemplate) return;

    setIsSendingTest(true);
    try {
      await api.post('/admin/email-templates/send-test', {
        templateId: selectedTemplate.id,
        email: testEmail,
        variables: templateVariables
      });

      toast.success(`Test email sent to ${testEmail}`);
      setTestEmail('');
    } catch (error) {
      console.error('Error sending test email:', error);
      toast.error('Failed to send test email');
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleCreateTemplate = async () => {
    const name = prompt('Enter template name:');
    if (!name) return;

    const category = prompt('Enter category (Authentication/Transaction/Notification/Marketing/System):');
    if (!category) return;

    try {
      const response = await api.post('/admin/email-templates', {
        name,
        subject: 'New Template Subject',
        body: defaultTemplates.welcome,
        category,
        variables: ['userName', 'userEmail', 'loginUrl']
      });

      toast.success('Template created successfully');
      setTemplates([...templates, response.data]);
      handleTemplateSelect(response.data);
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Failed to create template');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;

    try {
      await api.delete(`/admin/email-templates/${templateId}`);
      toast.success('Template deleted successfully');

      setTemplates(templates.filter(t => t.id !== templateId));
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null);
        setEditorContent('');
        setEditorSubject('');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  const handleDuplicateTemplate = async () => {
    if (!selectedTemplate) return;

    const name = prompt('Enter name for duplicated template:');
    if (!name) return;

    try {
      const response = await api.post('/admin/email-templates', {
        name,
        subject: selectedTemplate.subject,
        body: selectedTemplate.body,
        category: selectedTemplate.category,
        variables: selectedTemplate.variables
      });

      toast.success('Template duplicated successfully');
      setTemplates([...templates, response.data]);
    } catch (error) {
      console.error('Error duplicating template:', error);
      toast.error('Failed to duplicate template');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        {/* Sidebar - Template List */}
        <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Email Templates</h2>
              <button
                onClick={handleCreateTemplate}
                className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={fetchTemplates}
              className="w-full flex items-center justify-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              <ArrowPathIcon className="w-4 h-4 mr-2" />
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="p-4 text-center">
              <ArrowPathIcon className="w-8 h-8 mx-auto animate-spin text-gray-400" />
              <p className="mt-2 text-gray-500">Loading templates...</p>
            </div>
          ) : (
            <div className="p-4">
              {categories.map(category => {
                const categoryTemplates = templates.filter(t => t.category === category);
                if (categoryTemplates.length === 0) return null;

                return (
                  <div key={category} className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                      {category}
                    </h3>
                    <div className="space-y-2">
                      {categoryTemplates.map(template => (
                        <div
                          key={template.id}
                          onClick={() => handleTemplateSelect(template)}
                          className={`p-3 rounded-lg cursor-pointer transition ${
                            selectedTemplate?.id === template.id
                              ? 'bg-indigo-100 border border-indigo-300'
                              : 'bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{template.name}</h4>
                              <p className="text-sm text-gray-500 mt-1">
                                {template.variables.length} variables
                              </p>
                            </div>
                            {template.isActive ? (
                              <CheckIcon className="w-4 h-4 text-green-500" />
                            ) : (
                              <XMarkIcon className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Main Content - Editor */}
        <div className="flex-1 flex flex-col">
          {selectedTemplate ? (
            <>
              {/* Toolbar */}
              <div className="bg-white border-b border-gray-200 p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h1 className="text-xl font-semibold">{selectedTemplate.name}</h1>
                    <p className="text-sm text-gray-500 mt-1">
                      Last updated: {new Date(selectedTemplate.updatedAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={handleDuplicateTemplate}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center"
                    >
                      <DocumentDuplicateIcon className="w-4 h-4 mr-2" />
                      Duplicate
                    </button>

                    <button
                      onClick={handlePreview}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                    >
                      <EyeIcon className="w-4 h-4 mr-2" />
                      Preview
                    </button>

                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                    >
                      {isSaving ? (
                        <>
                          <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <CheckIcon className="w-4 h-4 mr-2" />
                          Save
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleDeleteTemplate(selectedTemplate.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Subject Line Editor */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subject Line
                  </label>
                  <input
                    type="text"
                    value={editorSubject}
                    onChange={(e) => setEditorSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter email subject..."
                  />
                </div>
              </div>

              {/* Editor/Preview Area */}
              <div className="flex-1 flex">
                <div className={`${isPreviewMode ? 'w-1/2' : 'flex-1'} flex flex-col`}>
                  <div className="bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
                    HTML Editor
                  </div>
                  <div className="flex-1">
                    <Editor
                      height="100%"
                      defaultLanguage="html"
                      value={editorContent}
                      onChange={(value) => setEditorContent(value || '')}
                      theme="vs-light"
                      options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: 'on',
                        automaticLayout: true,
                        formatOnPaste: true,
                        formatOnType: true
                      }}
                      onMount={(editor) => {
                        editorRef.current = editor;
                      }}
                    />
                  </div>
                </div>

                {isPreviewMode && (
                  <div className="w-1/2 flex flex-col border-l border-gray-200">
                    <div className="bg-gray-100 px-4 py-2 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Preview</span>
                      <button
                        onClick={() => setIsPreviewMode(false)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-auto bg-white p-4">
                      <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Variables & Test Email Section */}
              <div className="bg-white border-t border-gray-200 p-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Template Variables */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Template Variables</h3>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {Object.keys(templateVariables).map(variable => (
                        <div key={variable} className="flex items-center space-x-2">
                          <span className="text-sm text-gray-600 w-32">{`{{${variable}}}`}</span>
                          <input
                            type="text"
                            value={templateVariables[variable]}
                            onChange={(e) => setTemplateVariables({
                              ...templateVariables,
                              [variable]: e.target.value
                            })}
                            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                            placeholder={`Enter ${variable}...`}
                          />
                        </div>
                      ))}
                      {Object.keys(templateVariables).length === 0 && (
                        <p className="text-sm text-gray-500">No variables in template</p>
                      )}
                    </div>
                  </div>

                  {/* Send Test Email */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Send Test Email</h3>
                    <div className="flex space-x-2">
                      <input
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Enter test email address..."
                      />
                      <button
                        onClick={handleSendTest}
                        disabled={isSendingTest || !testEmail}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center"
                      >
                        {isSendingTest ? (
                          <ArrowPathIcon className="w-5 h-5 animate-spin" />
                        ) : (
                          <EnvelopeIcon className="w-5 h-5" />
                        )}
                        <span className="ml-2">Send</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <EnvelopeIcon className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <h2 className="text-xl font-medium text-gray-900 mb-2">
                  Select a Template
                </h2>
                <p className="text-gray-500 mb-4">
                  Choose a template from the sidebar to start editing
                </p>
                <button
                  onClick={handleCreateTemplate}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center mx-auto"
                >
                  <PlusIcon className="w-5 h-5 mr-2" />
                  Create New Template
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailTemplateEditor;