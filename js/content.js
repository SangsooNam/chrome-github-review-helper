// Config constants
const POLL_CONFIG = {
    INITIAL_DELAY: 300,
    RETRY_INTERVAL: 500,
    MAX_RETRIES: 20,
    MAX_WAIT_TIME: 10000  // 10 seconds max
};

const CONCURRENCY_CONFIG = {
    MAX_CONCURRENT: 5,  // Max simultaneous requests
    REQUEST_DELAY: 200  // Delay between batches (ms)
};

$(document).ready(function() {
    setTimeout(() => pollVisibility(), POLL_CONFIG.INITIAL_DELAY);
});

function pollVisibility(retryCount = 0, startTime = Date.now()) {
    // Guard: Check max retries
    if (retryCount >= POLL_CONFIG.MAX_RETRIES) {
        console.warn('Max polling retries reached. Elements may not be loaded.');
        return;
    }

    // Guard: Check max wait time
    const elapsed = Date.now() - startTime;
    if (elapsed >= POLL_CONFIG.MAX_WAIT_TIME) {
        console.warn(`Polling timeout after ${elapsed}ms`);
        return;
    }

    // Guard: Check if elements exist
    const $rows = $('.js-issue-row.js-navigation-item');
    if ($rows.length === 0) {
        setTimeout(() => pollVisibility(retryCount + 1, startTime), POLL_CONFIG.RETRY_INTERVAL);
        return;
    }

    // Collect all links first
    const links = [];
    $rows.each(function() {
        const $item = $(this);
        const $reviewStatus = $item.find(".d-inline-block > a");

        // Update the background color
        $item.css("background", $reviewStatus.text().includes("Approve") ? "#dff0d8" : "");

        const $link = $item.find('.js-navigation-open');

        // Guard: Check link validity
        if (!$link.length || !$link.attr('href') || !$link.text()) {
            console.log("Link not found or incomplete");
            return true; // Continue to next item
        }

        // Add copy button (only once)
        if ($item.find('.btn.ml-2').length === 0) {
            addCopyButton($link);
        }

        // Collect link for batch processing
        links.push($link);
    });

    // Process diffstats with concurrency control
    if (links.length > 0) {
        processDiffstatsWithConcurrency(links);
    }
}

async function processDiffstatsWithConcurrency(links) {
    const queue = [...links];
    const activeRequests = new Set();

    while (queue.length > 0 || activeRequests.size > 0) {
        // Fill up to max concurrent requests
        while (queue.length > 0 && activeRequests.size < CONCURRENCY_CONFIG.MAX_CONCURRENT) {
            const $link = queue.shift();

            // Skip if already loaded
            if ($link.next('.diffstat').length > 0) {
                continue;
            }

            const requestPromise = loadDiffstatAsync($link)
                .finally(() => {
                    activeRequests.delete(requestPromise);
                });

            activeRequests.add(requestPromise);
        }

        // Wait for at least one request to complete
        if (activeRequests.size > 0) {
            await Promise.race(activeRequests);
        }

        // Small delay between batches to avoid overwhelming server
        if (queue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, CONCURRENCY_CONFIG.REQUEST_DELAY));
        }
    }
}

function loadDiffstatAsync($link) {
    return new Promise((resolve) => {
        $.get($link.attr('href'))
            .done(function(data) {
                const tabnav = $(data).find(".tabnav-extra > .diffstat");
                if (tabnav.length > 0) {
                    $link.after(`<span style='white-space:normal' class='diffstat'>${tabnav.html()}</span>`);
                }
                resolve();
            })
            .fail(function(err) {
                console.error('Failed to load diffstat:', err);
                resolve(); // Resolve anyway to continue processing
            });
    });
}

function addCopyButton($link) {
    // Add Copy Button
    $link.after(
        $('<button>')
            .addClass('btn btn-sm ml-2')
            .css({
                'padding': '1px 12px',
                'position': 'absolute',
                'right': '10px',
                'height': '40px'
            })
            .text('Copy')
            .on('click', handleCopyClick($link))
    );
}

function handleCopyClick($link) {
    return async (e) => {
        e.preventDefault();
        try {
            const text = await navigator.clipboard.readText();
            const currentDomain = `${window.location.protocol}//${window.location.host}`;
            const prLink = `${$link.text()} ${currentDomain}${$link.attr('href')}`;

            // Check if clipboard contains PR links from this extension
            const isPRClipboard = text.split('\n').some(line =>
                line.includes('/pull/') && line.includes(currentDomain)
            );

            let newText;
            if (isPRClipboard) {
                // Clipboard has PR links - append to existing
                const lines = text.split('\n').filter(line => {
                    // Remove the line if it contains the same PR URL
                    return !line.includes($link.attr('href'));
                });
                lines.push(prLink);
                newText = lines.join('\n');
            } else {
                // Clipboard doesn't have PR links - replace entirely
                newText = prLink;
            }

            await navigator.clipboard.writeText(newText);
        } catch (err) {
            console.error('Clipboard operation failed:', err);
        }
    };
}
