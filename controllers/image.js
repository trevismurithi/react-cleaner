const fg = require("fast-glob");
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const Table = require("cli-table3");
const { getCssImages } = require("../utils/cssImages");
const { askDeleteFiles } = require("../utils/utils");

// Regex for matching url("x.png") or url('x.png') or bg-[url('x.png')]
const URL_EXTRACT_REGEX = /url\((['"]?)([^"')]+)\1\)/gi;

// Normal image file regex
const IMAGE_REGEX = /\.(png|jpe?g|svg|gif|webp)$/i;

/**
 * Normalize image paths for consistent matching.
 */
function normalize(value, imageDirectory) {
  if (!value) return null;

  // Extract url() paths
  const match = [...value.matchAll(URL_EXTRACT_REGEX)];
  if (match.length > 0) {
    value = match[0][2];
  }

  // Remove query params
  value = value.split("?")[0];

  // Convert leading "/" to relative project path
  if (value.startsWith("/")) {
    return path.resolve(path.join(imageDirectory, value.slice(1)));
  }

  // Resolve relative paths
  return path.resolve(path.join(imageDirectory, value));
}

/**
 * Extracts all strings in a tagged template literal (styled-components, css``)
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
 */
function extractFromJSXStyle(node, file, collected) {
  if (!node || node.type !== "JSXExpressionContainer") return;

  const expr = node.expression;
  if (!expr || expr.type !== "ObjectExpression") return;

  expr.properties.forEach((prop) => {
    if (
      prop.type !== "ObjectProperty" ||
      !prop.key ||
      !prop.value
    ) return;

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
        matches.forEach((m) =>
          collected.add(JSON.stringify({ path: m[2], file }))
        );
      } else if (IMAGE_REGEX.test(raw)) {
        collected.add(JSON.stringify({ path: raw, file }));
      }
    }

    // Template literal
    if (prop.value.type === "TemplateLiteral") {
      extractFromTemplateLiteral(prop.value.quasis).forEach((v) => {
        collected.add(JSON.stringify({ path: v, file }));
      });
    }
  });
}

/**
 * MAIN FUNCTION
 */
async function getUnusedImages(chalk, imageDirectory, codeDirectory, options) {
  const used = new Set();
  const unusedImages = [];

  // ---- Collect image files in asset directory ----
  const imageFiles = await fg([`${imageDirectory}/**/*.{png,jpg,jpeg,svg,gif,webp}`]);

  // ---- Scan Code Files ----
  const codeFiles = await fg([`${codeDirectory}/**/*.{js,jsx,ts,tsx}`]);
  let index = 0;
  for (const file of codeFiles) {
    index++;
    console.clear();
    console.log('Scanning code files...', index, 'of', codeFiles.length);
    const code = fs.readFileSync(file, "utf8");

    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    traverse(ast, {
      /**
       * import logo from './img/a.png'
       */
      ImportDeclaration(pathNode) {
        const val = pathNode.node.source.value;
        if (IMAGE_REGEX.test(val)) {
          used.add(JSON.stringify({ path: val, file }));
        }
      },

      /**
       * require('./img/a.png')
       */
      CallExpression(pathNode) {
        const callee = pathNode.node.callee;
        const args = pathNode.node.arguments;

        if (
          callee.type === "Identifier" &&
          callee.name === "require" &&
          args.length &&
          args[0].type === "StringLiteral"
        ) {
          const val = args[0].value;
          if (IMAGE_REGEX.test(val)) {
            used.add(JSON.stringify({ path: val, file }));
          }
        }

        // dynamic import("./a.png")
        if (
          callee.type === "Import" &&
          args.length &&
          args[0].type === "StringLiteral"
        ) {
          const val = args[0].value;
          if (IMAGE_REGEX.test(val)) {
            used.add(JSON.stringify({ path: val, file }));
          }
        }
      },

      /**
       * <img src="...">
       */
      JSXAttribute(attr) {
        if (attr.node.name.name === "src") {
          const v = attr.node.value;
          if (!v) return;

          if (v.type === "StringLiteral") {
            if (IMAGE_REGEX.test(v.value)) {
              used.add(JSON.stringify({ path: v.value, file }));
            }
          }

          if (v.type === "JSXExpressionContainer") {
            const expr = v.expression;

            if (expr.type === "StringLiteral") {
              if (IMAGE_REGEX.test(expr.value)) {
                used.add(JSON.stringify({ path: expr.value, file }));
              }
            }

            if (expr.type === "TemplateLiteral") {
              extractFromTemplateLiteral(expr.quasis).forEach((v) => {
                used.add(JSON.stringify({ path: v, file }));
              });
            }
          }
        }

        // Handle style={{ backgroundImage: "url(...)" }}
        if (attr.node.name.name === "style") {
          extractFromJSXStyle(attr.node.value, file, used);
        }
      },

      /**
       * String Literals anywhere
       */
      StringLiteral(p) {
        const val = p.node.value;

        if (IMAGE_REGEX.test(val)) {
          used.add(JSON.stringify({ path: val, file }));
        }

        // detect url("...") inside strings (e.g., Tailwind)
        const matches = [...val.matchAll(URL_EXTRACT_REGEX)];
        matches.forEach((m) =>
          used.add(JSON.stringify({ path: m[2], file }))
        );
      },

      /**
       * Template Literals anywhere
       */
      TemplateLiteral(p) {
        extractFromTemplateLiteral(p.node.quasis).forEach((v) => {
          used.add(JSON.stringify({ path: v, file }));
        });
      },

      /**
       * styled-components & css`` blocks
       */
      TaggedTemplateExpression(p) {
        const quasi = p.node.quasi;
        const extracted = extractFromTemplateLiteral(quasi.quasis);
        extracted.forEach((v) => used.add(JSON.stringify({ path: v, file })));
      },
    });
  }

  // Add CSS images
  const cssImages = await getCssImages(codeDirectory);
  cssImages.forEach((img) =>
    used.add(JSON.stringify({ path: img.value, file: img.file }))
  );

  // Normalize all used images
  const normalizedUsed = new Set();
  index = 0;
  for (const entry of used) {
    index++;
    console.clear();
    console.log('Normalizing images...', index, 'of', used.size);
    const { path: p } = JSON.parse(entry);
    const normalized = normalize(p, imageDirectory);
    if (normalized) normalizedUsed.add(normalized);
  }

  // ---- Determine unused ----
  index = 0;
  for (const img of imageFiles) {
    index++;
    console.clear();
    console.log('Determining unused images...', index, 'of', imageFiles.length);
    const full = path.resolve(img);
    if (!normalizedUsed.has(full)) {
      unusedImages.push(full);
    }
  }
  // ---- Output table or list ----
  if (options.table) {
    const table = new Table({
      head: options.dryRun ? ["Unused Images (Would Delete)"] : ["Unused Images"],
      colWidths: [100],
    });
    unusedImages.forEach((img) => table.push([img]));
    console.log(table.toString());
  } else {
    unusedImages.forEach((img) => console.log(chalk.red(img)));
  }

  // ---- deletion logic ----
  if (options.dryRun) {
    console.log(
      chalk.cyan(
        `\n[DRY RUN] Would delete ${unusedImages.length} file(s)`
      )
    );
  } else if (unusedImages.length > 0) {
    askDeleteFiles(unusedImages);
  }

  return unusedImages;
}

module.exports = {
  getUnusedImages,
};
