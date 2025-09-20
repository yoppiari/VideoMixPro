import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../layout/DashboardLayout';
import apiClient from '../../utils/api/client';

interface ProjectFormData {
  name: string;
  description: string;
  settings: {
    mixingMode: 'AUTO' | 'MANUAL';
    outputFormat: 'MP4' | 'MOV' | 'AVI';
    quality: 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';
    outputCount: number;
    metadata: {
      static: Record<string, string>;
      includeDynamic: boolean;
      fields: string[];
    };
    groups: Array<{
      name: string;
      order: number;
    }>;
  };
}

interface StaticMetadataField {
  key: string;
  value: string;
}

const ProjectCreate: React.FC = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string>('');

  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    description: '',
    settings: {
      mixingMode: 'AUTO',
      outputFormat: 'MP4',
      quality: 'MEDIUM',
      outputCount: 10,
      metadata: {
        static: {},
        includeDynamic: true,
        fields: []
      },
      groups: []
    }
  });

  // Static metadata fields state
  const [staticFields, setStaticFields] = useState<StaticMetadataField[]>([
    { key: '', value: '' }
  ]);

  // Dynamic metadata fields state
  const [dynamicFields, setDynamicFields] = useState<string[]>(['']);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => {
        const parentObj = prev[parent as keyof typeof prev];
        if (parentObj && typeof parentObj === 'object' && !Array.isArray(parentObj)) {
          return {
            ...prev,
            [parent]: {
              ...(parentObj as object),
              [child]: type === 'number' ? parseInt(value) || 0 : value
            }
          };
        }
        return prev;
      });
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' ? parseInt(value) || 0 : value
      }));
    }

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        metadata: {
          ...prev.settings.metadata,
          [name]: checked
        }
      }
    }));
  };

  // Static metadata handlers
  const addStaticField = () => {
    setStaticFields([...staticFields, { key: '', value: '' }]);
  };

  const removeStaticField = (index: number) => {
    setStaticFields(staticFields.filter((_, i) => i !== index));
  };

  const updateStaticField = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...staticFields];
    updated[index][field] = value;
    setStaticFields(updated);
  };

  // Dynamic metadata handlers
  const addDynamicField = () => {
    setDynamicFields([...dynamicFields, '']);
  };

  const removeDynamicField = (index: number) => {
    setDynamicFields(dynamicFields.filter((_, i) => i !== index));
  };

  const updateDynamicField = (index: number, value: string) => {
    const updated = [...dynamicFields];
    updated[index] = value;
    setDynamicFields(updated);
  };


  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required';
    } else if (formData.name.length < 3) {
      newErrors.name = 'Project name must be at least 3 characters';
    }

    if (formData.settings.outputCount < 1) {
      newErrors.outputCount = 'Output count must be at least 1';
    } else if (formData.settings.outputCount > 1000) {
      newErrors.outputCount = 'Output count cannot exceed 1000';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare metadata
      const staticMetadata = staticFields
        .filter(field => field.key.trim() && field.value.trim())
        .reduce((acc, field) => ({ ...acc, [field.key]: field.value }), {});

      const dynamicMetadataFields = dynamicFields.filter(field => field.trim());

      // Prepare final form data
      const projectData = {
        ...formData,
        settings: {
          ...formData.settings,
          metadata: {
            static: staticMetadata,
            includeDynamic: formData.settings.metadata.includeDynamic,
            fields: dynamicMetadataFields
          },
          groups: []
        }
      };

      // Debug logging
      console.log('Submitting project data:', projectData);

      const response = await apiClient.createProject(projectData);

      // Debug logging
      console.log('API Response:', response);

      if (response.success) {
        console.log('Project created successfully, redirecting...');
        setSuccessMessage('Project created successfully! Redirecting...');
        setErrors({});
        // Add a small delay to ensure user sees success
        setTimeout(() => {
          navigate('/projects');
        }, 1000);
      } else {
        console.error('Project creation failed:', response.error);
        setErrors({ submit: response.error || 'Failed to create project' });
        // Scroll to top to show error message
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error: any) {
      console.error('Project creation error:', error);
      console.error('Error response:', error.response?.data);

      // Extract error message from response if available
      const errorMessage = error.response?.data?.error ||
                          error.response?.data?.message ||
                          error.message ||
                          'An unexpected error occurred';

      setErrors({ submit: errorMessage });
      // Scroll to top to show error message
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/projects');
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create New Project</h1>
          <p className="text-gray-600">
            Set up your video mixing project with custom settings and configurations.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Success Display */}
          {successMessage && (
            <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-700">{successMessage}</p>
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {errors.submit && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{errors.submit}</p>
                </div>
              </div>
            </div>
          )}

          {/* Basic Information */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Project Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                    errors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Enter project name"
                />
                {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleInputChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe your project (optional)"
                />
              </div>
            </div>
          </div>

          {/* Metadata Settings */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Metadata Settings</h3>

            {/* Static Metadata */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-md font-medium text-gray-800">Static Metadata</h4>
                <button
                  type="button"
                  onClick={addStaticField}
                  className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                >
                  Add Field
                </button>
              </div>

              {staticFields.map((field, index) => (
                <div key={index} className="flex items-center space-x-2 mb-2">
                  <input
                    type="text"
                    placeholder="Key"
                    value={field.key}
                    onChange={(e) => updateStaticField(index, 'key', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    value={field.value}
                    onChange={(e) => updateStaticField(index, 'value', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => removeStaticField(index)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {/* Dynamic Metadata */}
            <div className="mb-6">
              <div className="flex items-center mb-3">
                <input
                  type="checkbox"
                  id="includeDynamic"
                  name="includeDynamic"
                  checked={formData.settings.metadata.includeDynamic}
                  onChange={handleCheckboxChange}
                  className="mr-2"
                />
                <label htmlFor="includeDynamic" className="text-md font-medium text-gray-800">
                  Include Dynamic Metadata
                </label>
              </div>

              {formData.settings.metadata.includeDynamic && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-700">Dynamic Fields</h4>
                    <button
                      type="button"
                      onClick={addDynamicField}
                      className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                    >
                      Add Field
                    </button>
                  </div>

                  {dynamicFields.map((field, index) => (
                    <div key={index} className="flex items-center space-x-2 mb-2">
                      <input
                        type="text"
                        placeholder="Field name"
                        value={field}
                        onChange={(e) => updateDynamicField(index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                      />
                      <button
                        type="button"
                        onClick={() => removeDynamicField(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default ProjectCreate;