// Application state
let currentPath = '';
let currentFiles = [];
let viewMode = 'list'; // 'list' or 'grid'
let rootFolder = null; // Will be set from server

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
    showInfoFromPreview: document.getElementById('showInfoFromPreview')
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

const loadDirectory = async (path = '') => {
    console.log('loadDirectory called with path:', path);
    showLoading();
    
    try {
        const url = `/api/browse?path=${encodeURIComponent(path)}`;
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
        
        console.log('Updated currentPath:', currentPath);
        console.log('Updated currentFiles:', currentFiles);
        
        updateBreadcrumb();
        renderFiles();
        updateUI();
        
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
            loadDirectory(path);
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
    
    // Hide empty state and show file list
    hideElement(elements.emptyState);
    
    const html = currentFiles.map((file, index) => {
        const iconClass = getFileIcon(file.name, file.type === 'directory');
        const iconType = file.type === 'directory' ? 'folder' : 'file';
        
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
        
        return `
            <div class="file-item ${file.type === 'directory' ? 'directory-item' : ''}" data-file-index="${index}">
                <div class="file-icon ${iconType}">
                    <i class="${iconClass}"></i>
                </div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
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
            const file = currentFiles[fileIndex];
            if (file && file.type === 'directory') {
                console.log('Navigating to directory:', file.path);
                loadDirectory(file.path);
            }
        });
    });
    
    // Add click listeners for download buttons
    document.querySelectorAll('.download-btn').forEach((button) => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileIndex = parseInt(button.getAttribute('data-file-index'));
            const file = currentFiles[fileIndex];
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
            const file = currentFiles[fileIndex];
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
            const file = currentFiles[fileIndex];
            if (file) {
                console.log('Showing file preview:', file.path);
                showFilePreview(file.path, file.name);
            }
        });
    });
};

const updateUI = () => {
    // Update item count
    elements.itemCount.textContent = `${currentFiles.length} item${currentFiles.length !== 1 ? 's' : ''}`;
    
    // Update current path
    elements.currentPathSpan.textContent = formatPath(currentPath);
    
    // Update back button
    elements.backBtn.disabled = !currentPath;
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
const isPdfFile = (ext) => ext === 'pdf';

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
    loadDirectory(currentPath);
});

elements.backBtn.addEventListener('click', () => {
    if (currentPath) {
        const parts = currentPath.split('/');
        parts.pop();
        const parentPath = parts.join('/');
        loadDirectory(parentPath);
    }
});

elements.retryBtn.addEventListener('click', () => {
    loadDirectory(currentPath);
});

elements.listViewBtn.addEventListener('click', () => {
    setViewMode('list');
});

elements.gridViewBtn.addEventListener('click', () => {
    setViewMode('grid');
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

// Functions are now handled by event listeners, no need for global declarations

// Initialize the application
const init = async () => {
    console.log('Initializing Azure SMB File Browser...');
    
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