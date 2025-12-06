#!/usr/bin/env node
/**
 * 智能注释 console.log 语句
 * 可以正确处理多行 console.log
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 要处理的文件扩展名
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// 排除的目录
const EXCLUDED_DIRS = ['node_modules', 'dist', 'build', '.git'];

/**
 * 递归获取所有文件
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!EXCLUDED_DIRS.includes(file)) {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
      }
    } else {
      const ext = path.extname(file);
      if (EXTENSIONS.includes(ext)) {
        arrayOfFiles.push(filePath);
      }
    }
  });

  return arrayOfFiles;
}

/**
 * 智能注释 console 语句
 * 支持多行 console.log 和对象参数
 */
function commentConsoleLogs(content) {
  const lines = content.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 检查是否是 console 调用的开始
    const consoleMatch = trimmed.match(/^(\/\/\s*)?(console\.(log|warn|info|debug|error)\s*\()/);

    if (consoleMatch && !consoleMatch[1]) {
      // 未注释的 console 语句
      const indent = line.match(/^(\s*)/)[1];

      // 找到完整的 console 语句（处理多行情况）
      let bracketCount = 0;
      let inString = false;
      let stringChar = '';
      let j = i;
      let foundEnd = false;

      // 计算当前行的括号
      for (let char of line) {
        if (!inString) {
          if (char === '"' || char === "'" || char === '`') {
            inString = true;
            stringChar = char;
          } else if (char === '(') {
            bracketCount++;
          } else if (char === ')') {
            bracketCount--;
            if (bracketCount === 0) {
              foundEnd = true;
              break;
            }
          }
        } else if (char === stringChar && (j === 0 || lines[j][lines[j].indexOf(char) - 1] !== '\\')) {
          inString = false;
        }
      }

      // 如果当前行就结束了
      if (foundEnd) {
        result.push(indent + '// ' + trimmed);
        i++;
        continue;
      }

      // 多行情况：注释起始行
      result.push(indent + '// ' + trimmed);
      j = i + 1;

      // 继续处理后续行
      while (j < lines.length && bracketCount > 0) {
        const nextLine = lines[j];
        const nextTrimmed = nextLine.trim();
        const nextIndent = nextLine.match(/^(\s*)/)[1];

        for (let char of nextLine) {
          if (!inString) {
            if (char === '"' || char === "'" || char === '`') {
              inString = true;
              stringChar = char;
            } else if (char === '(') {
              bracketCount++;
            } else if (char === ')') {
              bracketCount--;
              if (bracketCount === 0) {
                foundEnd = true;
                break;
              }
            }
          } else if (char === stringChar) {
            const charIndex = nextLine.indexOf(char);
            if (charIndex === 0 || nextLine[charIndex - 1] !== '\\') {
              inString = false;
            }
          }
        }

        // 注释这一行
        if (nextTrimmed) {
          result.push(nextIndent + '// ' + nextTrimmed);
        } else {
          result.push(nextLine);
        }

        j++;
      }

      i = j;
    } else {
      // 保持原样
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}

/**
 * 处理单个文件
 */
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const newContent = commentConsoleLogs(content);

    if (content !== newContent) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✓ ${filePath}`);
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(`✗ ${filePath}: ${error.message}`);
    return 0;
  }
}

/**
 * 主函数
 */
function main() {
  const srcDir = path.join(__dirname, '..', 'src');

  if (!fs.existsSync(srcDir)) {
    console.error('src 目录不存在');
    process.exit(1);
  }

  console.log('正在搜索并注释 console 语句...\n');

  const files = getAllFiles(srcDir);
  let modifiedCount = 0;

  files.forEach(file => {
    modifiedCount += processFile(file);
  });

  console.log(`\n完成！共处理 ${files.length} 个文件，修改了 ${modifiedCount} 个文件。`);
}

main();
