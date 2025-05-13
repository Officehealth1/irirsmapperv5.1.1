// This is a simpler authentication check specifically for index.html
(function() {
    console.log("Auth check running for index.html");
    
    // Function to get base path
    function getBasePath() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(segment => segment.length > 0);
        const projectRepoNames = ['irismapper', 'irismapper-main', 'irismapperproplan'];
        
        if (segments.length > 0) {
            const firstSegmentLower = segments[0].toLowerCase();
            for (const repoName of projectRepoNames) {
                if (firstSegmentLower === repoName) {
                    return `/${repoName}/`;
                }
            }
        }
        return '/';
    }
    
    // Check Firebase is loaded before continuing
    function checkFirebase() {
        if (typeof firebase === 'undefined' || !firebase.auth) {
            console.log("Firebase not loaded yet, checking again in 100ms");
            setTimeout(checkFirebase, 100);
            return;
        }
        
        // Once Firebase is loaded, check auth
        firebase.auth().onAuthStateChanged((user) => {
            if (!user) {
                console.log("User not logged in, redirecting to login page");
                const basePath = getBasePath();
                window.location.href = basePath + 'login.html';
            } else {
                console.log("User authenticated:", user.email);
            }
        });
    }
    
    // Start the check
    checkFirebase();
})(); 