/* Moved out of index.html by tools/strict_csp.py so the page can forbid inline scripts. */
        const video = document.getElementById('heroVideo');
        const audioBtn = document.getElementById('audioToggle');

        // Phones get a smaller copy of the video (about 0.6 MB instead of 0.9 MB).
        // The page picks one before anything downloads (preload="none" above), so phones never fetch both.
        if (window.matchMedia('(max-width: 700px)').matches) {
            video.src = 'ad1-mobile.mp4';
        }
        video.preload = 'metadata';

        // Keep the button text in sync with the video's sound
        function updateButton() {
            audioBtn.textContent = video.muted ? '🔇 Unmute' : '🔊 Mute';
        }

        // Unmute / Mute button
        audioBtn.addEventListener('click', function () {
            video.muted = !video.muted;
            video.play();
            updateButton();
        });

        // When the FIRST play finishes: mute it and loop from then on
        video.addEventListener('ended', function firstPlayDone() {
            video.removeEventListener('ended', firstPlayDone); // only do this once
            video.muted = true;
            video.loop = true;
            video.currentTime = 0;
            video.play();
            updateButton();
        });

        // Start: try with sound. Browsers often block sound until the visitor has
        // clicked the site at least once. If that happens, play muted instead.
        video.muted = false;
        video.play()
            .then(updateButton)
            .catch(function () {
                video.muted = true;
                video.play();
                updateButton();
            });
    
