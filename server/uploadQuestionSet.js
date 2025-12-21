// uploadQuestionSet.js - Frontend JavaScript for handling question set uploads

document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const fileInput = document.getElementById('file-input');
    const dropArea = document.getElementById('drop-area');
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const removeFile = document.getElementById('remove-file');
    const logoutBtn = document.getElementById('logout-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const uploadForm = document.getElementById('upload-form');
    const downloadTemplateBtn = document.getElementById('download-template');
    
    // Load faculty information
    loadFacultyInfo();
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Handle file drop functionality
    dropArea.addEventListener('drop', handleDrop, false);
    
    // Handle file input change
    fileInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    }, false);
    
    // Handle remove file
    removeFile.addEventListener('click', removeUploadedFile, false);
    
    // Handle logout button click
    logoutBtn.addEventListener('click', function() {
        sessionStorage.clear();
        window.location.href = '/faculty/login.html';
    });
    
    // Handle cancel button click
    cancelBtn.addEventListener('click', function() {
        window.location.href = '/faculty/dashboard.html';
    });
    
    // Handle template download
    downloadTemplateBtn.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = '/api/questions/template/download';
    });
    
    // Handle form submission
    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!fileInput.files[0]) {
            alert('Please select a file to upload.');
            return;
        }
        
        const assessmentName = document.getElementById('assessment-name').value;
        const level = document.getElementById('level').value;
        const duration = document.getElementById('duration').value;
        const passScore = document.getElementById('pass-score').value;
        const assessmentCode = document.getElementById('assessment-code').value;
        
        // Show loading state
        const submitBtn = document.querySelector('.submit-btn');
        submitBtn.textContent = 'Processing...';
        submitBtn.disabled = true;
        
        try {
            // Create FormData object
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('assessmentName', assessmentName);
            formData.append('level', level);
            formData.append('duration', duration);
            formData.append('passScore', passScore);
            formData.append('assessmentCode', assessmentCode);
            
            // Send to server
            const response = await fetch('/api/questions/upload', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Failed to upload assessment');
            }
            
            // Show success message
            alert(`Assessment "${assessmentName}" successfully uploaded with ${data.questionsCount} questions.`);
            
            // Redirect to dashboard
            window.location.href = '/faculty/dashboard.html';
            
        } catch (error) {
            console.error("Error uploading assessment:", error);
            alert(error.message || 'Error processing file. Please check the file format and try again.');
            
            // Reset button
            submitBtn.textContent = 'Upload Question Set';
            submitBtn.disabled = false;
        }
    });
});

// Load faculty information
function loadFacultyInfo() {
    const facultyNameElement = document.getElementById('faculty-name');
    const facultyRoleElement = document.getElementById('faculty-role');
    
    // Retrieve user data from session storage
    const loggedInUser = sessionStorage.getItem('loggedInFaculty');
    
    if (loggedInUser) {
        try {
            // Try to parse as JSON
            const userData = JSON.parse(loggedInUser);
            facultyNameElement.textContent = userData.fullName || userData.name || 'Unknown User';
            
            // If role is provided, display it
            if (userData.department || userData.role) {
                facultyRoleElement.textContent = userData.department || userData.role;
            }
        } catch (e) {
            // If not valid JSON, use the string directly
            facultyNameElement.textContent = loggedInUser;
        }
    } else {
        // If no data in session storage, redirect to login
        window.location.href = '/faculty/login.html';
    }
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        const fileExtension = file.name.split('.').pop().toLowerCase();
        
        // Check if file is xlsx or xls
        if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            displayFileInfo(file);
        } else {
            alert('Please upload only Excel files (.xlsx or .xls)');
        }
    }
}

function displayFileInfo(file) {
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const dropArea = document.getElementById('drop-area');
    
    // Show file information
    fileName.textContent = file.name;
    
    // Format file size
    let size = file.size;
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    
    while (size > 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    fileSize.textContent = `Size: ${size.toFixed(2)} ${units[unitIndex]}`;
    fileInfo.classList.add('active');
    
    // Change drop area styling
    dropArea.style.borderColor = '#3a55a3';
    dropArea.style.backgroundColor = '#f9faff';
}

function removeUploadedFile() {
    const fileInput = document.getElementById('file-input');
    const fileInfo = document.getElementById('file-info');
    const dropArea = document.getElementById('drop-area');
    
    // Reset file input
    fileInput.value = '';
    
    // Hide file info
    fileInfo.classList.remove('active');
    
    // Reset drop area styling
    dropArea.style.borderColor = '#d0d0d0';
    dropArea.style.backgroundColor = '';
}