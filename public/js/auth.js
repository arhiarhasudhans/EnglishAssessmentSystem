// auth.js - Shared Authentication Logic

let isLoggedOut = false;
let authCheckInterval;

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
    return null;
}

function checkAuthentication(role = 'faculty') { // 'faculty' or 'student'
    if (isLoggedOut) {
        redirectToLogin(role);
        return false;
    }

    const storageKey = role === 'faculty' ? 'loggedInFaculty' : 'loggedInStudent';
    // Students might use different keys, need to standardize or check both if generic.
    // Based on upload.html, it checks 'loggedInFaculty'. 

    const loggedInUser = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey) || getCookie(`${role}Session`);

    if (!loggedInUser) {
        redirectToLogin(role);
        return false;
    }
    return JSON.parse(loggedInUser);
}

function redirectToLogin(role) {
    isLoggedOut = true;
    clearAllAuthData();
    if (authCheckInterval) clearInterval(authCheckInterval);
    window.location.replace(`/${role}/login.html`);
}

function clearAllAuthData() {
    sessionStorage.clear();
    const authKeys = ['authToken', 'refreshToken', 'user', 'userRole', 'facultyId', 'loggedInFaculty', 'loggedInStudent', 'studentId', 'sessionId', 'facultyToken'];
    authKeys.forEach(key => localStorage.removeItem(key));
    const authCookies = ['authToken', 'sessionId', 'refreshToken', 'facultySession', 'facultyToken', 'studentSession'];
    authCookies.forEach(cookieName => {
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
    });
}

function getAuthToken() {
    return sessionStorage.getItem('authToken') || sessionStorage.getItem('facultyToken') || localStorage.getItem('authToken') || localStorage.getItem('facultyToken') || getCookie('authToken') || getCookie('facultyToken');
}

async function performLogout(role = 'faculty') {
    if (isLoggedOut) return;
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.disabled = true;
        logoutBtn.innerHTML = '<span class="logout-spinner"></span>Logging out...';
    }

    isLoggedOut = true;
    const authToken = getAuthToken();
    const apiPath = role === 'faculty' ? '/api/faculty/logout' : '/api/student/logout'; // Student logout might not exist in backend yet

    if (authToken) {
        try {
            await fetch(apiPath, { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` } });
        } catch (e) {
            console.warn('Server logout failed, proceeding with client cleanup');
        }
    }
    clearAllAuthData();
    setTimeout(() => window.location.replace(`/${role}/login.html`), 100);
}

function setupAuthCheck(role) {
    authCheckInterval = setInterval(() => !isLoggedOut && checkAuthentication(role), 30000);
}
