import path from "path";
import { parse } from "@babel/parser";
import type { ParserPlugin } from "@babel/parser";
import traverse from "@babel/traverse";
import { parseSync } from "@swc/core";
import { Visitor } from "@swc/core/Visitor";

const defaultParsePlugins: ParserPlugin[] = [
  "jsx",
  "typescript",
  "decorators-legacy",
];
const typescriptNoJsxPlugins: ParserPlugin[] = [
  "typescript",
  "decorators-legacy",
];

export interface ImportInfo {
  file: string;
  source: string | null;
  type: string;
  imported: string | null;
  local: string | null;
}

export interface ExportInfo {
  file: string;
  source: string | null;
  names: string[];
  type: string;
}

/**
 * @param filePath
 * @param vueScriptLang - SFC script lang (e.g. ts, tsx); only used when filePath ends in .vue
 */
function babelPluginsForFile(
  filePath?: string,
  vueScriptLang?: string
): ParserPlugin[] {
  let effectivePath = filePath;
  if (filePath && vueScriptLang && /\.vue$/i.test(filePath)) {
    const lang = String(vueScriptLang).toLowerCase();
    if (lang === "ts" || lang === "mts" || lang === "cts") {
      effectivePath = filePath.replace(/\.vue$/i, ".ts");
    } else if (lang === "tsx" || lang === "jsx") {
      effectivePath = filePath.replace(/\.vue$/i, ".tsx");
    }
  }
  if (!effectivePath) {
    return defaultParsePlugins;
  }
  const ext = path.extname(effectivePath).toLowerCase();
  if (ext === ".ts" || ext === ".mts" || ext === ".cts") {
    return typescriptNoJsxPlugins;
  }
  return defaultParsePlugins;
}

/**
 * Parses code into an AST
 */
export function parseCode(
  code: string,
  filePath?: string,
  vueScriptLang?: string
): ReturnType<typeof parse> {
  return parse(code, {
    sourceType: "module",
    plugins: babelPluginsForFile(filePath, vueScriptLang),
  });
}

/**
 * Extracts imports and exports from an AST
 */
export function extractImportsAndExports(
  ast: ReturnType<typeof parse>,
  filePath: string
): { imports: ImportInfo[]; exports: ExportInfo[] } {
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];

  traverse(ast, {
    ExportNamedDeclaration: ({ node }: any) => {
      if (node.source) {
        exports.push({
          file: filePath,
          source: node.source.value,
          names: node.specifiers.map(
            (specifier: any) =>
              (specifier.exported.name, specifier.local.name)
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
            (specifier: any) => specifier.exported.name
          ),
          type: "local",
        });
      }
    },
    ExportAllDeclaration: ({ node }: any) => {
      exports.push({
        file: filePath,
        source: node.source.value,
        names: ["*"],
        type: "all",
      });
    },
    ExportDefaultDeclaration: ({ node }: any) => {
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
    ImportDeclaration({ node }: any) {
      // import "./polyfills"  (side-effect only import)
      if (node.specifiers.length === 0) {
        imports.push({
          file: filePath,
          source: node.source.value,
          type: "side-effect",
          imported: null,
          local: null,
        });
        return;
      }

      for (const spec of node.specifiers) {
        // import { A } from "./mod"
        // import { A as B } from "./mod"
        if (spec.type === "ImportSpecifier") {
          imports.push({
            file: filePath,
            source: node.source.value,
            imported: spec.imported.name, // original exported name
            local: spec.local.name, // name used in this file
            type: "named",
          });
        }

        // import Foo from "./mod"
        if (spec.type === "ImportDefaultSpecifier") {
          imports.push({
            file: filePath,
            source: node.source.value,
            imported: "default",
            local: spec.local.name,
            type: "default",
          });
        }

        // import * as Utils from "./mod"
        if (spec.type === "ImportNamespaceSpecifier") {
          imports.push({
            file: filePath,
            source: node.source.value,
            imported: "*",
            local: spec.local.name,
            type: "namespace",
          });
        }
      }
    },
    // Handles:
    // import("./lazy")
    // const m = await import("./lazy")
    // const m = import("./lazy")
    // require("./file")
    CallExpression({ node }: any) {
      // Dynamic ES module import
      if (node.callee.type === "Import") {
        const arg = node.arguments[0];

        if (arg?.type === "StringLiteral") {
          // import("./file")
          imports.push({
            file: filePath,
            source: arg.value,
            type: "dynamic",
            imported: null,
            local: null,
          });
        } else {
          // import(someVariable)
          imports.push({
            file: filePath,
            source: null,
            type: "dynamic-variable",
            imported: null,
            local: null,
          });
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
        });
      }
    },

    // Handles:
    // import foo = require("./foo")   (TypeScript only)
    TSImportEqualsDeclaration({ node }: any) {
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

class ExtractImportsExportsVisitor extends Visitor {
  filePath: string;
  imports: ImportInfo[];
  exports: ExportInfo[];

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    this.imports = [];
    this.exports = [];
  }

  // Skip TS type subtrees — faster and avoids visitor edge cases.
  visitTsType(node: any): any {
    return node;
  }

  visitTsTypeAnnotation(node: any): any {
    return node;
  }

  /**
   * SWC puts `export function/class/const` on ExportDeclaration,
   * not ExportNamedDeclaration (unlike Babel).
   */
  visitExportDeclaration(node: any): any {
    const decl = node.declaration;
    if (decl) {
      if (decl.type === "FunctionDeclaration") {
        this.exports.push({
          file: this.filePath,
          source: null,
          names: [decl.identifier.value],
          type: "function",
        });
      } else if (decl.type === "ClassDeclaration") {
        this.exports.push({
          file: this.filePath,
          source: null,
          names: [decl.identifier.value],
          type: "class",
        });
      } else if (decl.type === "VariableDeclaration") {
        for (const d of decl.declarations) {
          if (d.id.type === "Identifier") {
            this.exports.push({
              file: this.filePath,
              source: null,
              names: [d.id.value],
              type: "variable",
            });
          }
        }
      }
    }

    // Must continue traversal — e.g. export const x = () => import("./mod")
    return super.visitExportDeclaration(node);
  }

  // export { Foo } / export { Foo } from './mod'
  visitExportNamedDeclaration(node: any): any {
    if (node.source) {
      this.exports.push({
        file: this.filePath,
        source: node.source.value,
        names: (node.specifiers || []).map(
          (spec: any) => spec.exported?.value || spec.orig.value
        ),
        type: "re-export",
      });
    } else {
      for (const spec of node.specifiers || []) {
        const localName = spec.orig.value;
        const exportedName = spec.exported ? spec.exported.value : localName;
        this.exports.push({
          file: this.filePath,
          source: null,
          names: [exportedName, localName],
          type: "export",
        });
      }

      // Match Babel extractor: also record a combined "local" entry
      this.exports.push({
        file: this.filePath,
        source: null,
        names: (node.specifiers || []).map((spec: any) =>
          spec.exported ? spec.exported.value : spec.orig.value
        ),
        type: "local",
      });
    }

    return super.visitExportNamedDeclaration(node);
  }

  visitExportAllDeclaration(node: any): any {
    this.exports.push({
      file: this.filePath,
      source: node.source.value,
      names: ["*"],
      type: "all",
    });
    return super.visitExportAllDeclaration(node);
  }

  // export default function Foo() {} / export default class Foo {}
  visitExportDefaultDeclaration(node: any): any {
    const declName =
      node.decl?.identifier?.value || node.decl?.value || "default";
    this.exports.push({
      file: this.filePath,
      source: null,
      names: [declName],
      type: "default",
    });
    return super.visitExportDefaultDeclaration(node);
  }

  // export default <expression>  (e.g. export default 42)
  visitExportDefaultExpression(node: any): any {
    this.exports.push({
      file: this.filePath,
      source: null,
      names: ["default"],
      type: "default",
    });
    return super.visitExportDefaultExpression(node);
  }

  visitImportDeclaration(node: any): any {
    const source = node.source.value;

    if (!node.specifiers || node.specifiers.length === 0) {
      this.imports.push({
        file: this.filePath,
        source,
        type: "side-effect",
        imported: null,
        local: null,
      });
    } else {
      for (const spec of node.specifiers) {
        // SWC uses ImportSpecifier (not NamedImportSpecifier) for named imports
        if (
          spec.type === "ImportSpecifier" ||
          spec.type === "NamedImportSpecifier"
        ) {
          this.imports.push({
            file: this.filePath,
            source,
            imported: spec.imported ? spec.imported.value : spec.local.value,
            local: spec.local.value,
            type: "named",
          });
        } else if (spec.type === "ImportDefaultSpecifier") {
          this.imports.push({
            file: this.filePath,
            source,
            imported: "default",
            local: spec.local.value,
            type: "default",
          });
        } else if (spec.type === "ImportNamespaceSpecifier") {
          this.imports.push({
            file: this.filePath,
            source,
            imported: "*",
            local: spec.local.value,
            type: "namespace",
          });
        }
      }
    }
    return super.visitImportDeclaration(node);
  }

  visitCallExpression(node: any): any {
    if (node.callee.type === "Import") {
      const arg = node.arguments[0]?.expression;
      if (arg?.type === "StringLiteral") {
        this.imports.push({
          file: this.filePath,
          source: arg.value,
          type: "dynamic",
          imported: null,
          local: null,
        });
      } else {
        this.imports.push({
          file: this.filePath,
          source: null,
          type: "dynamic-variable",
          imported: null,
          local: null,
        });
      }
    }

    if (node.callee.type === "Identifier" && node.callee.value === "require") {
      const arg = node.arguments[0]?.expression;
      if (arg?.type === "StringLiteral") {
        this.imports.push({
          file: this.filePath,
          source: arg.value,
          type: "cjs",
          imported: null,
          local: null,
        });
      }
    }

    return super.visitCallExpression(node);
  }

  visitTsImportEqualsDeclaration(node: any): any {
    if (
      node.moduleReference?.type === "TsExternalModuleReference" &&
      node.moduleReference.expression?.type === "StringLiteral"
    ) {
      this.imports.push({
        file: this.filePath,
        source: node.moduleReference.expression.value,
        type: "ts-require",
        imported: null,
        local: null,
      });
    }
    return super.visitTsImportEqualsDeclaration(node);
  }
}

export function analyzeFileWithSWC(
  code: string,
  filePath: string
): { imports: ImportInfo[]; exports: ExportInfo[] } {
  const ext = path.extname(filePath || "").toLowerCase();
  const isTypeScript = [".ts", ".tsx", ".mts", ".cts"].includes(ext);
  // Match Babel: no JSX for plain .ts (angle-bracket assertions); enable for .tsx/.jsx/.js
  const isTsx = ext === ".tsx";
  const isJsx = [".jsx", ".js", ".mjs", ".cjs"].includes(ext) || !ext;

  const options = isTypeScript
    ? {
        syntax: "typescript" as const,
        tsx: isTsx,
        decorators: true,
        dynamicImport: true,
      }
    : {
        syntax: "ecmascript" as const,
        jsx: isJsx,
        decorators: true,
        dynamicImport: true,
      };

  const ast = parseSync(code, options);

  const visitor = new ExtractImportsExportsVisitor(filePath);
  visitor.visitModule(ast as any);

  return {
    imports: visitor.imports,
    exports: visitor.exports,
  };
}
