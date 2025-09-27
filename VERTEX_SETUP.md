# Vertex AI Setup Guide

This guide explains how to set up Vertex AI integration for the Data Quality Agent.

## Current Status

The application is currently running in **mock mode** and works fully without any Vertex AI credentials. All API endpoints return realistic mock data for testing the UI and workflow.

## Mock Mode vs Production Mode

### Mock Mode (Current)
- No credentials required
- Returns realistic static responses
- Perfect for UI development and testing
- Enabled by default when credentials are missing

### Production Mode (Future)
- Requires Google Cloud Project and Service Account
- Makes real API calls to Vertex AI Gemini
- Provides intelligent column mapping and insights generation

## Setting Up Production Mode

When you're ready to enable real Vertex AI integration:

### 1. Google Cloud Setup

1. Create or select a Google Cloud Project
2. Enable the Vertex AI API
3. Create a Service Account with Vertex AI permissions
4. Download the service account key JSON file

### 2. Environment Variables

Copy `.env.example` to `.env.local` and configure:

\`\`\`bash
# Your Google Cloud Project ID
GCP_PROJECT=your-project-id

# Base64 encode your service account key
# Run: base64 -i path/to/service-account-key.json
GCP_SERVICE_ACCOUNT_KEY=your-base64-encoded-key

# Optional: specify region (defaults to us-central1)
VERTEX_LOCATION=us-central1

# Set to false to enable real API calls
MOCK_MODE=false
\`\`\`

### 3. Service Account Permissions

Your service account needs these IAM roles:
- `roles/aiplatform.user`
- `roles/ml.developer`

### 4. Implementation Notes

The Vertex AI client (`lib/vertex-client.ts`) is designed to:

- **Column Identification**: Use Gemini to intelligently map CSV columns to required fields (product_id, customer_id, price)
- **Insight Generation**: Convert technical analysis results into human-friendly insights
- **SQL Generation**: Generate optimized SQL queries for data quality checks

### 5. Testing the Integration

1. Set your environment variables
2. Set `MOCK_MODE=false`
3. Restart your development server
4. The application will attempt real Vertex AI calls

## Architecture

\`\`\`
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   UI Components │───▶│ API Endpoints    │───▶│ Vertex Client   │
│                 │    │                  │    │                 │
│ - File Upload   │    │ - /api/validate  │    │ - Column Mapping│
│ - Progress UI   │    │ - /api/run/*     │    │ - Insight Gen   │
│ - Results View  │    │ - /api/report    │    │ - SQL Generation│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │ Vertex AI       │
                                               │ Gemini Flash    │
                                               └─────────────────┘
\`\`\`

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify service account key is correctly base64 encoded
   - Check that the service account has proper permissions
   - Ensure GCP_PROJECT matches your actual project ID

2. **API Quota Exceeded**
   - Check your Vertex AI quotas in Google Cloud Console
   - Consider implementing rate limiting

3. **Network Issues**
   - Verify your deployment environment can reach Google APIs
   - Check firewall rules if running in restricted environments

### Debug Mode

Enable debug logging by setting:
\`\`\`bash
NODE_ENV=development
\`\`\`

This will log all Vertex AI requests and responses for troubleshooting.

## Cost Considerations

- Vertex AI Gemini charges per token
- Column identification uses ~100-500 tokens per file
- Insight generation uses ~200-1000 tokens per analysis
- Estimate: $0.01-0.05 per data quality analysis

## Security Notes

- Never commit service account keys to version control
- Use environment variables or secret management systems
- Consider using Workload Identity in production deployments
- Rotate service account keys regularly
