const fs = require("fs");
const fg = require("fast-glob");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

async function getAssetInCode() {
  const usedImages = new Set();

  const imageRegex = /\.(png|jpg|jpeg|svg|gif|webp)$/i;

  const codeFiles = await fg([
    "src/**/*.{tsx,ts,js,jsx}"
  ]);
  console.log(codeFiles);
  for (const file of codeFiles) {
    const code = fs.readFileSync(file, "utf8");
    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    traverse(ast, {
      // <img src="...">
      JSXAttribute(path) {
        if (path.node.name.name !== "src") return;

        const value = path.node.value;

        if (value.type === "StringLiteral") {
          if (imageRegex.test(value.value)) {
            usedImages.add(value.value);
          }
        }

        if (value.type === "JSXExpressionContainer") {
          const expr = value.expression;

          if (expr.type === "StringLiteral" && imageRegex.test(expr.value)) {
            usedImages.add(expr.value);
          }

          if (expr.type === "TemplateLiteral") {
            expr.quasis.forEach((q) => {
              if (imageRegex.test(q.value.raw)) {
                usedImages.add(q.value.raw);
              }
            });
          }
        }
      },

      // String literals anywhere in code
      StringLiteral(path) {
        if (imageRegex.test(path.node.value)) {
          usedImages.add(path.node.value);
        }
      },

      // Template literals: `/images/${name}.png`
      TemplateLiteral(path) {
        path.node.quasis.forEach((quasi) => {
          if (imageRegex.test(quasi.value.raw)) {
            usedImages.add(quasi.value.raw);
          }
        });
      },

      // Arrays: ["img/a.png", "img/b.png"]
      ArrayExpression(path) {
        path.node.elements.forEach((el) => {
          if (el?.type === "StringLiteral" && imageRegex.test(el.value)) {
            usedImages.add(el.value);
          }
        });
      },

      // Objects: { image: "img/a.png" }
      ObjectProperty(path) {
        const val = path.node.value;
        if (val.type === "StringLiteral" && imageRegex.test(val.value)) {
          usedImages.add(val.value);
        }
      },
    });
  }
  console.log(Array.from(usedImages));
}

getAssetInCode();

