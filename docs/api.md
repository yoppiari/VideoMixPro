# Video Mixer Pro API Documentation

## Base URL
```
Development: http://localhost:3000/api/v1
Production: https://api.videomixpro.com/v1
```

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Error Responses
All API responses follow this standard format:

### Success Response
```json
{
  "success": true,
  "data": {},
  "message": "Operation successful",
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "details": {}
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `500` - Internal Server Error

---

## Authentication Endpoints

### Register User
Creates a new user account with free license.

**Endpoint:** `POST /auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "credits": 10,
      "licenseType": "FREE",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Registration successful"
}
```

**Validation Rules:**
- `email`: Valid email format, unique
- `password`: Minimum 8 characters
- `firstName`: Minimum 2 characters
- `lastName`: Minimum 2 characters

### Login User
Authenticates user and returns JWT token.

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "credits": 50,
      "licenseType": "PREMIUM",
      "licenseExpiry": "2025-01-01T00:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Login successful"
}
```

### Refresh Token
Refreshes an existing JWT token.

**Endpoint:** `POST /auth/refresh`

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Token refreshed"
}
```

### Logout
Invalidates the current session (client-side token removal).

**Endpoint:** `POST /auth/logout`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

### Verify License
Verifies desktop application license (for desktop app integration).

**Endpoint:** `POST /auth/verify-license`

**Request Body:**
```json
{
  "licenseKey": "LICENSE_KEY_123",
  "machineId": "MACHINE_ID_456",
  "appVersion": "1.0.0"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "licenseType": "PREMIUM",
    "expiry": "2025-01-01T00:00:00.000Z",
    "features": ["basic_mixing", "auto_mode", "manual_mode", "metadata_embedding"],
    "maxProjects": 50,
    "maxCredits": 10000
  },
  "message": "License verified"
}
```

---

## User Management Endpoints

### Get User Profile
Retrieves current user's profile information.

**Endpoint:** `GET /users/profile`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "credits": 50,
    "licenseType": "PREMIUM",
    "licenseExpiry": "2025-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Update User Profile
Updates user's profile information.

**Endpoint:** `PUT /users/profile`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "firstName": "John Updated",
  "lastName": "Doe Updated"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "firstName": "John Updated",
    "lastName": "Doe Updated",
    "credits": 50,
    "licenseType": "PREMIUM",
    "licenseExpiry": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  },
  "message": "Profile updated successfully"
}
```

### Get User Credits
Retrieves current user's credit balance.

**Endpoint:** `GET /users/credits`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "credits": 50
  }
}
```

### Purchase Credits
Purchases additional credits for video processing.

**Endpoint:** `POST /users/credits/purchase`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "amount": 100,
  "paymentMethod": "stripe"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "credits": 150,
    "transaction": {
      "id": "txn_123",
      "amount": 100,
      "type": "PURCHASE",
      "description": "Credit purchase via stripe",
      "createdAt": "2024-01-15T10:40:00.000Z"
    }
  },
  "message": "Credits purchased successfully"
}
```

### Get Credit Transactions
Retrieves user's credit transaction history.

**Endpoint:** `GET /users/transactions`

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "txn_123",
      "amount": 100,
      "type": "PURCHASE",
      "description": "Credit purchase via stripe",
      "createdAt": "2024-01-15T10:40:00.000Z"
    },
    {
      "id": "txn_124",
      "amount": -20,
      "type": "USAGE",
      "description": "Video processing for project: Marketing Campaign",
      "createdAt": "2024-01-15T11:00:00.000Z"
    }
  ],
  "message": "Transactions retrieved successfully",
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

---

## Project Management Endpoints

### Get Projects
Retrieves user's projects with pagination.

**Endpoint:** `GET /projects`

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "proj_123",
      "name": "Marketing Campaign A",
      "description": "Product demo variations",
      "status": "DRAFT",
      "outputCount": 0,
      "settings": {
        "mixingMode": "AUTO",
        "outputFormat": "MP4",
        "quality": "HIGH",
        "metadata": {
          "static": {
            "campaign": "summer-2024"
          },
          "includeDynamic": true
        }
      },
      "createdAt": "2024-01-15T09:00:00.000Z",
      "updatedAt": "2024-01-15T09:00:00.000Z",
      "videoFiles": [
        {
          "id": "file_123",
          "originalName": "intro.mp4",
          "size": 5242880,
          "duration": 15.5
        }
      ],
      "videoGroups": [],
      "processingJobs": []
    }
  ],
  "message": "Projects retrieved successfully",
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "pages": 1
  }
}
```

### Get Single Project
Retrieves detailed information about a specific project.

**Endpoint:** `GET /projects/:id`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "proj_123",
    "name": "Marketing Campaign A",
    "description": "Product demo variations",
    "status": "DRAFT",
    "outputCount": 0,
    "settings": {
      "mixingMode": "MANUAL",
      "outputFormat": "MP4",
      "quality": "HIGH",
      "metadata": {
        "static": {
          "campaign": "summer-2024"
        },
        "includeDynamic": true
      }
    },
    "createdAt": "2024-01-15T09:00:00.000Z",
    "updatedAt": "2024-01-15T09:00:00.000Z",
    "videoFiles": [
      {
        "id": "file_123",
        "originalName": "intro.mp4",
        "filename": "1234567890_intro.mp4",
        "path": "/uploads/1234567890_intro.mp4",
        "size": 5242880,
        "duration": 15.5,
        "format": "mp4",
        "resolution": "1920x1080",
        "uploadedAt": "2024-01-15T09:15:00.000Z",
        "group": {
          "id": "group_123",
          "name": "Hook"
        }
      }
    ],
    "videoGroups": [
      {
        "id": "group_123",
        "name": "Hook",
        "order": 1,
        "createdAt": "2024-01-15T09:10:00.000Z"
      },
      {
        "id": "group_124",
        "name": "Content",
        "order": 2,
        "createdAt": "2024-01-15T09:10:00.000Z"
      }
    ],
    "processingJobs": []
  }
}
```

### Create Project
Creates a new video mixing project.

**Endpoint:** `POST /projects`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Marketing Campaign A",
  "description": "Product demo variations",
  "settings": {
    "mixingMode": "AUTO",
    "outputFormat": "MP4",
    "quality": "HIGH",
    "outputCount": 10,
    "metadata": {
      "static": {
        "campaign": "summer-2024",
        "client": "ACME Corp"
      },
      "includeDynamic": true,
      "fields": ["sourceFiles", "creationTime"]
    },
    "groups": [
      {
        "name": "Hook",
        "order": 1
      },
      {
        "name": "Content",
        "order": 2
      },
      {
        "name": "CTA",
        "order": 3
      }
    ]
  }
}
```

**Validation Rules:**
- `name`: 3-100 characters
- `settings.mixingMode`: "AUTO" | "MANUAL"
- `settings.outputFormat`: "MP4" | "MOV" | "AVI"
- `settings.quality`: "LOW" | "MEDIUM" | "HIGH" | "ULTRA"
- `settings.outputCount`: 1-1000

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "proj_123",
    "name": "Marketing Campaign A",
    "description": "Product demo variations",
    "status": "DRAFT",
    "outputCount": 0,
    "settings": {
      "mixingMode": "AUTO",
      "outputFormat": "MP4",
      "quality": "HIGH",
      "outputCount": 10,
      "metadata": {
        "static": {
          "campaign": "summer-2024",
          "client": "ACME Corp"
        },
        "includeDynamic": true,
        "fields": ["sourceFiles", "creationTime"]
      }
    },
    "createdAt": "2024-01-15T09:00:00.000Z",
    "updatedAt": "2024-01-15T09:00:00.000Z",
    "videoGroups": []
  },
  "message": "Project created successfully"
}
```

### Update Project
Updates an existing project (only if not processing).

**Endpoint:** `PUT /projects/:id`

**Headers:** `Authorization: Bearer <token>`

**Request Body:** (All fields optional)
```json
{
  "name": "Updated Campaign Name",
  "description": "Updated description",
  "settings": {
    "quality": "ULTRA",
    "outputCount": 20
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "proj_123",
    "name": "Updated Campaign Name",
    "description": "Updated description",
    "status": "DRAFT",
    "outputCount": 0,
    "settings": {
      "mixingMode": "AUTO",
      "outputFormat": "MP4",
      "quality": "ULTRA",
      "outputCount": 20,
      "metadata": {
        "static": {
          "campaign": "summer-2024"
        },
        "includeDynamic": true
      }
    },
    "updatedAt": "2024-01-15T09:30:00.000Z",
    "videoFiles": [],
    "videoGroups": []
  },
  "message": "Project updated successfully"
}
```

### Delete Project
Deletes a project (only if no active processing jobs).

**Endpoint:** `DELETE /projects/:id`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

### Create Video Group
Creates a new video group within a project.

**Endpoint:** `POST /projects/:id/groups`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Outro",
  "order": 4
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "group_125",
    "name": "Outro",
    "order": 4,
    "createdAt": "2024-01-15T10:00:00.000Z"
  },
  "message": "Group created successfully"
}
```

### Update Video Group
Updates an existing video group.

**Endpoint:** `PUT /projects/:id/groups/:groupId`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Updated Outro",
  "order": 3
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "group_125",
    "name": "Updated Outro",
    "order": 3,
    "createdAt": "2024-01-15T10:00:00.000Z"
  },
  "message": "Group updated successfully"
}
```

### Delete Video Group
Deletes a video group (only if empty).

**Endpoint:** `DELETE /projects/:id/groups/:groupId`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "message": "Group deleted successfully"
}
```

---

## Video Management Endpoints

### Upload Videos
Uploads video files to a project.

**Endpoint:** `POST /videos/upload`

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Form Data:**
- `videos`: File[] (Max 50 files, 500MB each)
- `projectId`: string (UUID)
- `groupId`: string (UUID, optional)

**Response (201):**
```json
{
  "success": true,
  "data": {
    "uploaded": [
      {
        "id": "file_123",
        "originalName": "intro.mp4",
        "filename": "1234567890_intro.mp4",
        "path": "/uploads/1234567890_intro.mp4",
        "size": 5242880,
        "duration": 15.5,
        "format": "mp4",
        "resolution": "1920x1080",
        "projectId": "proj_123",
        "groupId": "group_123",
        "uploadedAt": "2024-01-15T10:15:00.000Z"
      }
    ],
    "errors": [
      {
        "filename": "corrupt_video.mp4",
        "error": "Failed to process video file"
      }
    ]
  },
  "message": "Video upload completed"
}
```

### Get Project Videos
Retrieves all videos for a specific project.

**Endpoint:** `GET /videos/project/:projectId`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "file_123",
      "originalName": "intro.mp4",
      "filename": "1234567890_intro.mp4",
      "path": "/uploads/1234567890_intro.mp4",
      "size": 5242880,
      "duration": 15.5,
      "format": "mp4",
      "resolution": "1920x1080",
      "projectId": "proj_123",
      "groupId": "group_123",
      "uploadedAt": "2024-01-15T10:15:00.000Z",
      "group": {
        "id": "group_123",
        "name": "Hook",
        "order": 1
      }
    }
  ]
}
```

### Delete Video
Deletes a video file from a project.

**Endpoint:** `DELETE /videos/:id`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "message": "Video deleted successfully"
}
```

### Get Video Metadata
Retrieves detailed metadata for a specific video.

**Endpoint:** `GET /videos/:id/metadata`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "duration": 15.5,
    "format": "mp4",
    "resolution": "1920x1080",
    "bitrate": 2000000,
    "fps": 30,
    "codec": "h264",
    "size": 5242880,
    "audioCodec": "aac",
    "audioChannels": 2,
    "audioSampleRate": 44100
  }
}
```

---

## Video Processing Endpoints

### Start Processing
Initiates video processing for a project.

**Endpoint:** `POST /processing/start/:projectId`

**Headers:** `Authorization: Bearer <token>`

**Response (202):**
```json
{
  "success": true,
  "data": {
    "jobId": "job_123",
    "creditsDeducted": 20,
    "estimatedDuration": "15 minutes"
  },
  "message": "Processing started successfully"
}
```

**Error Response (402):**
```json
{
  "success": false,
  "error": "Insufficient credits. Required: 20, Available: 15"
}
```

### Get Job Status
Retrieves current status of a processing job.

**Endpoint:** `GET /processing/status/:jobId`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "job_123",
    "projectId": "proj_123",
    "status": "PROCESSING",
    "progress": 45,
    "startedAt": "2024-01-15T11:00:00.000Z",
    "completedAt": null,
    "errorMessage": null,
    "createdAt": "2024-01-15T10:55:00.000Z",
    "project": {
      "id": "proj_123",
      "name": "Marketing Campaign A"
    },
    "outputFiles": []
  }
}
```

**Job Status Values:**
- `PENDING`: Job queued but not started
- `PROCESSING`: Currently processing
- `COMPLETED`: Successfully completed
- `FAILED`: Processing failed
- `CANCELLED`: Job was cancelled

### Cancel Processing Job
Cancels an active processing job.

**Endpoint:** `POST /processing/cancel/:jobId`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "message": "Job cancelled successfully"
}
```

### Get User Jobs
Retrieves all processing jobs for the current user.

**Endpoint:** `GET /processing/jobs`

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "job_123",
      "status": "COMPLETED",
      "progress": 100,
      "startedAt": "2024-01-15T11:00:00.000Z",
      "completedAt": "2024-01-15T11:15:00.000Z",
      "createdAt": "2024-01-15T10:55:00.000Z",
      "project": {
        "id": "proj_123",
        "name": "Marketing Campaign A"
      },
      "outputFiles": [
        {
          "id": "output_123",
          "filename": "auto_mix_1_1234567890.mp4",
          "size": 15728640
        }
      ]
    }
  ],
  "message": "Jobs retrieved successfully",
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "pages": 1
  }
}
```

### Get Job Outputs
Retrieves all output files for a completed job.

**Endpoint:** `GET /processing/outputs/:jobId`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "output_123",
      "filename": "auto_mix_1_1234567890.mp4",
      "path": "/outputs/auto_mix_1_1234567890.mp4",
      "size": 15728640,
      "duration": 45.2,
      "metadata": {
        "campaign": "summer-2024",
        "source_files": "intro.mp4, content.mp4, outro.mp4",
        "creation_time": "2024-01-15T11:15:00.000Z",
        "creator": "VideoMixPro",
        "format": "mp4",
        "resolution": "1920x1080"
      },
      "sourceFiles": ["file_123", "file_124", "file_125"],
      "createdAt": "2024-01-15T11:15:00.000Z"
    }
  ]
}
```

### Download Output File
Downloads a specific output file.

**Endpoint:** `GET /processing/download/:outputId`

**Headers:** `Authorization: Bearer <token>`

**Response:** Binary file with appropriate headers:
- `Content-Disposition: attachment; filename="auto_mix_1_1234567890.mp4"`
- `Content-Type: video/mp4`

---

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- **Authentication endpoints**: 5 requests per minute per IP
- **File upload**: 10 uploads per hour per user
- **Processing**: 3 concurrent jobs per user
- **General API**: 1000 requests per hour per user

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642248000
```

## Webhooks (Future)

For real-time updates on processing status:

**Endpoint Configuration:** `POST /webhooks/configure`

**Supported Events:**
- `job.started`
- `job.progress`
- `job.completed`
- `job.failed`

## SDKs

Official SDKs available for:
- JavaScript/TypeScript
- Python
- Go
- Desktop Application (Electron)