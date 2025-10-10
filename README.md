# Azure SMB File Browser 🗂️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Azure](https://img.shields.io/badge/Azure-Storage-blue.svg)](https://azure.microsoft.com/en-us/services/storage/)

A modern, responsive web application that allows users to browse and download files from Azure Storage SMB/File Share through an intuitive web interface. Built with Node.js and Express, featuring file previews, authentication integration, and enterprise-ready deployment.

## 🚀 Live Demo

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fclipper-digital%2Fazure-smb-file-browser%2Fmain%2Fazuredeploy.json)

*Deploy to your own Azure App Service to see it in action!*

## 📸 Screenshots

### Main Interface
- **File Browser**: Clean, responsive interface with list/grid views
- **Breadcrumb Navigation**: Easy navigation through folder hierarchies  
- **File Actions**: Preview, download, and info buttons for each file
- **Real-time Status**: Connection indicator and item counts

### File Previews
- **PDF Viewer**: Embedded PDF viewing with fallback options
- **Image Gallery**: High-quality image previews
- **Text Files**: Syntax-highlighted code and document previews
- **Media Player**: Built-in video and audio players

*Screenshots coming soon - deploy your own instance to see the interface!*

## Features

- **File Browsing**: Navigate through directories in your Azure File Share
- **Configurable Root Folder**: Start browsing from a specific subfolder instead of the file share root
- **File Download**: Download individual files directly from the web interface
- **File Information**: View detailed file properties including size, modification date, and content type
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Security**: Built-in authentication, rate limiting, and input validation
- **Real-time Status**: Connection status indicator for Azure Storage
- **Multiple Views**: Switch between list and grid view modes

## Prerequisites

- Node.js 18+ 
- Azure Storage Account with File Share configured
- Azure App Service (for deployment)

## 🏁 Quick Start

```bash
# Clone the repository
git clone https://github.com/clipper-digital/azure-smb-file-browser.git
cd azure-smb-file-browser

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your Azure Storage credentials

# Start the development server
npm start

# Open http://localhost:3000
```

## Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd AzureSMBViewer
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Azure Storage credentials:
   ```
   AZURE_STORAGE_ACCOUNT_NAME=your_storage_account_name
   AZURE_STORAGE_ACCOUNT_KEY=your_storage_account_key
   AZURE_STORAGE_FILE_SHARE_NAME=your_file_share_name
   
   # Alternative: Use connection string
   # AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
   
   # Optional: Start browsing from a specific subfolder
   # ROOT_FOLDER=documents/public
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   ```

5. **Access the application**:
   Open your browser to `http://localhost:3000`

## Azure Storage Setup

1. **Create a Storage Account**:
   - Go to the Azure Portal
   - Create a new Storage Account
   - Note the account name and access key

2. **Create a File Share**:
   - In your Storage Account, go to "File shares"
   - Create a new file share
   - Note the file share name

3. **Upload test files** (optional):
   - Use Azure Storage Explorer or the portal to upload some test files and folders

## Azure App Service Deployment

### Method 1: GitHub Actions (Recommended)

1. **Fork/push this repository to GitHub**

2. **Create an Azure App Service**:
   - Go to Azure Portal → App Services → Create
   - Choose Node.js runtime
   - Select your subscription and resource group

3. **Configure deployment**:
   - In App Service → Deployment Center
   - Choose GitHub as the source
   - Select your repository and branch
   - Azure will automatically detect the Node.js app and configure the build pipeline

4. **Set environment variables**:
   - Go to App Service → Configuration → Application Settings
   - Add the required environment variables:
     ```
     AZURE_STORAGE_ACCOUNT_NAME = your_storage_account_name
     AZURE_STORAGE_ACCOUNT_KEY = your_storage_account_key
     AZURE_STORAGE_FILE_SHARE_NAME = your_file_share_name
     NODE_ENV = production
     ```

5. **Configure Authentication (Optional but Recommended)**:
   - Go to App Service → Authentication
   - Turn on App Service Authentication
   - Configure your identity provider (Azure AD, Microsoft, Google, etc.)
   - Set "Action to take when request is not authenticated" to "Log in with [Provider]"
   - This will protect your entire application with enterprise-grade authentication

### Method 2: Local Git Deployment

1. **Create Azure App Service** (as above)

2. **Configure local git deployment**:
   ```bash
   az webapp deployment source config-local-git --name <app-name> --resource-group <resource-group>
   ```

3. **Add Azure remote and deploy**:
   ```bash
   git remote add azure <git-clone-url>
   git push azure main
   ```

### Method 3: ZIP Deployment

1. **Build the application**:
   ```bash
   npm install --production
   ```

2. **Create deployment package**:
   ```bash
   zip -r app.zip . -x "node_modules/*" ".git/*" "*.log"
   ```

3. **Deploy using Azure CLI**:
   ```bash
   az webapp deployment source config-zip --resource-group <resource-group> --name <app-name> --src app.zip
   ```

## Configuration Options

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_STORAGE_ACCOUNT_NAME` | Yes* | Azure Storage account name |
| `AZURE_STORAGE_ACCOUNT_KEY` | Yes* | Azure Storage account access key |
| `AZURE_STORAGE_FILE_SHARE_NAME` | Yes | Name of the file share to browse |
| `AZURE_STORAGE_CONNECTION_STRING` | Yes* | Alternative to account name/key |
| `ROOT_FOLDER` | No | Start browsing from specific subfolder (e.g., "documents/public") |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment (development/production) |
| `RATE_LIMIT_WINDOW_MS` | No | Rate limiting window (default: 15min) |
| `RATE_LIMIT_MAX_REQUESTS` | No | Max requests per window (default: 100) |

*Either use `AZURE_STORAGE_ACCOUNT_NAME` + `AZURE_STORAGE_ACCOUNT_KEY` OR `AZURE_STORAGE_CONNECTION_STRING`

### Security Features

- **Helmet.js**: Security headers and XSS protection
- **Rate Limiting**: Prevents abuse with configurable limits  
- **Input Validation**: Path traversal protection
- **Azure Authentication**: Uses Azure App Service Authentication/Authorization
- **CORS**: Configurable cross-origin request handling

## API Endpoints

The application provides several REST API endpoints:

- `GET /api/health` - Health check and connection status
- `GET /api/browse?path=<path>` - List directory contents
- `GET /api/download?path=<path>` - Download a file
- `GET /api/file-info?path=<path>` - Get file properties

## Authentication

This application is designed to work with **Azure App Service Authentication/Authorization** (also known as "Easy Auth"). This provides enterprise-grade authentication without any code changes.

### Setting up Azure Authentication

1. **Enable Authentication**:
   ```bash
   # Using Azure CLI
   az webapp auth update --resource-group <resource-group> --name <app-name> --enabled true
   ```

2. **Configure Identity Provider** (Azure Portal):
   - Go to your App Service → Authentication
   - Click "Add identity provider"
   - Choose your provider (Azure AD recommended for enterprise)
   - Configure the provider settings
   - Set "Unauthenticated requests" to "HTTP 302 Found redirect: recommended for websites"

3. **Common Providers**:
   - **Azure Active Directory**: Best for enterprise/corporate environments
   - **Microsoft Account**: Good for personal Microsoft accounts
   - **Google**: For Google account integration
   - **Facebook/Twitter**: For social login scenarios

### Authentication Flow

1. User visits the application URL
2. Azure redirects to the configured identity provider
3. User authenticates with the provider
4. Azure validates the token and creates a session
5. User is redirected back to the application
6. All subsequent requests include authentication headers automatically

### User Information Access

If you need to access user information in your application, Azure provides headers:

```javascript
// Example: Add to server.js to log authenticated user info
app.use((req, res, next) => {
  console.log('User Principal Name:', req.headers['x-ms-client-principal-name']);
  console.log('User ID:', req.headers['x-ms-client-principal-id']);
  next();
});
```

### Benefits of Azure Authentication

- **Zero Code Changes**: Works at the platform level
- **Enterprise Integration**: Seamless Azure AD integration
- **Session Management**: Automatic token refresh and session handling
- **Multiple Providers**: Support for various identity providers
- **Security**: Enterprise-grade security with compliance certifications
- **Scalability**: Handles authentication load automatically

## Troubleshooting

### Common Issues

1. **Connection Failed**:
   - Verify your Azure Storage credentials
   - Check that the file share exists and is accessible
   - Ensure firewall rules allow access from your deployment

2. **Files not loading**:
   - Check the file share name is correct
   - Verify the files exist in the Azure portal
   - Check application logs for detailed error messages

3. **Download issues**:
   - Large files may timeout - consider implementing chunked downloads
   - Check browser download settings
   - Verify file permissions in Azure Storage

### Debugging

Enable detailed logging by setting:
```
NODE_ENV=development
```

Check application logs in Azure App Service:
- Go to App Service → Log stream
- Or use Azure CLI: `az webapp log tail --name <app-name> --resource-group <resource-group>`

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │◄──►│  Express.js App │◄──►│  Azure Storage  │
│                 │    │                 │    │   File Share    │
│  - React/HTML   │    │  - REST API     │    │                 │
│  - File Browser │    │  - File Streaming    │                 │
│  - Downloads    │    │  - Authentication   │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Code Style

- Use ESLint configuration provided
- Follow existing code conventions
- Add comments for complex logic
- Update README.md if needed

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Express.js](https://expressjs.com/) and [Azure Storage SDK](https://docs.microsoft.com/en-us/javascript/api/overview/azure/storage-file-share-readme)
- UI icons by [Font Awesome](https://fontawesome.com/)
- Inspired by modern file management interfaces

---

**Made with ❤️ for Azure Storage File Share management**
