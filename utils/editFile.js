const { Project } = require('ts-morph');
const fs = require('fs');
const path = require('path');

/**
 * Counts references to a name node in the same source file, excluding the definition site.
 * @param {import('ts-morph').Node} nameNode
 * @param {import('ts-morph').SourceFile} sourceFile
 */
function countInFileNonDefinitionReferences(nameNode, sourceFile) {
  const filePath = sourceFile.getFilePath();
  let count = 0;
  for (const referenced of nameNode.findReferences()) {
    for (const ref of referenced.getReferences()) {
      if (ref.getSourceFile().getFilePath() !== filePath) {
        continue;
      }
      if (ref.isDefinition()) {
        continue;
      }
      count++;
    }
  }
  return count;
}

/**
 * Module-scope functions and variables that are never read or called inside the same file.
 * Skips exported symbols (including `export { x }`). Skips binding patterns (destructuring).
 *
 * @param {string} filePath - Absolute or cwd-relative path to a .ts/.tsx/.js file
 * @returns {{ unusedFunctions: string[], unusedVariables: string[] }}
 */
function findUnusedFunctionsAndVariablesInFile(filePath) {
  const resolved = path.resolve(filePath);
  const project = new Project({
    compilerOptions: {
      allowJs: true,
    },
  });
  const sourceFile = project.addSourceFileAtPath(resolved);

  const unusedFunctions = [];
  for (const fn of sourceFile.getFunctions()) {
    if (fn.isExported()) {
      continue;
    }
    const nameNode = fn.getNameNode();
    if (nameNode.getKindName() !== 'Identifier') {
      continue;
    }
    if (countInFileNonDefinitionReferences(nameNode, sourceFile) === 0) {
      unusedFunctions.push(fn.getName());
    }
  }

  const unusedVariables = [];
  for (const decl of sourceFile.getVariableDeclarations()) {
    if (decl.isExported()) {
      continue;
    }
    const nameNode = decl.getNameNode();
    if (nameNode.getKindName() !== 'Identifier') {
      continue;
    }
    if (countInFileNonDefinitionReferences(nameNode, sourceFile) === 0) {
      unusedVariables.push(decl.getName());
    }
  }

  return { unusedFunctions, unusedVariables };
}

/**
 * @param {import('ts-morph').ExportSpecifier} spec
 * @param {string} exportName
 */
function exportSpecifierMatches(spec, exportName) {
  if (spec.getName() === exportName) {
    return true;
  }
  const alias = spec.getAliasNode();
  return alias != null && alias.getText() === exportName;
}

/**
 * Removes `exportName` from local `export { a, b }` clauses (not `export { x } from './m'`).
 * @param {import('ts-morph').SourceFile} sourceFile
 * @param {string} exportName
 * @param {{ totalItemsRemoved: number }} stats
 */
function removeNamedExportSpecifier(sourceFile, exportName, stats) {
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    if (exportDecl.getModuleSpecifier()) {
      continue;
    }
    if (!exportDecl.hasNamedExports()) {
      continue;
    }
    const specs = [...exportDecl.getNamedExports()];
    for (const spec of specs) {
      if (exportSpecifierMatches(spec, exportName)) {
        spec.remove();
        stats.totalItemsRemoved++;
      }
    }
    if (!exportDecl.hasNamedExports() || exportDecl.getNamedExports().length === 0) {
      exportDecl.remove();
    }
  }
}

async function editFile(listToRemove) {
    const project = new Project({
        compilerOptions: {
            allowJs: true,
        }
    });
    const stats = {
       totalItemsRemoved: 0,
      totalLinesRemoved: 0,
      bytesSaved: 0,
      filesModified: 0,
    }
    for(const [filePath, exportNames] of listToRemove.entries()) {
        const sourceFile = project.addSourceFileAtPath(filePath);
        const initialLoc = sourceFile.getEndLineNumber()
        const initialSize = fs.statSync(filePath).size;

        exportNames.forEach(exportName => {
            // look for variable declaration
            const variableDeclaration = sourceFile.getVariableDeclaration(exportName);
            if(variableDeclaration) {
                variableDeclaration.remove();
                stats.totalItemsRemoved++;
            }

            // look for function declaration
            const functionDeclaration = sourceFile.getFunction(exportName);
            if(functionDeclaration) {
                functionDeclaration.remove();
                stats.totalItemsRemoved++;
            }

            // look for class declaration
            const classDeclaration = sourceFile.getClass(exportName);
            if(classDeclaration) {
                classDeclaration.remove();
                stats.totalItemsRemoved++;
            }

            // look for interface declaration
            const interfaceDeclaration = sourceFile.getInterface(exportName);
            if(interfaceDeclaration) {
                interfaceDeclaration.remove();
                stats.totalItemsRemoved++;
            }

            // look for type alias
            const typeAliasDeclaration = sourceFile.getTypeAlias(exportName);
            if(typeAliasDeclaration) {
                typeAliasDeclaration.remove();
                stats.totalItemsRemoved++;
            }

            // look for enum declaration
            const enumDeclaration = sourceFile.getEnum(exportName);
            if(enumDeclaration) {
                enumDeclaration.remove();
                stats.totalItemsRemoved++;
            }

            // namespace or legacy `module` block (ModuleDeclaration)
            const moduleOrNamespaceDeclaration = sourceFile.getModule(exportName);
            if(moduleOrNamespaceDeclaration) {
                moduleOrNamespaceDeclaration.remove();
                stats.totalItemsRemoved++;
            }

            removeNamedExportSpecifier(sourceFile, exportName, stats);
        })

        await sourceFile.save();

        // calculate delta for this file
        const finalLoc = sourceFile.getEndLineNumber()
        const finalSize = fs.statSync(filePath).size;
        const linesRemoved = initialLoc - finalLoc;
        const bytesSaved = initialSize - finalSize;
        stats.totalLinesRemoved += linesRemoved;
        stats.bytesSaved += bytesSaved;
        stats.filesModified++;
    }

    return generateSavingsReport(stats);
}

function generateSavingsReport(stats) {
    // 0.25 (15 mins) per file for audit, 0.01 (36s) per variable for "cognitive cleanup"
    const hoursSaved = (stats.filesModified * 0.25) + (stats.totalItemsRemoved * 0.01);    
    return {
      title: "Qleaner Surgical Report",
      removedCount: stats.totalItemsRemoved,
      locRemoved: stats.totalLinesRemoved,
      kbSaved: (stats.bytesSaved / 1024).toFixed(2),
      timeSaved: `${hoursSaved.toFixed(2)} hrs`,
      message: `You just saved your team approximately ${hoursSaved.toFixed(1)} hours of future manual auditing.`
    };
  }

module.exports = {
    editFile,
    generateSavingsReport,
    findUnusedFunctionsAndVariablesInFile,
}