/* Moved out of index.html by tools/strict_csp.py so the page can forbid inline scripts. */
        document.getElementById('openChat').addEventListener('click', function (e) {
            e.preventDefault();
            const bubble = document.querySelector('.chat-bubble, #chatBubble, [data-chat-open]');
            if (window.SiteChat && SiteChat.open) SiteChat.open(); else if (bubble) bubble.click();
        });
    
