// Admin Panel Functionality with Firebase
document.addEventListener('DOMContentLoaded', function() {
    console.log("Admin JS loaded with Firebase");
    
    // Check if Firebase is initialized
    if (!firebase || !firebase.firestore) {
        console.error("Firebase is not initialized. Please check firebase-config.js");
        return;
    }
    
    // Wait for auth state to be determined
    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            // Not signed in, redirect to login
            window.location.href = 'login.html';
            return;
        }
        
        // Check if user is admin
        const isAdmin = await window.checkAdminStatus();
        
        if (!isAdmin) {
            // Not an admin, redirect to login
            console.log("User is not an admin, redirecting to login");
            await firebase.auth().signOut();
            window.location.href = 'login.html';
            return;
        }
        
        // Display admin email
        const emailDisplay = document.getElementById('admin-email-display');
        if (emailDisplay) {
            emailDisplay.textContent = user.email;
        }
        
        // Initialize tabs
        initTabs();
        
        // Setup create user form
        const createUserForm = document.getElementById('create-user-form');
        if (createUserForm) {
            createUserForm.addEventListener('submit', handleCreateUser);
        }
        
        // Password generator
        const generatePasswordBtn = document.getElementById('generate-password');
        if (generatePasswordBtn) {
            generatePasswordBtn.addEventListener('click', generateRandomPassword);
        }
        
        // Load users in manage tab
        loadUsers();
        setupUserFilters();
        setupTableSort();
        
        // Setup logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async function() {
                await firebase.auth().signOut();
                window.location.href = 'login.html';
            });
        }
    });
});

// Tab Functionality
function initTabs() {
    console.log("Initializing tabs");
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    if (tabButtons.length === 0) {
        console.error("No tab buttons found");
        return;
    }
    
    console.log("Found tab buttons:", tabButtons.length);
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            console.log("Tab clicked:", tabId);
            
            // Remove active class from all buttons
            tabButtons.forEach(b => b.classList.remove('active'));
            
            // Add active class to clicked button
            this.classList.add('active');
            
            // Hide all tab contents
            tabContents.forEach(content => content.classList.add('hidden'));
            
            // Show selected tab content
            const selectedTab = document.getElementById(tabId);
            if (selectedTab) {
                selectedTab.classList.remove('hidden');
                
                // If manage users tab, refresh the list
                if (tabId === 'manage-users') {
                    loadUsers();
                }
            } else {
                console.error("Tab content not found:", tabId);
            }
        });
    });
}

// Create New User
async function handleCreateUser(e) {
    e.preventDefault();
    console.log("Create user form submitted");
    
    const name = document.getElementById('new-name').value.trim();
    const email = document.getElementById('new-email').value.trim();
    const password = document.getElementById('new-password').value;
    const errorMsg = document.getElementById('create-error');
    const successMsg = document.getElementById('create-success');
    
    // Simple validation
    if (!name || !email || !password) {
        window.showError(errorMsg, 'All fields are required');
        return;
    }
    
    if (password.length < 8) {
        window.showError(errorMsg, 'Password must be at least 8 characters');
        return;
    }
    
    // Get current user (admin)
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
        window.showError(errorMsg, 'Admin authentication lost. Please log in again.');
        return;
    }
    
    // Create new user data
    const userData = {
        name: name,
        email: email,
        password: password,
        status: 'active',
        isAdmin: false,
        modifiedBy: currentUser.email
    };
    
    try {
        // Disable form while processing
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        
        // Create user in Firebase
        const result = await window.createUser(userData);
        
        if (!result.success) {
            window.showError(errorMsg, result.error || 'Failed to create user');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create User';
            return;
        }
        
        // Show success message
        window.showSuccess(successMsg, `User ${name} created successfully`);
        
        // Clear form
        document.getElementById('new-name').value = '';
        document.getElementById('new-email').value = '';
        document.getElementById('new-password').value = '';
        
        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create User';
        
        // Refresh user list
        loadUsers();
    } catch (error) {
        console.error("Error creating user:", error);
        window.showError(errorMsg, error.message || 'An error occurred while creating the user');
        
        // Re-enable form
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create User';
    }
}

// Generate Random Password
function generateRandomPassword() {
    if (typeof window.generateRandomPassword === 'function') {
        const password = window.generateRandomPassword();
        document.getElementById('new-password').value = password;
    } else {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
        let password = '';
        
        // Generate random password with 12 characters
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        // Set password field
        document.getElementById('new-password').value = password;
    }
}

// Load and Display Users
async function loadUsers() {
    console.log("Loading users from Firebase...");
    
    const tableBody = document.querySelector('#users-table tbody');
    const noUsersMessage = document.getElementById('no-users-message');
    
    if (!tableBody || !noUsersMessage) {
        console.error("Table body or no users message element not found");
        return;
    }
    
    // Show loading indicator
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center">Loading users...</td></tr>';
    
    try {
        // Get users from Firebase via function in auth.js
        const users = await window.getUsers();
        
        // Clear existing rows
        tableBody.innerHTML = '';
        
        if (!users || users.length === 0) {
            // Show no users message
            noUsersMessage.classList.remove('hidden');
            return;
        }
        
        // Hide no users message
        noUsersMessage.classList.add('hidden');
        
        // Filter users based on checkboxes
        const showActive = document.getElementById('show-active')?.checked ?? true;
        const showInactive = document.getElementById('show-inactive')?.checked ?? true;
        const searchText = document.getElementById('user-search')?.value?.toLowerCase() ?? '';
        
        const filteredUsers = users.filter(user => {
            // Filter by status
            if (user.status === 'active' && !showActive) return false;
            if (user.status === 'inactive' && !showInactive) return false;
            
            // Filter by search text
            if (searchText) {
                return (user.name?.toLowerCase().includes(searchText) || 
                       user.email?.toLowerCase().includes(searchText));
            }
            
            return true;
        });
        
        console.log(`Filtered users: ${filteredUsers.length} of ${users.length}`);
        
        // Sort users (default by name)
        let sortField = localStorage.getItem('usersSortField') || 'name';
        let sortDirection = localStorage.getItem('usersSortDirection') || 'asc';
        
        const sortedUsers = sortUsers(filteredUsers, sortField, sortDirection);
        
        // Update sort indicators
        updateSortIndicators(sortField, sortDirection);
        
        // Add rows for each user
        sortedUsers.forEach(user => {
            // Skip the admin user in the table
            if (user.isAdmin) return;
            
            const row = document.createElement('tr');
            row.dataset.userId = user.id;
            
            // Name column
            const nameCell = document.createElement('td');
            nameCell.textContent = user.name || 'No name';
            row.appendChild(nameCell);
            
            // Email column
            const emailCell = document.createElement('td');
            emailCell.textContent = user.email || 'No email';
            row.appendChild(emailCell);
            
            // Created date column
            const createdCell = document.createElement('td');
            if (user.createdAt) {
                const createdDate = new Date(user.createdAt);
                createdCell.textContent = createdDate.toLocaleDateString();
            } else {
                createdCell.textContent = 'Unknown';
            }
            row.appendChild(createdCell);
            
            // Status column
            const statusCell = document.createElement('td');
            statusCell.innerHTML = user.status === 'active' ? 
                '<span class="status-active">Active</span>' : 
                '<span class="status-inactive">Inactive</span>';
            row.appendChild(statusCell);
            
            // Actions column
            const actionsCell = document.createElement('td');
            
            // Status toggle
            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'status-toggle';
            
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = user.status === 'active';
            toggleInput.addEventListener('change', () => toggleUserStatus(user.id));
            
            const toggleSlider = document.createElement('span');
            toggleSlider.className = 'status-slider';
            
            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(toggleSlider);
            actionsCell.appendChild(toggleLabel);
            
            row.appendChild(actionsCell);
            
            // Add row to table
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading users:", error);
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error loading users: ${error.message}</td></tr>`;
    }
}

// Toggle User Status
async function toggleUserStatus(userId) {
    console.log("Toggling status for user:", userId);
    
    // Show confirmation modal
    const modal = document.getElementById('confirm-modal');
    const message = document.getElementById('confirm-message');
    const yesBtn = document.getElementById('confirm-yes');
    const noBtn = document.getElementById('confirm-no');
    
    if (!modal || !message || !yesBtn || !noBtn) {
        console.error("Modal elements not found");
        return;
    }
    
    try {
        // Get users from Firebase
        const users = await window.getUsers();
        const user = users.find(u => u.id === userId);
        
        if (!user) {
            console.error("User not found:", userId);
            return;
        }
        
        const newStatus = user.status === 'active' ? 'inactive' : 'active';
        
        // Set confirmation message
        message.textContent = `Are you sure you want to change ${user.name}'s status to ${newStatus}?`;
        
        // Show modal
        modal.style.display = 'block';
        
        // Remove old event listeners by cloning and replacing buttons
        const newYesBtn = yesBtn.cloneNode(true);
        const newNoBtn = noBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
        noBtn.parentNode.replaceChild(newNoBtn, noBtn);
        
        // Add event listeners
        newYesBtn.addEventListener('click', async () => {
            try {
                // Disable buttons
                newYesBtn.disabled = true;
                newNoBtn.disabled = true;
                
                // Get current admin
                const currentUser = firebase.auth().currentUser;
                
                // Update user status in Firebase
                const result = await window.updateUserStatus(
                    userId, 
                    newStatus, 
                    currentUser ? currentUser.email : 'unknown'
                );
                
                if (!result.success) {
                    console.error("Failed to update user status:", result.error);
                    alert(`Failed to update status: ${result.error}`);
                }
                
                // Close modal
                modal.style.display = 'none';
                
                // Reload users
                loadUsers();
            } catch (error) {
                console.error("Error updating user status:", error);
                alert(`Error updating status: ${error.message}`);
                
                // Close modal
                modal.style.display = 'none';
                
                // Reload users
                loadUsers();
            }
        });
        
        newNoBtn.addEventListener('click', () => {
            // Close modal
            modal.style.display = 'none';
            
            // Reload users to reset checkbox
            loadUsers();
        });
        
        // Close modal when clicking outside
        window.onclick = function(event) {
            if (event.target === modal) {
                modal.style.display = 'none';
                loadUsers(); // Reload to reset checkbox
            }
        };
    } catch (error) {
        console.error("Error preparing status toggle:", error);
        alert(`Error: ${error.message}`);
        loadUsers(); // Reload to reset checkbox
    }
}

// Setup User Filters
function setupUserFilters() {
    const showActive = document.getElementById('show-active');
    const showInactive = document.getElementById('show-inactive');
    const searchInput = document.getElementById('user-search');
    
    // Add event listeners if elements exist
    if (showActive) {
        showActive.addEventListener('change', loadUsers);
    }
    
    if (showInactive) {
        showInactive.addEventListener('change', loadUsers);
    }
    
    // Search with debounce
    if (searchInput) {
        let timeout = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(loadUsers, 300);
        });
    }
}

// Sort Users
function sortUsers(users, field, direction) {
    return [...users].sort((a, b) => {
        let valueA, valueB;
        
        // Handle different field types
        switch (field) {
            case 'name':
            case 'email':
                valueA = (a[field] || '').toLowerCase();
                valueB = (b[field] || '').toLowerCase();
                break;
            case 'createdAt':
                valueA = a[field] ? new Date(a[field]).getTime() : 0;
                valueB = b[field] ? new Date(b[field]).getTime() : 0;
                break;
            case 'status':
                valueA = a[field] || '';
                valueB = b[field] || '';
                break;
            default:
                valueA = a[field] || '';
                valueB = b[field] || '';
        }
        
        // Compare values
        if (valueA < valueB) return direction === 'asc' ? -1 : 1;
        if (valueA > valueB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

// Setup Table Sorting
function setupTableSort() {
    const tableHeaders = document.querySelectorAll('#users-table th[data-sort]');
    
    if (tableHeaders.length === 0) {
        console.error("No sortable table headers found");
        return;
    }
    
    // Current sort
    const currentField = localStorage.getItem('usersSortField') || 'name';
    const currentDirection = localStorage.getItem('usersSortDirection') || 'asc';
    
    // Add click event to headers
    tableHeaders.forEach(header => {
        const field = header.getAttribute('data-sort');
        
        header.addEventListener('click', () => {
            console.log("Sorting by:", field);
            let direction = 'asc';
            
            // Toggle direction if already sorted by this field
            if (field === currentField) {
                direction = currentDirection === 'asc' ? 'desc' : 'asc';
            }
            
            // Save sort preferences
            localStorage.setItem('usersSortField', field);
            localStorage.setItem('usersSortDirection', direction);
            
            // Reload users with new sort
            loadUsers();
        });
    });
}

// Update Sort Indicators
function updateSortIndicators(field, direction) {
    const tableHeaders = document.querySelectorAll('#users-table th');
    
    if (tableHeaders.length === 0) return;
    
    // Reset all headers
    tableHeaders.forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Set active sort header
    const activeHeader = document.querySelector(`#users-table th[data-sort="${field}"]`);
    if (activeHeader) {
        activeHeader.classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }
}

// Also fix issues with missing functions from auth.js that might be needed
// These are fallback implementations in case auth.js doesn't define them

// Show success message if not defined in auth.js
if (typeof showSuccess !== 'function') {
    function showSuccess(element, message) {
        element.textContent = message;
        element.classList.add('active');
        
        // Hide after 3 seconds
        setTimeout(() => {
            element.classList.remove('active');
        }, 3000);
    }
}

// Generate ID if not defined in auth.js
if (typeof generateId !== 'function') {
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
} 