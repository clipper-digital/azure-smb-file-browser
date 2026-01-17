// Application state
let currentPath = '';
let currentFiles = [];
let viewMode = 'list'; // 'list' or 'grid'
let rootFolder = null; // Will be set from server
let currentPage = 1;
let itemsPerPage = 20;
let paginationData = null;
let currentSort = 'date-desc'; // Default sort: newest files first
let searchTerm = ''; // Current search filter
let displayFiles = []; // Currently displayed files (after filtering and sorting)
let allFilesLoaded = false; // Whether all files in current directory are loaded
let searchTimeout = null; // Debounce timeout for search

// PDF thumbnail cache
const pdfThumbnailCache = new Map();

// DOM elements
const elements = {
    connectionStatus: document.getElementById('connectionStatus'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    breadcrumb: document.getElementById('breadcrumb'),
    rootBreadcrumb: document.getElementById('rootBreadcrumb'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('errorMessage'),
    errorText: document.getElementById('errorText'),
    retryBtn: document.getElementById('retryBtn'),
    fileBrowser: document.getElementById('fileBrowser'),
    fileList: document.getElementById('fileList'),
    emptyState: document.getElementById('emptyState'),
    emptyStateMessage: document.getElementById('emptyStateMessage'),
    refreshBtn: document.getElementById('refreshBtn'),
    backBtn: document.getElementById('backBtn'),
    sortBy: document.getElementById('sortBy'),
    listViewBtn: document.getElementById('listViewBtn'),
    gridViewBtn: document.getElementById('gridViewBtn'),
    itemCount: document.getElementById('itemCount'),
    currentPathSpan: document.getElementById('currentPath'),
    fileInfoModal: document.getElementById('fileInfoModal'),
    fileInfoContent: document.getElementById('fileInfoContent'),
    closeModal: document.getElementById('closeModal'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    downloadFromModal: document.getElementById('downloadFromModal'),
    filePreviewModal: document.getElementById('filePreviewModal'),
    filePreviewContent: document.getElementById('filePreviewContent'),
    previewFileName: document.getElementById('previewFileName'),
    closePreviewModal: document.getElementById('closePreviewModal'),
    closePreviewModalBtn: document.getElementById('closePreviewModalBtn'),
    downloadFromPreview: document.getElementById('downloadFromPreview'),
    showInfoFromPreview: document.getElementById('showInfoFromPreview'),
    // Pagination elements
    paginationTop: document.getElementById('paginationTop'),
    paginationBottom: document.getElementById('paginationBottom'),
    itemsPerPageSelect: document.getElementById('itemsPerPage'),
    paginationInfo: document.getElementById('paginationInfo'),
    paginationInfoBottom: document.getElementById('paginationInfoBottom'),
    firstPageBtn: document.getElementById('firstPageBtn'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    lastPageBtn: document.getElementById('lastPageBtn'),
    firstPageBtnBottom: document.getElementById('firstPageBtnBottom'),
    prevPageBtnBottom: document.getElementById('prevPageBtnBottom'),
    nextPageBtnBottom: document.getElementById('nextPageBtnBottom'),
    lastPageBtnBottom: document.getElementById('lastPageBtnBottom'),
    pageNumbers: document.getElementById('pageNumbers'),
    pageNumbersBottom: document.getElementById('pageNumbersBottom'),
    // Search elements
    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    searchLoading: document.getElementById('searchLoading')
};

// Utility functions
const showElement = (element) => {
    element.style.display = 'block';
};

const hideElement = (element) => {
    element.style.display = 'none';
};

const toggleElement = (element, show) => {
    element.style.display = show ? 'block' : 'none';
};

const showLoading = () => {
    showElement(elements.loading);
    hideElement(elements.fileBrowser);
    hideElement(elements.errorMessage);
    hideElement(elements.emptyState);
};

const hideLoading = () => {
    hideElement(elements.loading);
};

const showError = (message) => {
    elements.errorText.textContent = message;
    showElement(elements.errorMessage);
    hideElement(elements.fileBrowser);
    hideElement(elements.emptyState);
    hideLoading();
};

const getFileIcon = (fileName, isDirectory) => {
    if (isDirectory) {
        return 'fas fa-folder';
    }
    
    const ext = fileName.split('.').pop().toLowerCase();
    
    switch (ext) {
        case 'pdf':
            return 'fas fa-file-pdf';
        case 'doc':
        case 'docx':
            return 'fas fa-file-word';
        case 'xls':
        case 'xlsx':
            return 'fas fa-file-excel';
        case 'ppt':
        case 'pptx':
            return 'fas fa-file-powerpoint';
        case 'txt':
            return 'fas fa-file-alt';
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'bmp':
        case 'svg':
            return 'fas fa-file-image';
        case 'mp3':
        case 'wav':
        case 'flac':
        case 'aac':
            return 'fas fa-file-audio';
        case 'mp4':
        case 'avi':
        case 'mkv':
        case 'mov':
            return 'fas fa-file-video';
        case 'zip':
        case 'rar':
        case '7z':
        case 'tar':
        case 'gz':
            return 'fas fa-file-archive';
        case 'html':
        case 'htm':
        case 'css':
        case 'js':
        case 'json':
        case 'xml':
            return 'fas fa-file-code';
        default:
            return 'fas fa-file';
    }
};

// Check if file supports thumbnail generation
const supportsThumbnail = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'svg'];
    const pdfExts = ['pdf'];
    
    // For images, always support thumbnails
    if (imageExts.includes(ext)) {
        return true;
    }
    
    // For PDFs, only support thumbnails if PDF.js is available
    if (pdfExts.includes(ext)) {
        return isPdfJsAvailable();
    }
    
    return false;
};

// Check if file is a PDF
const isPdfFile = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    return ext === 'pdf';
};

// Check if PDF.js is available and properly loaded
const isPdfJsAvailable = () => {
    try {
        return typeof pdfjsLib !== 'undefined' && 
               pdfjsLib && 
               typeof pdfjsLib.getDocument === 'function';
    } catch (e) {
        return false;
    }
};

// Truncate filename for display in grid view
const truncateFilename = (filename, maxLength = 25) => {
    if (filename.length <= maxLength) {
        return filename;
    }
    return filename.substring(0, maxLength) + '...';
};

// Filter files based on search term
const filterFiles = (files, searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
        return files;
    }
    
    const term = searchTerm.toLowerCase().trim();
    return files.filter(file => 
        file.name.toLowerCase().includes(term)
    );
};

// Apply client-side pagination to filtered results
const applyClientSidePagination = (files, page, limit) => {
    const totalItems = files.length;
    const totalPages = Math.ceil(totalItems / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedFiles = files.slice(startIndex, endIndex);
    
    return {
        items: paginatedFiles,
        pagination: {
            currentPage: page,
            totalPages: totalPages,
            totalItems: totalItems,
            itemsPerPage: limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            startIndex: startIndex + 1,
            endIndex: Math.min(endIndex, totalItems)
        }
    };
};

// Sort files based on current sort setting
const sortFiles = (files, sortBy) => {
    const sortedFiles = [...files];
    
    // Separate directories and files
    const directories = sortedFiles.filter(f => f.type === 'directory');
    const regularFiles = sortedFiles.filter(f => f.type === 'file');
    
    // Sort directories by name (always alphabetical)
    directories.sort((a, b) => a.name.localeCompare(b.name));
    
    // Sort files based on selected option
    switch (sortBy) {
        case 'name-asc':
            regularFiles.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'name-desc':
            regularFiles.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'date-asc':
            regularFiles.sort((a, b) => {
                // Use createdOn if available, fall back to lastModified
                const dateA = a.createdOn ? new Date(a.createdOn) : (a.lastModified ? new Date(a.lastModified) : new Date(0));
                const dateB = b.createdOn ? new Date(b.createdOn) : (b.lastModified ? new Date(b.lastModified) : new Date(0));
                return dateA - dateB;
            });
            break;
        case 'date-desc':
        default:
            regularFiles.sort((a, b) => {
                // Use createdOn if available, fall back to lastModified
                const dateA = a.createdOn ? new Date(a.createdOn) : (a.lastModified ? new Date(a.lastModified) : new Date(0));
                const dateB = b.createdOn ? new Date(b.createdOn) : (b.lastModified ? new Date(b.lastModified) : new Date(0));
                return dateB - dateA;
            });
            break;
    }
    
    // Return directories first, then sorted files
    return [...directories, ...regularFiles];
};

// Check if file supports visual thumbnail treatment (including PDFs)
const supportsVisualThumbnail = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    const supportedExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'svg', 'pdf'];
    return supportedExts.includes(ext);
};

// Lazy loading intersection observer for thumbnails
let thumbnailObserver = null;

// Initialize thumbnail lazy loading
const initThumbnailLazyLoading = () => {
    if (!thumbnailObserver && window.IntersectionObserver) {
        thumbnailObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const filePath = img.dataset.filePath;
                    if (filePath) {
                        loadThumbnail(img, filePath);
                        thumbnailObserver.unobserve(img);
                    }
                }
            });
        }, {
            rootMargin: '50px' // Start loading 50px before coming into view
        });
    }
};

// Generate PDF thumbnail using client-side PDF.js
const generatePdfThumbnail = async (filePath) => {
    try {
        // Check if PDF.js is available
        if (!isPdfJsAvailable()) {
            throw new Error('PDF.js library not available or not properly loaded');
        }
        
        // Initialize PDF.js worker if not already done
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        
        // Use preview endpoint instead of download to avoid attachment headers
        const response = await fetch(`/api/preview?path=${encodeURIComponent(filePath)}`, {
            headers: {
                'Accept': 'application/pdf'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        
        // Load PDF document with error handling
        const loadingTask = pdfjsLib.getDocument({ 
            data: arrayBuffer,
            disableAutoFetch: true,
            disableStream: true
        });
        
        const pdf = await loadingTask.promise;
        
        // Get first page
        const page = await pdf.getPage(1);
        
        // Calculate scale to fit in thumbnail size
        const viewport = page.getViewport({ scale: 1 });
        const targetSize = 200;
        const scale = Math.min(targetSize / viewport.width, targetSize / viewport.height);
        const scaledViewport = page.getViewport({ scale });
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        
        // Render PDF page to canvas
        const renderContext = {
            canvasContext: context,
            viewport: scaledViewport
        };
        
        await page.render(renderContext).promise;
        
        // Convert canvas to data URL
        return canvas.toDataURL('image/jpeg', 0.85);
        
    } catch (error) {
        console.error('Error generating PDF thumbnail:', error);
        throw error;
    }
};

// Load thumbnail for an image element
const loadThumbnail = async (img, filePath) => {
    try {
        img.classList.add('loading');
        
        const fileName = filePath.split('/').pop();
        
        if (isPdfFile(fileName)) {
            // Check cache first
            if (pdfThumbnailCache.has(filePath)) {
                img.src = pdfThumbnailCache.get(filePath);
                img.classList.remove('loading', 'pdf-loading', 'image-loading');
                img.classList.remove('error');
                setTimeout(() => {
                    img.style.opacity = '1';
                }, 50);
                console.log('Used cached PDF thumbnail for:', fileName);
                return;
            }
            
            // Generate PDF thumbnail client-side with timeout
            try {
                // Add a timeout to prevent hanging
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('PDF thumbnail generation timeout')), 15000)
                );
                
                const thumbnailPromise = generatePdfThumbnail(filePath);
                const thumbnailDataUrl = await Promise.race([thumbnailPromise, timeoutPromise]);
                
                // Cache the thumbnail
                pdfThumbnailCache.set(filePath, thumbnailDataUrl);
                
                img.src = thumbnailDataUrl;
                img.classList.remove('loading', 'pdf-loading', 'image-loading');
                img.classList.remove('error');
                // Add a small delay for smoother transition
                setTimeout(() => {
                    img.style.opacity = '1';
                }, 50);
                console.log('Generated and cached PDF thumbnail for:', fileName);
            } catch (pdfError) {
                console.warn('Failed to generate PDF thumbnail, falling back to server-side:', pdfError);
                
                // Fallback to server-side thumbnail generation for PDFs
                try {
                    const pixelRatio = window.devicePixelRatio || 1;
                    const size = Math.min(400, Math.ceil(200 * pixelRatio));
                    const thumbnailUrl = `/api/thumbnail?path=${encodeURIComponent(filePath)}&size=${size}`;
                    
                    const testImg = new Image();
                    testImg.onload = () => {
                        img.src = thumbnailUrl;
                        img.classList.remove('loading');
                        img.classList.remove('error');
                    };
                    testImg.onerror = () => {
                        img.classList.remove('loading');
                        img.classList.add('error');
                        img.innerHTML = '<i class="fas fa-file-pdf"></i>';
                    };
                    
                    testImg.src = thumbnailUrl;
                } catch (serverError) {
                    img.classList.remove('loading');
                    img.classList.add('error');
                    img.innerHTML = '<i class="fas fa-file-pdf"></i>';
                }
            }
        } else {
            // Handle regular image thumbnails
            const pixelRatio = window.devicePixelRatio || 1;
            const size = Math.min(400, Math.ceil(200 * pixelRatio));
            const thumbnailUrl = `/api/thumbnail?path=${encodeURIComponent(filePath)}&size=${size}`;
            
            const testImg = new Image();
            testImg.onload = () => {
                img.src = thumbnailUrl;
                img.classList.remove('loading', 'pdf-loading', 'image-loading');
                img.classList.remove('error');
                // Add a small delay for smoother transition
                setTimeout(() => {
                    img.style.opacity = '1';
                }, 50);
            };
            testImg.onerror = () => {
                img.classList.remove('loading', 'pdf-loading', 'image-loading');
                img.classList.add('error');
                img.innerHTML = '<i class="fas fa-image"></i>';
            };
            
            setTimeout(() => {
                if (img.classList.contains('loading')) {
                    testImg.onerror();
                }
            }, 10000);
            
            testImg.src = thumbnailUrl;
        }
        
    } catch (error) {
        console.warn('Failed to load thumbnail for', filePath, error);
        img.classList.remove('loading');
        img.classList.add('error');
        img.innerHTML = '<i class="fas fa-file"></i>';
    }
};

const formatPath = (path) => {
    if (!path) {
        return rootFolder ? rootFolder.split('/').pop() : 'Root';
    }
    return path;
};

// Helper function to handle null/undefined values
const formatValue = (value, defaultValue = 'Unknown') => {
    if (value === null || value === undefined || value === 'null') {
        return defaultValue;
    }
    return value;
};

// Helper function to format metadata with proper styling
const formatMetadataValue = (value, defaultValue = 'Unknown') => {
    if (value === null || value === undefined || value === 'null' || value === 'Unknown') {
        return `<span class="unknown">${defaultValue}</span>`;
    }
    return value;
};

// API functions
const checkConnection = async () => {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        // Store root folder info
        rootFolder = data.rootFolder;
        
        // Update page title and header based on storage type
        if (data.storageType) {
            const pageTitle = document.getElementById('pageTitle');
            const pageHeader = document.getElementById('pageHeader');
            const footerTitle = document.getElementById('footerTitle');
            
            let title;
            if (data.storageType === 'blob') {
                title = 'Azure Blob Browser';
            } else if (data.storageType === 'fileshare') {
                title = 'Azure File Share Browser';
            } else {
                title = 'Azure Storage Browser';
            }
            
            if (pageTitle) pageTitle.textContent = title;
            if (pageHeader) pageHeader.textContent = title;
            if (footerTitle) footerTitle.textContent = title;
        }
        
        // Update root breadcrumb label
        if (elements.rootBreadcrumb && rootFolder) {
            elements.rootBreadcrumb.textContent = rootFolder.split('/').pop();
        }
        
        if (data.azureConnection) {
            elements.statusDot.className = 'status-dot connected';
            elements.statusText.textContent = 'Connected';
            return true;
        } else {
            elements.statusDot.className = 'status-dot disconnected';
            elements.statusText.textContent = 'Disconnected';
            return false;
        }
    } catch (error) {
        elements.statusDot.className = 'status-dot disconnected';
        elements.statusText.textContent = 'Connection Error';
        return false;
    }
};

const loadDirectory = async (path = '', page = 1, resetPagination = false, forceLoadAll = false) => {
    console.log('loadDirectory called with path:', path, 'page:', page, 'forceLoadAll:', forceLoadAll);
    showLoading();
    
    // Reset pagination and search when navigating to different directory
    if (resetPagination || path !== currentPath) {
        currentPage = 1;
        page = 1;
        allFilesLoaded = false;
        // Clear search when navigating to a different directory
        if (path !== currentPath) {
            clearSearch();
        }
    } else {
        currentPage = page;
    }
    
    try {
        // Determine if we should fetch all files (for search) or paginated results
        const shouldFetchAll = forceLoadAll || (searchTerm && searchTerm.trim() !== '');
        let url;
        
        if (shouldFetchAll) {
            url = `/api/browse?path=${encodeURIComponent(path)}&all=true`;
        } else {
            url = `/api/browse?path=${encodeURIComponent(path)}&page=${page}&limit=${itemsPerPage}`;
        }
        
        console.log('Fetching:', url);
        const response = await fetch(url);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to load directory');
        }
        
        const data = await response.json();
        console.log('API response:', data);
        
        currentPath = data.currentPath;
        currentFiles = data.items;
        allFilesLoaded = data.fetchedAll || false;
        
        // Handle pagination data
        if (data.fetchedAll) {
            // When all files are loaded, we'll handle pagination client-side
            paginationData = null;
        } else {
            paginationData = data.pagination;
        }
        
        console.log('Updated currentPath:', currentPath);
        console.log('Updated currentFiles:', currentFiles.length, 'items');
        console.log('All files loaded:', allFilesLoaded);
        console.log('Updated paginationData:', paginationData);
        
        updateBreadcrumb();
        renderFiles();
        updateUI();
        updatePagination();
        
        hideLoading();
        
    } catch (error) {
        console.error('Error loading directory:', error);
        showError(error.message);
    }
};

const downloadFile = (filePath) => {
    const downloadUrl = `/api/download?path=${encodeURIComponent(filePath)}`;
    
    // Create a temporary anchor element to trigger download
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

const showFileInfo = async (filePath) => {
    try {
        const response = await fetch(`/api/file-info?path=${encodeURIComponent(filePath)}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get file info');
        }
        
        const data = await response.json();
        
        elements.fileInfoContent.innerHTML = `
            <table class="file-info-table">
                <tr>
                    <th>File Name</th>
                    <td>${data.fileName}</td>
                </tr>
                <tr>
                    <th>Size</th>
                    <td>${data.sizeFormatted}</td>
                </tr>
                <tr>
                    <th>Last Modified</th>
                    <td>${data.lastModifiedFormatted}</td>
                </tr>
                <tr>
                    <th>Content Type</th>
                    <td>${data.contentType}</td>
                </tr>
                <tr>
                    <th>Path</th>
                    <td>${data.path}</td>
                </tr>
            </table>
        `;
        
        // Set up download button
        elements.downloadFromModal.onclick = () => {
            downloadFile(filePath);
            closeModal();
        };
        
        showModal();
        
    } catch (error) {
        console.error('Error getting file info:', error);
        alert('Failed to get file information: ' + error.message);
    }
};

// UI functions
const updateBreadcrumb = () => {
    const breadcrumbContent = elements.breadcrumb.querySelector('.breadcrumb-content');
    const parts = currentPath ? currentPath.split('/') : [];
    
    let html = '<i class="fas fa-home"></i>';
    
    // Add root (show configured root folder name if available)
    const rootLabel = rootFolder ? rootFolder.split('/').pop() : 'Root';
    html += `<span class="breadcrumb-item ${!currentPath ? 'active' : ''}" data-path="">${rootLabel}</span>`;
    
    // Add path parts
    let accumulatedPath = '';
    parts.forEach((part, index) => {
        if (part) {
            accumulatedPath += (accumulatedPath ? '/' : '') + part;
            const isActive = index === parts.length - 1;
            
            html += '<span class="breadcrumb-separator">></span>';
            html += `<span class="breadcrumb-item ${isActive ? 'active' : ''}" data-path="${accumulatedPath}">${part}</span>`;
        }
    });
    
    breadcrumbContent.innerHTML = html;
    
    // Add click handlers to breadcrumb items
    breadcrumbContent.querySelectorAll('.breadcrumb-item:not(.active)').forEach(item => {
        item.addEventListener('click', () => {
            const path = item.getAttribute('data-path');
            loadDirectory(path, 1, true); // Reset pagination when navigating via breadcrumb
        });
    });
};

const renderFiles = () => {
    // Always show the file browser container
    showElement(elements.fileBrowser);
    
    if (currentFiles.length === 0) {
        // Show empty state within the file browser
        elements.fileList.innerHTML = '';
        
        // Update empty state message to show current folder
        const folderName = currentPath ? currentPath.split('/').pop() : (rootFolder ? rootFolder.split('/').pop() : 'Root');
        elements.emptyStateMessage.textContent = `The "${folderName}" folder is empty and contains no files or subdirectories.`;
        
        showElement(elements.emptyState);
        return;
    }
    
    // Apply filtering and sorting to current files
    let filteredFiles = filterFiles(currentFiles, searchTerm);
    filteredFiles = sortFiles(filteredFiles, currentSort);
    
    // Check if filtered results are empty
    if (filteredFiles.length === 0 && searchTerm) {
        // Show "no results" state for search
        elements.fileList.innerHTML = '';
        elements.emptyStateMessage.textContent = `No files found matching "${searchTerm}"`;
        showElement(elements.emptyState);
        return;
    }
    
    // Apply client-side pagination if all files are loaded (for search)
    if (allFilesLoaded && filteredFiles.length > itemsPerPage) {
        const paginationResult = applyClientSidePagination(filteredFiles, currentPage, itemsPerPage);
        displayFiles = paginationResult.items;
        paginationData = paginationResult.pagination;
    } else {
        displayFiles = filteredFiles;
        // If we have fewer items than itemsPerPage, no pagination needed
        if (allFilesLoaded && filteredFiles.length <= itemsPerPage) {
            paginationData = null;
        }
    }
    
    // Hide empty state and show file list
    hideElement(elements.emptyState);
    
    const html = displayFiles.map((file, index) => {
        const iconClass = getFileIcon(file.name, file.type === 'directory');
        const iconType = file.type === 'directory' ? 'folder' : 'file';
        const hasThumbnail = file.type === 'file' && supportsThumbnail(file.name) && viewMode === 'grid';
        const hasVisualThumbnail = false; // Disabled - using real thumbnails now
        
        const actions = file.type === 'file' 
            ? `
                <button class="action-btn preview-btn" data-file-index="${index}" title="Preview">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn download-btn" data-file-index="${index}" title="Download">
                    <i class="fas fa-download"></i>
                </button>
                <button class="action-btn info-btn" data-file-index="${index}" title="Info">
                    <i class="fas fa-info"></i>
                </button>
            `
            : '';
        
        const metaData = file.type === 'file' 
            ? `
                <div class="file-meta">
                    <span>${formatValue(file.sizeFormatted, '0 Bytes')}</span>
                    <span>${formatMetadataValue(file.lastModifiedFormatted, 'Date unknown')}</span>
                </div>
            `
            : '<div class="file-meta"><span>Folder</span></div>';
        
        // Generate thumbnail for grid view
        let iconContent;
        if (hasThumbnail) {
            const fileExt = file.name.split('.').pop().toLowerCase();
            const isPdf = fileExt === 'pdf';
            const loadingClass = isPdf ? 'pdf-loading' : 'image-loading';
            iconContent = `<img class="file-thumbnail loading ${loadingClass}" data-file-path="${file.path}" alt="${file.name}" />`;
        } else {
            iconContent = `<i class="${iconClass}"></i>`;
        }
        
        const itemClasses = [
            'file-item',
            file.type === 'directory' ? 'directory-item' : '',
            hasThumbnail ? 'has-thumbnail' : ''
        ].filter(Boolean).join(' ');
        
        const iconClasses = [
            'file-icon',
            iconType,
            hasThumbnail ? 'has-thumbnail' : ''
        ].filter(Boolean).join(' ');
        
        return `
            <div class="${itemClasses}" data-file-index="${index}">
                <div class="${iconClasses}">
                    ${iconContent}
                </div>
                <div class="file-info">
                    <div class="file-name" title="${file.name}">${viewMode === 'grid' ? truncateFilename(file.name) : file.name}</div>
                    ${metaData}
                </div>
                <div class="file-actions">
                    ${actions}
                </div>
            </div>
        `;
    }).join('');
    
    elements.fileList.innerHTML = html;
    elements.fileList.className = `file-list ${viewMode === 'grid' ? 'grid-view' : ''}`;
    
    // Initialize thumbnail lazy loading for grid view
    if (viewMode === 'grid') {
        initThumbnailLazyLoading();
        
        // Observe all thumbnail images for lazy loading
        document.querySelectorAll('.file-thumbnail[data-file-path]').forEach(img => {
            if (thumbnailObserver) {
                thumbnailObserver.observe(img);
            } else {
                // Fallback for browsers without IntersectionObserver
                const filePath = img.dataset.filePath;
                if (filePath) {
                    loadThumbnail(img, filePath);
                }
            }
        });
    }
    
    // Add event listeners after DOM is updated
    addFileEventListeners();
};

// Add event listeners to file items
const addFileEventListeners = () => {
    // Add click listeners for directories
    document.querySelectorAll('.directory-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            // Don't trigger if clicking on action buttons
            if (e.target.closest('.action-btn')) {
                return;
            }
            
            const fileIndex = parseInt(item.getAttribute('data-file-index'));
            const file = displayFiles[fileIndex];
            if (file && file.type === 'directory') {
                console.log('Navigating to directory:', file.path);
                loadDirectory(file.path, 1, true); // Reset pagination when navigating to subdirectory
            }
        });
    });
    
    // Add click listeners for file names and thumbnails to open preview
    document.querySelectorAll('.file-item:not(.directory-item)').forEach((item) => {
        const fileIndex = parseInt(item.getAttribute('data-file-index'));
        const file = displayFiles[fileIndex];
        
        if (file && file.type === 'file') {
            // Add click handler for file name
            const fileName = item.querySelector('.file-name');
            if (fileName) {
                fileName.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('Opening preview for file:', file.path);
                    showFilePreview(file.path, file.name);
                });
                
                // Add hover effect for file names
                fileName.style.cursor = 'pointer';
            }
            
            // Add click handler for thumbnails
            const thumbnail = item.querySelector('.file-thumbnail, .file-icon');
            if (thumbnail) {
                thumbnail.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('Opening preview for file:', file.path);
                    showFilePreview(file.path, file.name);
                });
                
                // Add hover effect for thumbnails/icons
                thumbnail.style.cursor = 'pointer';
            }
        }
    });
    
    // Add click listeners for download buttons
    document.querySelectorAll('.download-btn').forEach((button) => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileIndex = parseInt(button.getAttribute('data-file-index'));
            const file = displayFiles[fileIndex];
            if (file) {
                console.log('Downloading file:', file.path);
                downloadFile(file.path);
            }
        });
    });
    
    // Add click listeners for info buttons
    document.querySelectorAll('.info-btn').forEach((button) => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileIndex = parseInt(button.getAttribute('data-file-index'));
            const file = displayFiles[fileIndex];
            if (file) {
                console.log('Showing file info:', file.path);
                showFileInfo(file.path);
            }
        });
    });
    
    // Add click listeners for preview buttons
    document.querySelectorAll('.preview-btn').forEach((button) => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileIndex = parseInt(button.getAttribute('data-file-index'));
            const file = displayFiles[fileIndex];
            if (file) {
                console.log('Showing file preview:', file.path);
                showFilePreview(file.path, file.name);
            }
        });
    });
};

const updateUI = () => {
    // Update item count based on pagination data and search filter
    if (paginationData) {
        const { totalItems, startIndex, endIndex } = paginationData;
        const searchSuffix = searchTerm ? ` (filtered from ${currentFiles.length})` : '';
        elements.itemCount.textContent = `Showing ${startIndex}-${endIndex} of ${totalItems} items${searchSuffix}`;
    } else {
        const count = searchTerm ? displayFiles.length : currentFiles.length;
        const searchSuffix = searchTerm ? ` (filtered from ${currentFiles.length})` : '';
        elements.itemCount.textContent = `${count} item${count !== 1 ? 's' : ''}${searchSuffix}`;
    }
    
    // Update current path
    elements.currentPathSpan.textContent = formatPath(currentPath);
    
    // Update back button
    elements.backBtn.disabled = !currentPath;
};

const updatePagination = () => {
    if (!paginationData || paginationData.totalItems === 0) {
        // Hide pagination if no items or pagination data
        hideElement(elements.paginationTop);
        hideElement(elements.paginationBottom);
        return;
    }
    
    const { currentPage, totalPages, totalItems, itemsPerPage, hasNextPage, hasPrevPage, startIndex, endIndex } = paginationData;
    
    // Show pagination controls if there's more than one page
    if (totalPages > 1) {
        showElement(elements.paginationTop);
        showElement(elements.paginationBottom);
    } else {
        hideElement(elements.paginationTop);
        hideElement(elements.paginationBottom);
        return;
    }
    
    // Update pagination info
    const infoText = `Showing ${startIndex}-${endIndex} of ${totalItems} items`;
    elements.paginationInfo.textContent = infoText;
    elements.paginationInfoBottom.textContent = infoText;
    
    // Update navigation buttons
    updatePaginationButtons(currentPage, totalPages, hasPrevPage, hasNextPage);
    
    // Update page numbers
    updatePageNumbers(currentPage, totalPages);
};

const updatePaginationButtons = (currentPage, totalPages, hasPrevPage, hasNextPage) => {
    // Update top pagination buttons
    elements.firstPageBtn.disabled = !hasPrevPage;
    elements.prevPageBtn.disabled = !hasPrevPage;
    elements.nextPageBtn.disabled = !hasNextPage;
    elements.lastPageBtn.disabled = !hasNextPage;
    
    // Update bottom pagination buttons
    elements.firstPageBtnBottom.disabled = !hasPrevPage;
    elements.prevPageBtnBottom.disabled = !hasPrevPage;
    elements.nextPageBtnBottom.disabled = !hasNextPage;
    elements.lastPageBtnBottom.disabled = !hasNextPage;
};

const updatePageNumbers = (currentPage, totalPages) => {
    const maxVisiblePages = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust if we're near the end
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    let html = '';
    
    // Add ellipsis at beginning if needed
    if (startPage > 1) {
        html += `<button class="btn btn-sm page-number-btn" data-page="1">1</button>`;
        if (startPage > 2) {
            html += `<span class="page-ellipsis">...</span>`;
        }
    }
    
    // Add page numbers
    for (let i = startPage; i <= endPage; i++) {
        const isActive = i === currentPage;
        html += `<button class="btn btn-sm page-number-btn ${isActive ? 'active' : ''}" data-page="${i}" ${isActive ? 'disabled' : ''}>${i}</button>`;
    }
    
    // Add ellipsis at end if needed
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<span class="page-ellipsis">...</span>`;
        }
        html += `<button class="btn btn-sm page-number-btn" data-page="${totalPages}">${totalPages}</button>`;
    }
    
    elements.pageNumbers.innerHTML = html;
    elements.pageNumbersBottom.innerHTML = html;
    
    // Add event listeners to page number buttons
    document.querySelectorAll('.page-number-btn').forEach(button => {
        button.addEventListener('click', () => {
            const page = parseInt(button.getAttribute('data-page'));
            if (page !== currentPage) {
                loadDirectory(currentPath, page, false);
            }
        });
    });
};

const goToPage = (page) => {
    if (paginationData && page >= 1 && page <= paginationData.totalPages && page !== paginationData.currentPage) {
        currentPage = page;
        
        if (allFilesLoaded) {
            // Client-side pagination for search results
            renderFiles();
            updateUI();
            updatePagination();
        } else {
            // Server-side pagination for normal browsing
            loadDirectory(currentPath, page, false);
        }
    }
};

const changeItemsPerPage = (newLimit) => {
    itemsPerPage = newLimit;
    currentPage = 1;
    
    if (allFilesLoaded) {
        // Client-side pagination for search results
        renderFiles();
        updateUI();
        updatePagination();
    } else {
        // Server-side pagination for normal browsing
        loadDirectory(currentPath, 1, true); // Reset to first page
    }
};

const setViewMode = (mode) => {
    viewMode = mode;
    
    // Update button states
    elements.listViewBtn.classList.toggle('active', mode === 'list');
    elements.gridViewBtn.classList.toggle('active', mode === 'grid');
    
    // Re-render files with new view mode
    renderFiles();
};

const showModal = () => {
    elements.fileInfoModal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

const closeModal = () => {
    elements.fileInfoModal.classList.remove('show');
    document.body.style.overflow = '';
};

const showPreviewModal = () => {
    elements.filePreviewModal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

const closePreviewModal = () => {
    elements.filePreviewModal.classList.remove('show');
    document.body.style.overflow = '';
    // Clear preview content to free memory
    elements.filePreviewContent.innerHTML = '';
};

// File preview functionality
const showFilePreview = async (filePath, fileName) => {
    try {
        elements.previewFileName.textContent = fileName;
        
        // Show loading state
        elements.filePreviewContent.innerHTML = `
            <div class="preview-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <h3>Loading Preview...</h3>
                <p>Please wait while we prepare the file preview.</p>
            </div>
        `;
        
        showPreviewModal();
        
        // Determine file type and create appropriate preview
        const fileExtension = fileName.split('.').pop().toLowerCase();
        const downloadUrl = `/api/download?path=${encodeURIComponent(filePath)}`;
        const previewUrl = `/api/preview?path=${encodeURIComponent(filePath)}`;
        
        let previewContent = '';
        
        if (isPdfFile(fileExtension)) {
            // Try using browser's built-in PDF viewer first, with PDF.js fallback
            previewContent = `
                <div class="preview-content">
                    <iframe 
                        src="${previewUrl}#toolbar=1&navpanes=1&scrollbar=1" 
                        type="application/pdf" 
                        onload="checkIframeContent(this)" 
                        onerror="tryPdfJsFallback(this)"
                        style="width: 100%; height: 70vh; border: none;">
                        <div class="preview-loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Loading PDF...</p>
                        </div>
                    </iframe>
                </div>
            `;
        } else if (isImageFile(fileExtension)) {
            previewContent = `
                <div class="preview-content">
                    <img src="${previewUrl}" alt="${fileName}" onload="this.style.opacity=1" onerror="showImageError(this, '${downloadUrl}')" style="opacity:0;transition:opacity 0.3s">
                </div>
            `;
        } else if (isVideoFile(fileExtension)) {
            previewContent = `
                <div class="preview-content">
                    <video controls>
                        <source src="${previewUrl}" type="video/${fileExtension}">
                        Your browser doesn't support video playback.
                    </video>
                </div>
            `;
        } else if (isAudioFile(fileExtension)) {
            previewContent = `
                <div class="preview-content">
                    <audio controls>
                        <source src="${previewUrl}" type="audio/${fileExtension}">
                        Your browser doesn't support audio playback.
                    </audio>
                </div>
            `;
        } else if (isTextFile(fileExtension)) {
            // For text files, fetch content and display
            try {
                const response = await fetch(downloadUrl);
                const text = await response.text();
                const truncatedText = text.length > 50000 ? text.substring(0, 50000) + '\n\n... (File truncated for preview)' : text;
                previewContent = `
                    <div class="preview-content">
                        <div class="text-content">${escapeHtml(truncatedText)}</div>
                    </div>
                `;
            } catch (error) {
                throw new Error('Failed to load text file content');
            }
        } else {
            // Unsupported file type
            previewContent = `
                <div class="preview-not-supported">
                    <i class="fas fa-file"></i>
                    <h3>Preview Not Available</h3>
                    <p>Preview is not supported for this file type (${fileExtension.toUpperCase()}).</p>
                    <p>You can still download the file to view it in your preferred application.</p>
                </div>
            `;
        }
        
        elements.filePreviewContent.innerHTML = previewContent;
        
        // Set up modal action buttons
        elements.downloadFromPreview.onclick = () => {
            downloadFile(filePath);
        };
        
        elements.showInfoFromPreview.onclick = () => {
            closePreviewModal();
            showFileInfo(filePath);
        };
        
    } catch (error) {
        console.error('Error showing file preview:', error);
        elements.filePreviewContent.innerHTML = `
            <div class="preview-error">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Preview Error</h3>
                <p>Unable to load file preview: ${error.message}</p>
                <p>You can still download the file normally.</p>
            </div>
        `;
    }
};

// Helper functions to determine file types

const isImageFile = (ext) => {
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext);
};

const isVideoFile = (ext) => {
    return ['mp4', 'webm', 'ogg', 'avi', 'mov', 'wmv'].includes(ext);
};

const isAudioFile = (ext) => {
    return ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext);
};

const isTextFile = (ext) => {
    return ['txt', 'log', 'md', 'json', 'xml', 'csv', 'html', 'htm', 'css', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'php', 'rb', 'go', 'rs', 'sh', 'bat', 'ps1'].includes(ext);
};

const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

// Helper functions for preview error handling
window.checkIframeContent = function(iframe) {
    // Check if iframe loaded successfully after a short delay
    setTimeout(() => {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (!doc || doc.body.innerHTML.trim() === '') {
                showPdfError(iframe);
            }
        } catch (e) {
            // Cross-origin or other access issues - assume it loaded successfully
            console.log('PDF iframe loaded (cross-origin restrictions prevent content check)');
        }
    }, 1000);
};

window.tryPdfJsFallback = function(iframe) {
    // Try using PDF.js viewer as fallback
    const filePath = new URL(iframe.src).searchParams.get('path');
    const previewUrl = `/api/preview?path=${encodeURIComponent(filePath)}`;
    const pdfJsUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(previewUrl)}`;
    
    console.log('Trying PDF.js fallback for:', filePath);
    iframe.src = pdfJsUrl;
    
    // If PDF.js also fails, show error
    iframe.onerror = () => showPdfError(iframe);
};

window.showPdfError = function(iframe) {
    const parent = iframe.parentElement;
    const originalUrl = iframe.getAttribute('data-original-url') || iframe.src;
    let filePath;
    
    try {
        filePath = new URL(originalUrl).searchParams.get('path');
    } catch (e) {
        // If we can't parse the URL, extract from the current modal state
        filePath = elements.downloadFromPreview.onclick.toString().match(/downloadFile\('([^']+)'\)/)?.[1];
    }
    
    const downloadUrl = `/api/download?path=${encodeURIComponent(filePath)}`;
    const directPreviewUrl = `/api/preview?path=${encodeURIComponent(filePath)}`;
    
    parent.innerHTML = `
        <div class="preview-error">
            <i class="fas fa-file-pdf"></i>
            <h3>PDF Preview Unavailable</h3>
            <p>This PDF cannot be displayed in your browser's embedded viewer.</p>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center;">
                <a href="${directPreviewUrl}" target="_blank" class="btn btn-primary">
                    <i class="fas fa-external-link-alt"></i> Open in New Tab
                </a>
                <a href="${downloadUrl}" class="btn btn-secondary">
                    <i class="fas fa-download"></i> Download PDF
                </a>
            </div>
        </div>
    `;
};

window.showImageError = function(img, downloadUrl) {
    const parent = img.parentElement;
    parent.innerHTML = `
        <div class="preview-error">
            <i class="fas fa-image"></i>
            <h3>Image Preview Unavailable</h3>
            <p>This image cannot be displayed.</p>
            <div style="margin-top: 1rem;">
                <a href="${downloadUrl}" class="btn btn-primary">
                    <i class="fas fa-download"></i> Download Image
                </a>
            </div>
        </div>
    `;
};

// Event listeners
elements.refreshBtn.addEventListener('click', () => {
    loadDirectory(currentPath, currentPage, false);
});

elements.backBtn.addEventListener('click', () => {
    if (currentPath) {
        const parts = currentPath.split('/');
        parts.pop();
        const parentPath = parts.join('/');
        loadDirectory(parentPath, 1, true); // Reset pagination when going back
    }
});

elements.retryBtn.addEventListener('click', () => {
    loadDirectory(currentPath, currentPage, false);
});

elements.listViewBtn.addEventListener('click', () => {
    setViewMode('list');
});

elements.gridViewBtn.addEventListener('click', () => {
    setViewMode('grid');
});

// Sort dropdown event listener
elements.sortBy.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderFiles(); // Re-render with new sort
});

// Search functionality
const performSearch = async (term) => {
    const wasEmpty = !searchTerm || searchTerm.trim() === '';
    const nowEmpty = !term || term.trim() === '';
    
    searchTerm = term;
    updateSearchUI();
    
    try {
        // If we're starting a search (from empty to non-empty) and don't have all files loaded,
        // we need to reload the directory with all files
        if (wasEmpty && !nowEmpty && !allFilesLoaded) {
            showSearchLoading(true);
            await loadDirectory(currentPath, 1, false, true);
        }
        // If we're clearing search (from non-empty to empty) and have all files loaded,
        // we should reload with pagination
        else if (!wasEmpty && nowEmpty && allFilesLoaded) {
            showSearchLoading(true);
            allFilesLoaded = false;
            await loadDirectory(currentPath, 1, true, false);
        }
        // If we have search term and all files are loaded, just filter
        else if (!nowEmpty && allFilesLoaded) {
            currentPage = 1; // Reset to first page when searching
            renderFiles();
            updateUI();
            updatePagination();
        }
        // If we have search term but no files loaded, load all files
        else if (!nowEmpty && !allFilesLoaded) {
            showSearchLoading(true);
            await loadDirectory(currentPath, 1, false, true);
        }
        // Otherwise, just re-render with current data
        else {
            currentPage = 1; // Reset to first page when searching
            renderFiles();
            updateUI();
            updatePagination();
        }
    } finally {
        showSearchLoading(false);
    }
};

const showSearchLoading = (show) => {
    elements.searchLoading.style.display = show ? 'block' : 'none';
    elements.searchClear.style.display = (show || !searchTerm || searchTerm.trim() === '') ? 'none' : 'flex';
};

const clearSearch = async () => {
    if (searchTerm && searchTerm.trim() !== '') {
        // Clear the input field first
        elements.searchInput.value = '';
        // Then perform the search clear
        await performSearch('');
    }
};

const updateSearchUI = () => {
    const hasSearch = searchTerm && searchTerm.trim() !== '';
    
    // Toggle search input styling
    elements.searchInput.classList.toggle('has-text', hasSearch);
    
    // Show/hide clear button (but not if loading)
    const isLoading = elements.searchLoading.style.display === 'block';
    elements.searchClear.style.display = (hasSearch && !isLoading) ? 'flex' : 'none';
};

// Debounced search function to avoid excessive API calls
const debouncedSearch = (term) => {
    // Clear existing timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // Update UI immediately for visual feedback (but don't change searchTerm yet)
    elements.searchInput.classList.toggle('has-text', term && term.trim() !== '');
    
    // If term is empty, clear immediately
    if (!term || term.trim() === '') {
        performSearch(term);
        return;
    }
    
    // Otherwise, debounce for 300ms
    searchTimeout = setTimeout(() => {
        performSearch(term);
    }, 300);
};

// Search input event listeners
elements.searchInput.addEventListener('input', (e) => {
    const term = e.target.value;
    debouncedSearch(term);
});

// Clear search button
elements.searchClear.addEventListener('click', async () => {
    await clearSearch();
    elements.searchInput.focus();
});

// Search input keyboard shortcuts
elements.searchInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
        await clearSearch();
        elements.searchInput.blur(); // Remove focus after clearing
    }
});

elements.closeModal.addEventListener('click', closeModal);
elements.closeModalBtn.addEventListener('click', closeModal);

// Preview modal event listeners
elements.closePreviewModal.addEventListener('click', closePreviewModal);
elements.closePreviewModalBtn.addEventListener('click', closePreviewModal);

// Close modal when clicking outside
elements.fileInfoModal.addEventListener('click', (e) => {
    if (e.target === elements.fileInfoModal) {
        closeModal();
    }
});

// Close preview modal when clicking outside
elements.filePreviewModal.addEventListener('click', (e) => {
    if (e.target === elements.filePreviewModal) {
        closePreviewModal();
    }
});

// Handle escape key to close modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (elements.filePreviewModal.classList.contains('show')) {
            closePreviewModal();
        } else if (elements.fileInfoModal.classList.contains('show')) {
            closeModal();
        }
    }
});

// Pagination event listeners
elements.itemsPerPageSelect.addEventListener('change', (e) => {
    const newLimit = parseInt(e.target.value);
    changeItemsPerPage(newLimit);
});

// Top pagination buttons
elements.firstPageBtn.addEventListener('click', () => goToPage(1));
elements.prevPageBtn.addEventListener('click', () => {
    if (paginationData && paginationData.hasPrevPage) {
        goToPage(paginationData.currentPage - 1);
    }
});
elements.nextPageBtn.addEventListener('click', () => {
    if (paginationData && paginationData.hasNextPage) {
        goToPage(paginationData.currentPage + 1);
    }
});
elements.lastPageBtn.addEventListener('click', () => {
    if (paginationData) {
        goToPage(paginationData.totalPages);
    }
});

// Bottom pagination buttons
elements.firstPageBtnBottom.addEventListener('click', () => goToPage(1));
elements.prevPageBtnBottom.addEventListener('click', () => {
    if (paginationData && paginationData.hasPrevPage) {
        goToPage(paginationData.currentPage - 1);
    }
});
elements.nextPageBtnBottom.addEventListener('click', () => {
    if (paginationData && paginationData.hasNextPage) {
        goToPage(paginationData.currentPage + 1);
    }
});
elements.lastPageBtnBottom.addEventListener('click', () => {
    if (paginationData) {
        goToPage(paginationData.totalPages);
    }
});

// Functions are now handled by event listeners, no need for global declarations

// Initialize the application
const init = async () => {
    console.log('Initializing Azure SMB File Browser...');
    
    // Check PDF.js availability and log debug info
    console.log('PDF.js availability check:', {
        pdfjsLib: typeof pdfjsLib,
        available: isPdfJsAvailable(),
        timestamp: new Date().toISOString()
    });
    
    if (!isPdfJsAvailable()) {
        console.warn('PDF.js not available - PDF thumbnails will be disabled');
    }
    
    // Initialize sort dropdown to default value
    elements.sortBy.value = currentSort;
    
    // Check connection status
    await checkConnection();
    
    // Load root directory
    await loadDirectory();
    
    // Set up periodic connection check
    setInterval(checkConnection, 30000); // Check every 30 seconds
};

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}