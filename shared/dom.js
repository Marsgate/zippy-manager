(function() {
    function createElement(tagName, options = {}) {
        const element = document.createElement(tagName);

        if (options.className) {
            element.className = options.className;
        }

        if (options.text !== undefined) {
            element.textContent = String(options.text);
        }

        return element;
    }

    function createTableRow(cells, className = '') {
        const row = createElement('tr', { className: className });

        cells.forEach(cell => {
            row.appendChild(createElement('td', { text: cell }));
        });

        return row;
    }

    function replaceTableBodyRows(table, rows) {
        table.find('tr:gt(0)').remove();
        rows.forEach(row => {
            table.append(row);
        });
    }

    window.domUtils = {
        createElement: createElement,
        createTableRow: createTableRow,
        replaceTableBodyRows: replaceTableBodyRows
    };
})();
