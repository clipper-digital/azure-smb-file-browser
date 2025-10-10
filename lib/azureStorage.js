const { ShareServiceClient, StorageSharedKeyCredential } = require('@azure/storage-file-share');
require('dotenv').config();

class AzureStorageService {
  constructor() {
    this.accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    this.accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    this.shareName = process.env.AZURE_STORAGE_FILE_SHARE_NAME;
    this.connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    this.rootFolder = process.env.ROOT_FOLDER || '';

    if (!this.shareName) {
      throw new Error('AZURE_STORAGE_FILE_SHARE_NAME is required');
    }

    // Initialize the service client
    if (this.connectionString) {
      this.serviceClient = ShareServiceClient.fromConnectionString(this.connectionString);
    } else if (this.accountName && this.accountKey) {
      const credential = new StorageSharedKeyCredential(this.accountName, this.accountKey);
      this.serviceClient = new ShareServiceClient(
        `https://${this.accountName}.file.core.windows.net`,
        credential
      );
    } else {
      throw new Error('Either AZURE_STORAGE_CONNECTION_STRING or both AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY are required');
    }

    this.shareClient = this.serviceClient.getShareClient(this.shareName);
    
    // Clean up root folder path
    if (this.rootFolder) {
      this.rootFolder = this.rootFolder.replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes
    }
  }

  /**
   * Combine root folder with relative path
   * @param {string} relativePath - Path relative to the configured root folder
   * @returns {string} Full path from file share root
   */
  getFullPath(relativePath = '') {
    if (!this.rootFolder) {
      return relativePath;
    }
    
    // Remove leading slashes from relative path
    const cleanRelativePath = relativePath.replace(/^\/+/, '');
    
    if (!cleanRelativePath) {
      return this.rootFolder;
    }
    
    return `${this.rootFolder}/${cleanRelativePath}`;
  }

  /**
   * Convert full path back to relative path (remove root folder prefix)
   * @param {string} fullPath - Full path from file share root
   * @returns {string} Path relative to the configured root folder
   */
  getRelativePath(fullPath) {
    if (!this.rootFolder || !fullPath) {
      return fullPath || '';
    }
    
    // If the full path starts with our root folder, remove it
    if (fullPath.startsWith(this.rootFolder + '/')) {
      return fullPath.substring(this.rootFolder.length + 1);
    } else if (fullPath === this.rootFolder) {
      return '';
    }
    
    return fullPath;
  }

  /**
   * List contents of a directory in the file share
   * @param {string} directoryPath - Path to the directory relative to configured root (empty string for configured root)
   * @returns {Promise<Array>} Array of files and directories
   */
  async listDirectory(directoryPath = '') {
    try {
      // Convert relative path to full path
      const fullPath = this.getFullPath(directoryPath);
      const directoryClient = this.shareClient.getDirectoryClient(fullPath);
      const items = [];

      // Check if directory exists
      try {
        await directoryClient.getProperties();
      } catch (error) {
        if (error.statusCode === 404) {
          throw new Error(`Directory not found: ${directoryPath || 'root'}`);
        }
        throw error;
      }

      // List all items in the directory
      for await (const item of directoryClient.listFilesAndDirectories()) {
        // Build relative path (relative to configured root folder)
        const relativePath = directoryPath ? `${directoryPath}/${item.name}` : item.name;
        
        if (item.kind === 'directory') {
          items.push({
            name: item.name,
            type: 'directory',
            path: relativePath,
            size: null,
            lastModified: null
          });
        } else if (item.kind === 'file') {
          // Always fetch detailed file properties to ensure we get lastModified
          try {
            const fileClient = directoryClient.getFileClient(item.name);
            const fileProperties = await fileClient.getProperties();
            
            items.push({
              name: item.name,
              type: 'file',
              path: relativePath,
              size: fileProperties.contentLength,
              lastModified: fileProperties.lastModified
            });
            
          } catch (error) {
            console.warn(`Could not fetch properties for file ${item.name}:`, error.message);
            // Fallback to basic properties from listing if detailed fetch fails
            items.push({
              name: item.name,
              type: 'file',
              path: relativePath,
              size: item.properties?.contentLength || 0,
              lastModified: item.properties?.lastModified || null
            });
          }
        }
      }

      return items.sort((a, b) => {
        // Directories first, then files
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        // Then alphabetically
        return a.name.localeCompare(b.name);
      });

    } catch (error) {
      console.error('Error listing directory:', error);
      throw error;
    }
  }

  /**
   * Get a file from the file share
   * @param {string} filePath - Path to the file relative to configured root
   * @returns {Promise<Buffer>} File content as buffer
   */
  async getFile(filePath) {
    try {
      // Convert relative path to full path
      const fullPath = this.getFullPath(filePath);

      let directoryPathInShare = '';
      let fileName = fullPath;

      const lastSlashIndex = fullPath.lastIndexOf('/');
      if (lastSlashIndex > -1) {
        directoryPathInShare = fullPath.substring(0, lastSlashIndex);
        fileName = fullPath.substring(lastSlashIndex + 1);
      }

      const directoryClient = this.shareClient.getDirectoryClient(directoryPathInShare);
      const fileClient = directoryClient.getFileClient(fileName);
      
      // Check if file exists and get properties
      const properties = await fileClient.getProperties();
      
      // Download the file
      const downloadResponse = await fileClient.download(0);
      
      return {
        content: downloadResponse.readableStreamBody,
        properties: {
          size: properties.contentLength,
          lastModified: properties.lastModified,
          contentType: properties.contentType || 'application/octet-stream'
        }
      };

    } catch (error) {
      console.error('Error getting file:', error);
      if (error.statusCode === 404) {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Get file properties without downloading content
   * @param {string} filePath - Path to the file relative to configured root
   * @returns {Promise<Object>} File properties
   */
  async getFileProperties(filePath) {
    try {
      // Convert relative path to full path
      const fullPath = this.getFullPath(filePath);

      let directoryPathInShare = '';
      let fileName = fullPath;

      const lastSlashIndex = fullPath.lastIndexOf('/');
      if (lastSlashIndex > -1) {
        directoryPathInShare = fullPath.substring(0, lastSlashIndex);
        fileName = fullPath.substring(lastSlashIndex + 1);
      }

      const directoryClient = this.shareClient.getDirectoryClient(directoryPathInShare);
      const fileClient = directoryClient.getFileClient(fileName);
      const properties = await fileClient.getProperties();
      
      return {
        size: properties.contentLength,
        lastModified: properties.lastModified,
        contentType: properties.contentType || 'application/octet-stream'
      };

    } catch (error) {
      console.error('Error getting file properties:', error);
      if (error.statusCode === 404) {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Check if the file share is accessible
   * @returns {Promise<boolean>} True if accessible
   */
  async testConnection() {
    try {
      await this.shareClient.getProperties();
      return true;
    } catch (error) {
      console.error('Azure Storage connection test failed:', error);
      return false;
    }
  }
}

module.exports = AzureStorageService;