// Shared by the display and ref pages: keeps text inside its box and formats scores.
(function() {
    // Shrinks each node's text until it fits the node's width (its side padding doesn't shrink).
    // Nodes need a bounded width, white-space: nowrap and overflow: hidden.
    function fit(nodes) {
        Array.from(nodes).forEach(node => {
            node.style.fontSize = '';
            if (node.clientWidth > 0 && node.scrollWidth > node.clientWidth) {
                const style = getComputedStyle(node);
                const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
                const scale = (node.clientWidth - padding) / (node.scrollWidth - padding);
                node.style.fontSize = (parseFloat(style.fontSize) * scale * 0.96) + 'px';
            }
        });
    }

    // Scores can go below zero; show a real minus sign rather than a hyphen.
    function points(value) {
        return value < 0 ? '−' + Math.abs(value) : String(value);
    }

    window.hexyFit = { fit, points };
})();
