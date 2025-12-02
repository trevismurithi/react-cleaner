const fg = require('fast-glob');
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

async function getFiles() {
    const assets = [];
  const files = await fg([  "src/**/*.{png,jpg,jpeg,svg,gif,webp}",
    "public/**/*.{png,jpg,jpeg,svg,gif,webp}",]);
const codeFiles = await fg([  "src/**/*.{js,jsx,ts,tsx}",
    "src/**/*.css",
    "src/**/*.json"]);

    for (const file of codeFiles) {
      const code = fs.readFileSync(file, 'utf8');
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
    traverse(ast, {
      ImportDeclaration: ({ node }) => {
        if(typeof node.source.value === 'string' && /\.(png|jpg|jpeg|svg|gif|webp)$/.test(node.source.value)){
          assets.push(node.source.value);
        }
      },
      CallExpression: ({ node }) => {
        if(node.callee.name === 'require' && typeof node.arguments[0].value === 'string' && /\.(png|jpg|jpeg|svg|gif|webp)$/.test(node.arguments[0].value)){
          assets.push(node.arguments[0].value);
        }
      },
    });
  }
  console.log(assets);
  console.log(files);
}

getFiles();