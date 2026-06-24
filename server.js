const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const NodeCache = require('node-cache');
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.warn('Sharp not available - thumbnails will be disabled:', error.message);
}
require('dotenv').config();

const AzureStorageService = require('./lib/azureStorage');
const AzureBlobStorageService = require('./lib/azureBlobStorage');

const app = express();
const port = process.env.PORT || 3000;

// Determine storage type from environment
const storageType = (process.env.STORAGE_TYPE || 'fileshare').toLowerCase();
const validStorageTypes = ['fileshare', 'blob'];

if (!validStorageTypes.includes(storageType)) {
  console.error(`Invalid STORAGE_TYPE: ${storageType}. Must be 'fileshare' or 'blob'`);
  process.exit(1);
}

// Initialize thumbnail cache (24 hour TTL)
const thumbnailCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

// Initialize Azure Storage Service based on storage type
let storageService;
let storageServiceName;
try {
  if (storageType === 'blob') {
    storageService = new AzureBlobStorageService();
    storageServiceName = 'Azure Blob Storage';
    console.log(`Initializing Azure Blob Storage (Container: ${process.env.AZURE_STORAGE_CONTAINER_NAME})`);
  } else {
    storageService = new AzureStorageService();
    storageServiceName = 'Azure File Share';
    console.log(`Initializing Azure File Share (Share: ${process.env.AZURE_STORAGE_FILE_SHARE_NAME})`);
  }
} catch (error) {
  console.error(`Failed to initialize ${storageType === 'blob' ? 'Azure Blob Storage' : 'Azure File Share'} Service:`, error.message);
  process.exit(1);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// CORS configuration
app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Authentication is handled by Azure App Service Authentication/Authorization

// Utility function to format file size
const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Helper function to determine if file is suitable for thumbnail generation
const canGenerateThumbnail = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.svg'];
  return imageExts.includes(ext);
};

// Helper function to determine if file should get a visual thumbnail treatment
const supportsVisualThumbnail = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  const supportedExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.svg', '.pdf'];
  return supportedExts.includes(ext);
};

// Generate thumbnail for supported file types
const generateThumbnail = async (fileBuffer, fileName, size = 200) => {
  if (!sharp) {
    throw new Error('Sharp not available for thumbnail generation');
  }
  
  const ext = path.extname(fileName).toLowerCase();
  
  if (canGenerateThumbnail(fileName)) {
    try {
      // For SVG files, we need special handling
      if (ext === '.svg') {
        return await sharp(fileBuffer)
          .resize(size, size, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      }
      
      // For other image formats
      return await sharp(fileBuffer)
        .resize(size, size, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch (error) {
      console.error(`Error generating thumbnail for ${fileName}:`, error.message);
      throw error;
    }
  }
  
  throw new Error(`Unsupported file type for thumbnail: ${ext}`);
};

// API Routes

// Thumbnail generation endpoint
app.get('/api/thumbnail', async (req, res) => {
  try {
    const filePath = req.query.path;
    const size = parseInt(req.query.size) || 200;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    // Validate and sanitize path
    if (filePath.includes('..') || filePath.includes('\\')) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    // Check cache first
    const cacheKey = `thumbnail_${filePath}_${size}`;
    const etag = `"thumb-${Buffer.from(cacheKey).toString('base64')}"`;
    
    // Check if client has cached version
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    
    const cachedThumbnail = thumbnailCache.get(cacheKey);
    
    if (cachedThumbnail) {
      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': cachedThumbnail.length,
        'Cache-Control': 'public, max-age=86400, immutable',
        'ETag': etag,
        'Last-Modified': new Date(Date.now() - 3600000).toUTCString() // 1 hour ago
      });
      return res.send(cachedThumbnail);
    }
    
    // Get file name to check if thumbnail generation is supported
    const fileName = path.basename(filePath);
    
    if (!canGenerateThumbnail(fileName)) {
      return res.status(415).json({ 
        error: 'Thumbnail not supported for this file type',
        supportedTypes: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.svg']
      });
    }
    
    // Download the file from Azure Storage
    const fileData = await storageService.getFile(filePath);
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of fileData.content) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);
    
    // Generate thumbnail
    const thumbnailBuffer = await generateThumbnail(fileBuffer, fileName, size);
    
    // Cache the thumbnail
    thumbnailCache.set(cacheKey, thumbnailBuffer);
    
    // Send thumbnail
    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': thumbnailBuffer.length,
      'Cache-Control': 'public, max-age=86400, immutable',
      'ETag': etag,
      'Last-Modified': new Date().toUTCString()
    });
    
    res.send(thumbnailBuffer);
    
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else if (error.message.includes('Sharp not available')) {
      res.status(503).json({ error: 'Thumbnail generation service unavailable' });
    } else {
      res.status(500).json({ error: 'Failed to generate thumbnail' });
    }
  }
});

// Test endpoint to verify thumbnail system
app.get('/api/thumbnail-test', (req, res) => {
  console.log('Thumbnail test endpoint hit');
  res.json({ 
    message: 'Thumbnail system status',
    timestamp: new Date().toISOString(),
    version: '3.3-layout-fixes',
    sharp: {
      available: !!sharp,
      version: sharp ? 'loaded' : 'not available'
    },
    cache: {
      keys: thumbnailCache.keys().length,
      stats: thumbnailCache.getStats()
    },
    supportedFormats: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.svg']
  });
});

// Test endpoint to verify pagination deployment
app.get('/api/pagination-test', (req, res) => {
  console.log('Pagination test endpoint hit');
  res.json({ 
    message: 'Pagination is deployed!', 
    timestamp: new Date().toISOString(),
    version: '2.0-with-pagination',
    testParams: {
      page: req.query.page || 'not provided',
      limit: req.query.limit || 'not provided'
    }
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const isConnected = await storageService.testConnection();
    res.json({ 
      status: 'ok', 
      azureConnection: isConnected,
      storageType: storageType,
      storageName: storageType === 'blob' ? process.env.AZURE_STORAGE_CONTAINER_NAME : process.env.AZURE_STORAGE_FILE_SHARE_NAME,
      rootFolder: storageService.rootFolder || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      azureConnection: false,
      storageType: storageType,
      storageName: storageType === 'blob' ? process.env.AZURE_STORAGE_CONTAINER_NAME : process.env.AZURE_STORAGE_FILE_SHARE_NAME,
      rootFolder: storageService.rootFolder || null,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// List directory contents
app.get('/api/browse', async (req, res) => {
  try {
    const directoryPath = req.query.path || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const fetchAll = req.query.all === 'true'; // New parameter to fetch all items
    
    console.log('Browse request received:', { path: directoryPath, page, limit, fetchAll, query: req.query });
    
    // Validate parameters
    if (directoryPath.includes('..') || directoryPath.includes('\\')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    if (!fetchAll) {
      if (page < 1) {
        return res.status(400).json({ error: 'Page must be >= 1' });
      }
      
      if (![10, 20, 50].includes(limit)) {
        return res.status(400).json({ error: 'Limit must be 10, 20, or 50' });
      }
    }

    const allItems = await storageService.listDirectory(directoryPath);
    
    let itemsToReturn;
    let paginationInfo = null;
    
    if (fetchAll) {
      // Return all items for search functionality
      itemsToReturn = allItems;
    } else {
      // Calculate pagination for normal browsing
      const totalItems = allItems.length;
      const totalPages = Math.ceil(totalItems / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      itemsToReturn = allItems.slice(startIndex, endIndex);
      
      paginationInfo = {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        startIndex: startIndex + 1,
        endIndex: Math.min(endIndex, totalItems)
      };
    }
    
    // Format the response
    const formattedItems = itemsToReturn.map(item => ({
      ...item,
      sizeFormatted: item.size ? formatFileSize(item.size) : null,
      lastModifiedFormatted: item.lastModified 
        ? new Date(item.lastModified).toLocaleString() 
        : 'Date unknown'
    }));

    const response = {
      currentPath: directoryPath,
      items: formattedItems,
      parentPath: directoryPath ? directoryPath.split('/').slice(0, -1).join('/') : null,
      fetchedAll: fetchAll
    };
    
    // Only include pagination info for paginated requests
    if (paginationInfo) {
      response.pagination = paginationInfo;
    }
    
    res.json(response);

  } catch (error) {
    console.error('Error browsing directory:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download file
app.get('/api/download', async (req, res) => {
  try {
    const filePath = req.query.path;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Validate and sanitize path
    if (filePath.includes('..') || filePath.includes('\\')) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const fileData = await storageService.getFile(filePath);
    
    // Set headers for file download
    const fileName = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', fileData.properties.contentType);
    res.setHeader('Content-Length', fileData.properties.size);

    // Stream the file to the response
    fileData.content.pipe(res);

  } catch (error) {
    console.error('Error downloading file:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get file properties
app.get('/api/file-info', async (req, res) => {
  try {
    const filePath = req.query.path;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Validate and sanitize path
    if (filePath.includes('..') || filePath.includes('\\')) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const properties = await storageService.getFileProperties(filePath);
    
    res.json({
      path: filePath,
      fileName: path.basename(filePath),
      ...properties,
      sizeFormatted: formatFileSize(properties.size),
      lastModifiedFormatted: properties.lastModified 
        ? new Date(properties.lastModified).toLocaleString() 
        : 'Date unknown'
    });

  } catch (error) {
    console.error('Error getting file info:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Preview file - serves file with appropriate headers for embedding
app.get('/api/preview', async (req, res) => {
  try {
    const filePath = req.query.path;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Validate and sanitize path
    if (filePath.includes('..') || filePath.includes('\\')) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const fileData = await storageService.getFile(filePath);
    
    // Set headers for inline preview (not download)
    const fileName = path.basename(filePath);
    const fileExtension = fileName.split('.').pop().toLowerCase();
    
    // Set appropriate content type for preview
    let contentType = fileData.properties.contentType;
    
    // Override content types for better browser support
    if (fileExtension === 'pdf') {
      contentType = 'application/pdf';
    } else if (['jpg', 'jpeg'].includes(fileExtension)) {
      contentType = 'image/jpeg';
    } else if (fileExtension === 'png') {
      contentType = 'image/png';
    } else if (fileExtension === 'gif') {
      contentType = 'image/gif';
    } else if (fileExtension === 'svg') {
      contentType = 'image/svg+xml';
    } else if (fileExtension === 'mp4') {
      contentType = 'video/mp4';
    } else if (fileExtension === 'webm') {
      contentType = 'video/webm';
    } else if (fileExtension === 'mp3') {
      contentType = 'audio/mpeg';
    } else if (fileExtension === 'wav') {
      contentType = 'audio/wav';
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileData.properties.size);
    
    // CRITICAL: Set inline disposition to prevent download
    res.setHeader('Content-Disposition', 'inline');
    
    // Add cache headers for better performance
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    // Add headers to allow embedding in iframe
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    
    // Remove any headers that might force download
    res.removeHeader('Content-Disposition');
    
    // Set inline disposition last to ensure it's not overridden
    res.setHeader('Content-Disposition', 'inline');
    
    // Stream the file to the response
    fileData.content.pipe(res);

  } catch (error) {
    console.error('Error previewing file:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Serve the main page for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(port, () => {
  console.log(`Azure SMB Viewer running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Test Azure connection on startup
  storageService.testConnection()
    .then(connected => {
      console.log(`Azure Storage connection: ${connected ? 'SUCCESS' : 'FAILED'}`);
    })
    .catch(error => {
      console.error('Azure Storage connection test failed:', error.message);
    });
});

module.exports = app;