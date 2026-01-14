const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

/**
 * Parses code into an AST
 * @param {string} code - The source code to parse
 * @returns {Object} The parsed AST
 */
function parseCode(code) {
  return parser.parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript", "decorators-legacy"],
  });
}

/**
 * Extracts imports and exports from an AST
 * @param {Object} ast - The parsed AST
 * @param {string} filePath - The path of the file being parsed
 * @returns {Object} Object containing arrays of imports and exports
 */
function extractImportsAndExports(ast, filePath) {
  const imports = [];
  const exports = [];

  traverse(ast, {
    ExportNamedDeclaration: ({ node }) => {
      if (node.source) {
        exports.push({
          file: filePath,
          source: node.source.value,
          names: node.specifiers.map(
            (specifier) => specifier.exported.name
          ),
          type: "re-export",
        });
      } else {
        // export function Foo() {}
        if (node.declaration) {
          if (node.declaration.type === "FunctionDeclaration") {
            exports.push({
              file: filePath,
              source: null,
              names: [node.declaration.id.name],
              type: "function",
            });
          }

          if (node.declaration.type === "VariableDeclaration") {
            for (const decl of node.declaration.declarations) {
              if (decl.id.type === "Identifier") {
                exports.push({
                  file: filePath,
                  source: null,
                  names: [decl.id.name],
                  type: "variable",
                });
              }
            }
          }
        }
        // export { Foo, Bar }
        for (const spec of node.specifiers) {
          exports.push({
            file: filePath,
            source: null,
            names: [spec.exported.name],
            type: "export",
          });
        }
        exports.push({
          file: filePath,
          source: null,
          names: node.specifiers.map(
            (specifier) => specifier.exported.name
          ),
          type: "local",
        });
      }
    },
    ExportAllDeclaration: ({ node }) => {
      exports.push({
        file: filePath,
        source: node.source.value,
        names: [],
        type: "all",
      });
    },
    ExportDefaultDeclaration: ({ node }) => {
      if (node.source) {
        exports.push({
          file: filePath,
          source: node.source.value,
          names: [node.declaration.name],
          type: "default",
        });
      }
    },
    ImportDeclaration: ({ node }) => {
      imports.push({
        file: filePath,
        source: node.source.value,
      });
    },
    CallExpression({ node }) {
      if (node.callee.type === "Import") {
        const arg = node.arguments[0];

        if (arg?.type === "StringLiteral") {
          imports.push({
            file: filePath,
            source: arg.value,
            type: "dynamic",
          });
        } else {
          imports.push({
            file: filePath,
            source: null,
            type: "dynamic-variable",
          });
        }
      }
    },
  });

  return { imports, exports };
}

module.exports = {
  parseCode,
  extractImportsAndExports,
};
