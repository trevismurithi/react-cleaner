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
            (specifier) => (specifier.exported.name, specifier.local.name)
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
            names: [spec.exported.name, spec.local.name],
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
        names: ["*"],
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
 // Handles:
  // import X from "./mod"
  // import { A as B } from "./mod"
  // import * as Utils from "./mod"
  // import "./polyfills"
  ImportDeclaration({ node }) {
    // import "./polyfills"  (side-effect only import)
    if (node.specifiers.length === 0) {
      imports.push({
        file: filePath,
        source: node.source.value,
        type: "side-effect",
        imported: null,
        local: null,
      })
      return
    }

    for (const spec of node.specifiers) {
      // import { A } from "./mod"
      // import { A as B } from "./mod"
      if (spec.type === "ImportSpecifier") {
        imports.push({
          file: filePath,
          source: node.source.value,
          imported: spec.imported.name, // original exported name
          local: spec.local.name,       // name used in this file
          type: "named"
        })
      }

      // import Foo from "./mod"
      if (spec.type === "ImportDefaultSpecifier") {
        imports.push({
          file: filePath,
          source: node.source.value,
          imported: "default",
          local: spec.local.name,
          type: "default"
        })
      }

      // import * as Utils from "./mod"
      if (spec.type === "ImportNamespaceSpecifier") {
        imports.push({
          file: filePath,
          source: node.source.value,
          imported: "*",
          local: spec.local.name,
          type: "namespace"
        })
      }
    }
  },
  // Handles:
  // import("./lazy")
  // const m = await import("./lazy")
  // const m = import("./lazy")
  // require("./file")
  CallExpression({ node }) {
    // Dynamic ES module import
    if (node.callee.type === "Import") {
      const arg = node.arguments[0]

      if (arg?.type === "StringLiteral") {
        // import("./file")
        imports.push({
          file: filePath,
          source: arg.value,
          type: "dynamic",
          imported: null,
          local: null,
        })
      } else {
        // import(someVariable)
        imports.push({
          file: filePath,
          source: null,
          type: "dynamic-variable",
          imported: null,
          local: null,
        })
      }
    }

    // CommonJS require("./file")
    if (
      node.callee.type === "Identifier" &&
      node.callee.name === "require" &&
      node.arguments[0]?.type === "StringLiteral"
    ) {
      imports.push({
        file: filePath,
        source: node.arguments[0].value,
        type: "cjs",
        imported: null,
        local: null,
      })
    }
  },

  // Handles:
  // import foo = require("./foo")   (TypeScript only)
  TSImportEqualsDeclaration({ node }) {
    if (
      node.moduleReference.type === "TSExternalModuleReference" &&
      node.moduleReference.expression.type === "StringLiteral"
    ) {
      imports.push({
        file: filePath,
        source: node.moduleReference.expression.value,
        type: "ts-require",
        imported: null,
        local: null,
      });
    }
  },
});

  return { imports, exports };
}

module.exports = {
  parseCode,
  extractImportsAndExports,
};
