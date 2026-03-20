/**
 * Output Formatter for CLI
 * 
 * Provides consistent formatting, styling, and display utilities for CLI output
 * with support for tables, JSON, colors, and various display formats.
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const boxen = require('boxen');
const columnify = require('columnify');
const stripAnsi = require('strip-ansi');

/**
 * OutputFormatter class
 */
class OutputFormatter {
  constructor(options = {}) {
    this.options = {
      colorEnabled: process.stdout.isTTY && process.env.NODE_ENV !== 'test',
      dateFormat: 'YYYY-MM-DD HH:mm:ss',
      maxWidth: process.stdout.columns || 120,
      indent: '  ',
      ...options
    };
    
    // Color theme
    this.colors = {
      primary: chalk.blue,
      secondary: chalk.cyan,
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red,
      info: chalk.blue,
      debug: chalk.gray,
      muted: chalk.gray,
      highlight: chalk.bold,
      accent: chalk.magenta
    };
  }

  /**
   * Apply color if colors are enabled
   * @param {Function} colorFn - Chalk color function
   * @param {string} text - Text to color
   * @returns {string} Colored or plain text
   */
  color(colorFn, text) {
    return this.options.colorEnabled ? colorFn(text) : text;
  }

  /**
   * Format a title with decorative styling
   * @param {string} title - Title text
   * @param {Object} options - Formatting options
   * @returns {string} Formatted title
   */
  title(title, options = {}) {
    const {
      style = 'double',
      padding = 1,
      margin = 1,
      color = this.colors.primary,
      align = 'center'
    } = options;

    const titleText = this.color(color.bold, title);
    
    return boxen(titleText, {
      borderStyle: style,
      padding,
      margin,
      align,
      borderColor: this.options.colorEnabled ? 'blue' : undefined
    });
  }

  /**
   * Format a section header
   * @param {string} header - Header text
   * @param {Object} options - Formatting options
   * @returns {string} Formatted header
   */
  header(header, options = {}) {
    const {
      level = 1,
      color = this.colors.primary,
      underline = true
    } = options;

    const headerText = this.color(color.bold, header);
    
    if (underline && level === 1) {
      const underlineChar = '=';
      const underlineText = underlineChar.repeat(stripAnsi(headerText).length);
      return `${headerText}\n${this.color(color, underlineText)}`;
    } else if (underline && level === 2) {
      const underlineChar = '-';
      const underlineText = underlineChar.repeat(stripAnsi(headerText).length);
      return `${headerText}\n${this.color(color, underlineText)}`;
    }
    
    return headerText;
  }

  /**
   * Format a list of items
   * @param {Array} items - List items
   * @param {Object} options - Formatting options
   * @returns {string} Formatted list
   */
  list(items, options = {}) {
    const {
      style = 'bullet', // bullet, number, dash, arrow
      indent = this.options.indent,
      color = this.colors.primary
    } = options;

    const markers = {
      bullet: '•',
      dash: '-',
      arrow: '→',
      check: '✓',
      cross: '✗'
    };

    return items.map((item, index) => {
      let marker;
      
      if (style === 'number') {
        marker = `${index + 1}.`;
      } else {
        marker = markers[style] || markers.bullet;
      }
      
      const coloredMarker = this.color(color, marker);
      return `${indent}${coloredMarker} ${item}`;
    }).join('\n');
  }

  /**
   * Format key-value pairs
   * @param {Object} data - Key-value data
   * @param {Object} options - Formatting options
   * @returns {string} Formatted key-value pairs
   */
  keyValue(data, options = {}) {
    const {
      indent = this.options.indent,
      keyColor = this.colors.secondary,
      valueColor = this.colors.primary,
      separator = ':',
      alignment = 'left'
    } = options;

    const entries = Object.entries(data);
    const maxKeyLength = Math.max(...entries.map(([key]) => key.length));
    
    return entries.map(([key, value]) => {
      const formattedKey = this.color(keyColor.bold, key.padEnd(maxKeyLength));
      const formattedValue = this.formatValue(value, valueColor);
      return `${indent}${formattedKey}${separator} ${formattedValue}`;
    }).join('\n');
  }

  /**
   * Display key-value pairs (console output)
   * @param {Object} data - Key-value data
   * @param {Object} options - Formatting options
   */
  displayKeyValue(data, options = {}) {
    console.log(this.keyValue(data, options));
  }

  /**
   * Format a value based on its type
   * @param {*} value - Value to format
   * @param {Function} color - Color function
   * @returns {string} Formatted value
   */
  formatValue(value, color = this.colors.primary) {
    if (value === null) {
      return this.color(this.colors.muted, 'null');
    }
    
    if (value === undefined) {
      return this.color(this.colors.muted, 'undefined');
    }
    
    if (typeof value === 'boolean') {
      return this.color(value ? this.colors.success : this.colors.error, value.toString());
    }
    
    if (typeof value === 'number') {
      return this.color(this.colors.accent, value.toLocaleString());
    }
    
    if (value instanceof Date) {
      return this.color(color, value.toISOString());
    }
    
    if (Array.isArray(value)) {
      return this.color(color, `[${value.length} items]`);
    }
    
    if (typeof value === 'object') {
      return this.color(color, '{object}');
    }
    
    return this.color(color, value.toString());
  }

  /**
   * Create a formatted table
   * @param {Array} data - Table data
   * @param {Object} options - Table options
   * @returns {Table} Table instance
   */
  table(data, options = {}) {
    const {
      headers = null,
      style = 'grid',
      colors = true,
      wordWrap = true,
      maxWidth = this.options.maxWidth
    } = options;

    const tableStyles = {
      grid: {
        'top': '═',
        'top-mid': '╤',
        'top-left': '╔',
        'top-right': '╗',
        'bottom': '═',
        'bottom-mid': '╧',
        'bottom-left': '╚',
        'bottom-right': '╝',
        'left': '║',
        'left-mid': '╟',
        'mid': '─',
        'mid-mid': '┼',
        'right': '║',
        'right-mid': '╢',
        'middle': '│'
      },
      simple: {
        'top': '',
        'top-mid': '',
        'top-left': '',
        'top-right': '',
        'bottom': '',
        'bottom-mid': '',
        'bottom-left': '',
        'bottom-right': '',
        'left': '',
        'left-mid': '',
        'mid': '',
        'mid-mid': '',
        'right': '',
        'right-mid': '',
        'middle': ' │ '
      },
      minimal: false
    };

    const tableOptions = {
      chars: tableStyles[style] || tableStyles.grid,
      style: {
        'padding-left': 1,
        'padding-right': 1,
        head: colors && this.options.colorEnabled ? ['blue'] : [],
        border: colors && this.options.colorEnabled ? ['gray'] : []
      },
      wordWrap: wordWrap,
      colWidths: options.colWidths
    };

    if (headers) {
      tableOptions.head = headers;
    }

    const table = new Table(tableOptions);
    
    // Add data rows
    if (Array.isArray(data)) {
      data.forEach(row => {
        if (Array.isArray(row)) {
          table.push(row);
        } else if (typeof row === 'object') {
          table.push(Object.values(row));
        }
      });
    }
    
    return table;
  }

  /**
   * Format JSON with syntax highlighting
   * @param {*} data - Data to format as JSON
   * @param {Object} options - Formatting options
   * @returns {string} Formatted JSON
   */
  json(data, options = {}) {
    const {
      indent = 2,
      colors = true
    } = options;

    const jsonString = JSON.stringify(data, null, indent);
    
    if (!colors || !this.options.colorEnabled) {
      return jsonString;
    }

    // Simple JSON syntax highlighting
    return jsonString
      .replace(/"([^"]+)":/g, this.colors.secondary.bold('"$1"') + ':')
      .replace(/: "([^"]+)"/g, ': ' + this.colors.primary('"$1"'))
      .replace(/: (\d+)/g, ': ' + this.colors.accent('$1'))
      .replace(/: (true|false)/g, ': ' + this.colors.success('$1'))
      .replace(/: null/g, ': ' + this.colors.muted('null'));
  }

  /**
   * Format a status message with icon
   * @param {string} status - Status type
   * @param {string} message - Status message
   * @param {Object} options - Formatting options
   * @returns {string} Formatted status
   */
  status(status, message, options = {}) {
    const {
      showIcon = true,
      timestamp = false
    } = options;

    const statusConfig = {
      success: { icon: '✅', color: this.colors.success },
      error: { icon: '❌', color: this.colors.error },
      warning: { icon: '⚠️', color: this.colors.warning },
      info: { icon: 'ℹ️', color: this.colors.info },
      loading: { icon: '⏳', color: this.colors.primary },
      complete: { icon: '🎉', color: this.colors.success }
    };

    const config = statusConfig[status] || statusConfig.info;
    const icon = showIcon ? `${config.icon} ` : '';
    const coloredMessage = this.color(config.color, message);
    const timestampStr = timestamp ? ` [${new Date().toLocaleTimeString()}]` : '';
    
    return `${icon}${coloredMessage}${timestampStr}`;
  }

  /**
   * Format file size in human readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  fileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration in human readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  duration(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }

  /**
   * Format percentage with color coding
   * @param {number} value - Percentage value (0-100)
   * @param {Object} options - Formatting options
   * @returns {string} Formatted percentage
   */
  percentage(value, options = {}) {
    const {
      precision = 1,
      showSign = true,
      colorThresholds = { good: 80, warning: 60 }
    } = options;

    const percentage = value.toFixed(precision);
    const sign = showSign ? '%' : '';
    
    let color = this.colors.primary;
    if (value >= colorThresholds.good) {
      color = this.colors.success;
    } else if (value >= colorThresholds.warning) {
      color = this.colors.warning;
    } else {
      color = this.colors.error;
    }
    
    return this.color(color, `${percentage}${sign}`);
  }

  /**
   * Create a progress bar string
   * @param {number} current - Current value
   * @param {number} total - Total value
   * @param {Object} options - Progress bar options
   * @returns {string} Progress bar string
   */
  progressBar(current, total, options = {}) {
    const {
      width = 20,
      completeChar = '█',
      incompleteChar = '░',
      showPercentage = true,
      color = this.colors.primary
    } = options;

    const percentage = Math.min(100, Math.max(0, (current / total) * 100));
    const completed = Math.floor((percentage / 100) * width);
    const remaining = width - completed;
    
    const completeSection = this.color(color, completeChar.repeat(completed));
    const incompleteSection = this.color(this.colors.muted, incompleteChar.repeat(remaining));
    
    const bar = `[${completeSection}${incompleteSection}]`;
    const percentageText = showPercentage ? ` ${percentage.toFixed(1)}%` : '';
    
    return `${bar}${percentageText}`;
  }

  /**
   * Format metrics to CSV
   * @param {Object} metrics - Metrics data
   * @returns {string} CSV formatted metrics
   */
  metricsToCSV(metrics) {
    const rows = [];
    rows.push('timestamp,metric,type,value,tags');
    
    Object.entries(metrics.metrics || {}).forEach(([key, metric]) => {
      const timestamp = metrics.timestamp || Date.now();
      const tags = JSON.stringify(metric.tags || {}).replace(/"/g, '""');
      const value = metric.value || metric.count || metric.sum || 0;
      
      rows.push(`${timestamp},"${metric.name}","${metric.type}",${value},"${tags}"`);
    });
    
    return rows.join('\n');
  }

  /**
   * Format data as columns
   * @param {Array} data - Data to columnify
   * @param {Object} options - Column options
   * @returns {string} Columnified data
   */
  columns(data, options = {}) {
    const defaultOptions = {
      columnSplitter: ' │ ',
      config: {},
      maxWidth: this.options.maxWidth,
      truncate: true,
      ...options
    };

    return columnify(data, defaultOptions);
  }

  /**
   * Create a separator line
   * @param {Object} options - Separator options
   * @returns {string} Separator line
   */
  separator(options = {}) {
    const {
      char = '─',
      length = this.options.maxWidth - 4,
      color = this.colors.muted
    } = options;

    return this.color(color, char.repeat(length));
  }

  /**
   * Format text with word wrap
   * @param {string} text - Text to wrap
   * @param {Object} options - Wrap options
   * @returns {string} Wrapped text
   */
  wrap(text, options = {}) {
    const {
      width = this.options.maxWidth - 4,
      indent = ''
    } = options;

    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      if ((currentLine + word).length <= width) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(indent + currentLine);
        }
        currentLine = word;
      }
    });

    if (currentLine) {
      lines.push(indent + currentLine);
    }

    return lines.join('\n');
  }

  /**
   * Clear the console
   */
  clear() {
    console.clear();
  }

  /**
   * Move cursor to specific position
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  moveCursor(x, y) {
    process.stdout.write(`\x1b[${y};${x}H`);
  }

  /**
   * Hide cursor
   */
  hideCursor() {
    process.stdout.write('\x1b[?25l');
  }

  /**
   * Show cursor
   */
  showCursor() {
    process.stdout.write('\x1b[?25h');
  }
}

module.exports = { OutputFormatter };