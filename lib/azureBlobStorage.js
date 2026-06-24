const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
require('dotenv').config();

class AzureBlobStorageService {
  constructor() {
    this.accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    this.accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
    this.connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    this.rootFolder = process.env.ROOT_FOLDER || '';

    if (!this.containerName) {
      throw new Error('AZURE_STORAGE_CONTAINER_NAME is required');
    }

    // Initialize the service client
    if (this.connectionString) {
      this.serviceClient = BlobServiceClient.fromConnectionString(this.connectionString);
    } else if (this.accountName && this.accountKey) {
      const credential = new StorageSharedKeyCredential(this.accountName, this.accountKey);
      this.serviceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        credential
      );
    } else {
      throw new Error('Either AZURE_STORAGE_CONNECTION_STRING or both AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY are required');
    }

    this.containerClient = this.serviceClient.getContainerClient(this.containerName);
    
    // Clean up root folder path
    if (this.rootFolder) {
      this.rootFolder = this.rootFolder.replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes
      // Ensure root folder ends with / for prefix matching
      if (this.rootFolder && !this.rootFolder.endsWith('/')) {
        this.rootFolder += '/';
      }
    }
  }

  /**
   * Combine root folder with relative path
   * @param {string} relativePath - Path relative to the configured root folder
   * @returns {string} Full path from container root
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
    
    return `${this.rootFolder}${cleanRelativePath}`;
  }

  /**
   * Convert full path back to relative path (remove root folder prefix)
   * @param {string} fullPath - Full path from container root
   * @returns {string} Path relative to the configured root folder
   */
  getRelativePath(fullPath) {
    if (!this.rootFolder || !fullPath) {
      return fullPath || '';
    }
    
    // If the full path starts with our root folder, remove it
    if (fullPath.startsWith(this.rootFolder)) {
      return fullPath.substring(this.rootFolder.length);
    }
    
    return fullPath;
  }

  /**
   * List contents of a directory (prefix) in the blob container
   * Blobs use a flat structure with "/" as delimiter to simulate directories
   * @param {string} directoryPath - Path to the directory relative to configured root (empty string for configured root)
   * @returns {Promise<Array>} Array of files and directories
   */
  async listDirectory(directoryPath = '') {
    try {
      // Convert relative path to full path
      const fullPath = this.getFullPath(directoryPath);
      
      // Ensure path ends with / if not empty (for prefix matching)
      const prefix = fullPath && !fullPath.endsWith('/') ? `${fullPath}/` : fullPath;
      
      const items = [];
      const directories = new Set();

      // List blobs with the prefix, using delimiter to get virtual directories
      const iterator = this.containerClient.listBlobsByHierarchy('/', { prefix });
      
      for await (const item of iterator) {
        if (item.kind === 'prefix') {
          // This is a virtual directory
          const dirName = item.name.slice(prefix.length).replace(/\/$/, '');
          const relativePath = directoryPath ? `${directoryPath}/${dirName}` : dirName;
          
          directories.add(dirName);
          items.push({
            name: dirName,
            type: 'directory',
            path: relativePath,
            size: null,
            lastModified: null
          });
        } else {
          // This is a blob (file)
          const blobName = item.name.slice(prefix.length);
          
          // Skip if this is in a subdirectory (shouldn't happen with hierarchy listing, but just in case)
          if (blobName.includes('/')) {
            continue;
          }
          
          const relativePath = directoryPath ? `${directoryPath}/${blobName}` : blobName;
          
          items.push({
            name: blobName,
            type: 'file',
            path: relativePath,
            size: item.properties.contentLength,
            lastModified: item.properties.lastModified
          });
        }
      }

      // Sort by last modified date (newest first) for files, directories alphabetically
      return items.sort((a, b) => {
        // Directories first, then files
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        // Directories sorted alphabetically
        if (a.type === 'directory') {
          return a.name.localeCompare(b.name);
        }
        // Files sorted by last modified date (newest first)
        const dateA = a.lastModified ? new Date(a.lastModified) : new Date(0);
        const dateB = b.lastModified ? new Date(b.lastModified) : new Date(0);
        return dateB - dateA;
      });

    } catch (error) {
      console.error('Error listing directory:', error);
      throw error;
    }
  }

  /**
   * Get a blob from the container
   * @param {string} filePath - Path to the blob relative to configured root
   * @returns {Promise<Object>} Blob content stream and properties
   */
  async getFile(filePath) {
    try {
      // Convert relative path to full path
      const fullPath = this.getFullPath(filePath);
      
      const blobClient = this.containerClient.getBlobClient(fullPath);
      
      // Check if blob exists and get properties
      const properties = await blobClient.getProperties();
      
      // Download the blob
      const downloadResponse = await blobClient.download(0);
      
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
   * Get blob properties without downloading content
   * @param {string} filePath - Path to the blob relative to configured root
   * @returns {Promise<Object>} Blob properties
   */
  async getFileProperties(filePath) {
    try {
      // Convert relative path to full path
      const fullPath = this.getFullPath(filePath);
      
      const blobClient = this.containerClient.getBlobClient(fullPath);
      const properties = await blobClient.getProperties();
      
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
   * Check if the blob container is accessible
   * @returns {Promise<boolean>} True if accessible
   */
  async testConnection() {
    try {
      await this.containerClient.getProperties();
      return true;
    } catch (error) {
      console.error('Azure Blob Storage connection test failed:', error);
      return false;
    }
  }
}

module.exports = AzureBlobStorageService;
