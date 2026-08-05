import { URL_EXTRACT_REGEX, IMAGE_REGEX } from "./constants";
import {
  extractFromTemplateLiteral,
  extractFromJSXStyle,
  type ImageImportRef,
} from "./imageExtractors";

/**
 * Create AST traverser with handlers for extracting image references
 */
export function createASTTraverser(
  file: string,
  imports: ImageImportRef[]
): Record<string, (pathNode: any) => void> {
  return {
    /**
     * import logo from './img/a.png'
     */
    ImportDeclaration(pathNode: any) {
      const val = pathNode.node.source.value;
      if (IMAGE_REGEX.test(val)) {
        imports.push({
          file: file,
          source: val,
        });
      }
    },

    /**
     * require('./img/a.png')
     */
    CallExpression(pathNode: any) {
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
          imports.push({
            file: file,
            source: val,
          });
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
          imports.push({
            file: file,
            source: val,
          });
        }
      }
    },

    /**
     * <img src="...">
     */
    JSXAttribute(attr: any) {
      if (attr.node.name.name === "src") {
        const v = attr.node.value;
        if (!v) return;

        if (v.type === "StringLiteral") {
          if (IMAGE_REGEX.test(v.value)) {
            imports.push({
              file: file,
              source: v.value,
            });
          }
        }

        if (v.type === "JSXExpressionContainer") {
          const expr = v.expression;

          if (expr.type === "StringLiteral") {
            if (IMAGE_REGEX.test(expr.value)) {
              imports.push({
                file: file,
                source: expr.value,
              });
            }
          }

          if (expr.type === "TemplateLiteral") {
            extractFromTemplateLiteral(expr.quasis).forEach((v) => {
              imports.push({
                file: file,
                source: v,
              });
            });
          }
        }
      }

      // Handle style={{ backgroundImage: "url(...)" }}
      if (attr.node.name.name === "style") {
        extractFromJSXStyle(attr.node.value, file, imports);
      }
    },

    /**
     * Array expressions: const images = ['/img/a.png', '/img/b.png']
     * This explicitly handles arrays of image paths, including spread elements
     */
    ArrayExpression(p: any) {
      p.node.elements.forEach((element: any) => {
        if (!element) return; // Skip null/undefined elements (e.g., [1, , 3])

        // Handle string literals in arrays
        if (element.type === "StringLiteral") {
          const val = element.value;
          if (IMAGE_REGEX.test(val)) {
            imports.push({
              file: file,
              source: val,
            });
          }
          // detect url("...") inside strings
          const matches = [...val.matchAll(URL_EXTRACT_REGEX)];
          matches.forEach((m) =>
            imports.push({
              file: file,
              source: m[2],
            })
          );
        }

        // Handle template literals in arrays
        if (element.type === "TemplateLiteral") {
          extractFromTemplateLiteral(element.quasis).forEach((v) => {
            imports.push({
              file: file,
              source: v,
            });
          });
        }

        // Handle spread elements: [...otherArray, '/img/a.png']
        if (element.type === "SpreadElement" && element.argument) {
          // The spread element's argument will be visited by other handlers
          // but we can explicitly check if it's an array with string literals
          if (element.argument.type === "ArrayExpression") {
            element.argument.elements.forEach((spreadEl: any) => {
              if (spreadEl && spreadEl.type === "StringLiteral") {
                const val = spreadEl.value;
                if (IMAGE_REGEX.test(val)) {
                  imports.push({
                    file: file,
                    source: val,
                  });
                }
              }
            });
          }
        }
      });
    },

    /**
     * String Literals anywhere
     */
    StringLiteral(p: any) {
      const val = p.node.value;

      if (IMAGE_REGEX.test(val)) {
        imports.push({
          file: file,
          source: val,
        });
      }

      // detect url("...") inside strings (e.g., Tailwind)
      const matches = [...val.matchAll(URL_EXTRACT_REGEX)];
      matches.forEach((m) =>
        imports.push({
          file: file,
          source: m[2],
        })
      );
    },

    /**
     * Template Literals anywhere
     */
    TemplateLiteral(p: any) {
      extractFromTemplateLiteral(p.node.quasis).forEach((v) => {
        imports.push({
          file: file,
          source: v,
        });
      });
    },

    /**
     * styled-components & css`` blocks
     */
    TaggedTemplateExpression(p: any) {
      const quasi = p.node.quasi;
      const extracted = extractFromTemplateLiteral(quasi.quasis);
      extracted.forEach((v) =>
        imports.push({
          file: file,
          source: v,
        })
      );
    },
  };
}
