const { URL_EXTRACT_REGEX, IMAGE_REGEX } = require("./constants");

/**
 * Extracts all strings in a tagged template literal (styled-components, css``)
 * @param {Array} quasis - The quasis array from a template literal AST node
 * @returns {Array<string>} Array of extracted image paths
 */
function extractFromTemplateLiteral(quasis) {
  const results = [];
  quasis.forEach((q) => {
    const matches = [...q.value.raw.matchAll(URL_EXTRACT_REGEX)];
    for (const m of matches) {
      results.push(m[2]);
    }
    if (IMAGE_REGEX.test(q.value.raw)) {
      results.push(q.value.raw);
    }
  });
  return results;
}

/**
 * Extract images from JSX style object: style={{ backgroundImage: "url('/img/a.png')" }}
 * @param {Object} node - The JSX expression container node
 * @param {string} file - The file path where this node was found
 * @param {Array} imports - Array to collect found image imports
 */
function extractFromJSXStyle(node, file, imports) {
  if (!node || node.type !== "JSXExpressionContainer") return;

  const expr = node.expression;
  if (!expr || expr.type !== "ObjectExpression") return;

  expr.properties.forEach((prop) => {
    if (prop.type !== "ObjectProperty" || !prop.key || !prop.value) return;

    const keyName = prop.key.name || prop.key.value;

    if (!keyName) return;

    const isImageField =
      keyName.toLowerCase().includes("background") ||
      keyName.toLowerCase().includes("image") ||
      keyName.toLowerCase().includes("mask");

    if (!isImageField) return;

    // String literal
    if (prop.value.type === "StringLiteral") {
      const raw = prop.value.value;
      const matches = [...raw.matchAll(URL_EXTRACT_REGEX)];
      if (matches.length > 0) {
        matches.forEach((m) => {
          imports.push({
            file: file,
            source: m[2],
          });
        });
      } else if (IMAGE_REGEX.test(raw)) {
        imports.push({
          file: file,
          source: raw,
        });
      }
    }

    // Template literal
    if (prop.value.type === "TemplateLiteral") {
      extractFromTemplateLiteral(prop.value.quasis).forEach((v) => {
        imports.push({
          file: file,
          source: v,
        });
      });
    }
  });
}

module.exports = {
  extractFromTemplateLiteral,
  extractFromJSXStyle,
};
