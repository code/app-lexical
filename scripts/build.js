/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

const rollup = require('rollup');
const fs = require('fs-extra');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2));
const babel = require('@rollup/plugin-babel').default;
const nodeResolve = require('@rollup/plugin-node-resolve').default;
const commonjs = require('@rollup/plugin-commonjs');
const replace = require('@rollup/plugin-replace');
const json = require('@rollup/plugin-json');
const alias = require('@rollup/plugin-alias');
const terser = require('@rollup/plugin-terser');
const {exec} = require('child-process-promise');
const {packagesManager} = require('./shared/packagesManager');
const npmToWwwName = require('./www/npmToWwwName');
const glob = require('glob');

const headerTemplate = fs.readFileSync(
  path.resolve(__dirname, 'www', 'headerTemplate.js'),
  'utf8',
);

const isProduction = argv.prod;
const isRelease = argv.release;
const isWWW = argv.www;
const extractCodes = argv.codes;

const modulePackageMappings = Object.fromEntries(
  packagesManager.getPublicPackages().flatMap((pkg) => {
    const pkgName = pkg.getNpmName();
    return pkg.getExportedNpmModuleNames().map((npm) => [npm, pkgName]);
  }),
);

function getShikiAssets(assetType) {
  return glob
    .sync(
      path.resolve(
        path.dirname(__dirname),
        'node_modules/@shikijs/' + assetType + '/dist/*.mjs',
      ),
      {windowsPathsNoEscape: true},
    )
    .map((p) => path.basename(p.replaceAll('\\', '/'), '.mjs'));
}

const wwwMappings = {
  ...Object.fromEntries(
    Object.keys(modulePackageMappings).map((npm) => [npm, npmToWwwName(npm)]),
  ),
  ...Object.fromEntries(
    getShikiAssets('langs').map((name) => [
      `@shikijs/langs/${name}`,
      `shikijs-langs-${name}`,
    ]),
  ),
  ...Object.fromEntries(
    getShikiAssets('themes').map((name) => [
      `@shikijs/themes/${name}`,
      `shikijs-themes-${name}`,
    ]),
  ),
  'prismjs/components/prism-c': 'prism-c',
  'prismjs/components/prism-clike': 'prism-clike',
  'prismjs/components/prism-core': 'prismjs',
  'prismjs/components/prism-cpp': 'prism-cpp',
  'prismjs/components/prism-css': 'prism-css',
  'prismjs/components/prism-java': 'prism-java',
  'prismjs/components/prism-javascript': 'prism-javascript',
  'prismjs/components/prism-markdown': 'prism-markdown',
  'prismjs/components/prism-markup': 'prism-markup',
  'prismjs/components/prism-objectivec': 'prism-objectivec',
  'prismjs/components/prism-powershell': 'prism-powershell',
  'prismjs/components/prism-python': 'prism-python',
  'prismjs/components/prism-rust': 'prism-rust',
  'prismjs/components/prism-sql': 'prism-sql',
  'prismjs/components/prism-swift': 'prism-swift',
  'prismjs/components/prism-typescript': 'prism-typescript',
  'react-dom': 'ReactDOM',
  // The react entrypoint in fb includes the jsx runtime
  'react/jsx-runtime': 'react',
};

/**
 * Fix ESM imports of prismjs components that rely on a wildcard export, these
 * must have a '.js' extension to be resolved correctly.
 *
 * @param {string} id the module id to resolve
 * @returns {string} the module name with '.js' extension if necessary
 */
function resolveExternalEsm(id) {
  if (/^prismjs\/components\/prism-/.test(id)) {
    return `${id}.js`;
  }
  return id;
}

/**
 * The set of all modules that should remain external to our published
 * packages, should include all public monorepo packages and the third
 * party dependencies or peerDependencies that we do not want to include
 * in the bundles.
 */
const monorepoExternalsSet = new Set(Object.entries(wwwMappings).flat());
const thirdPartyExternals = ['react', 'react-dom', 'yjs', 'y-websocket'];
const thirdPartyExternalsRegExp = new RegExp(
  `^(${thirdPartyExternals.join('|')})(\\/|$)`,
);

const strictWWWMappings = {};

// Add quotes around mappings to make them more strict.
Object.keys(wwwMappings).forEach((mapping) => {
  strictWWWMappings[`'${mapping}'`] = `'${wwwMappings[mapping]}'`;
});

/**
 * @param {'esm'|'cjs'} format
 * @returns {'.mjs'|'.js'} the correct file extension for this export format
 */
function getExtension(format) {
  return `.${format === 'esm' ? 'm' : ''}js`;
}

/**
 *
 * @param {string} name
 * @param {string} inputFile
 * @param {string} outputPath
 * @param {string} outputFile
 * @param {boolean} isProd
 * @param {'cjs'|'esm'} format
 * @param {string} version
 * @param {import('./shared/PackageMetadata').PackageMetadata} pkg
 * @returns {Promise<Array<string>>} the exports of the built module
 */
async function build(
  name,
  inputFile,
  outputPath,
  outputFile,
  isProd,
  format,
  version,
  pkg,
) {
  const extensions = ['.js', '.jsx', '.ts', '.tsx'];
  const inputOptions = {
    external(modulePath, src) {
      const modulePkgName = modulePackageMappings[modulePath];
      if (
        typeof modulePkgName === 'string' &&
        !(
          modulePkgName in (pkg.packageJson.dependencies || {}) ||
          modulePkgName === pkg.getNpmName()
        )
      ) {
        console.error(
          `Error: ${path.relative(
            '.',
            src,
          )} has an undeclared dependency in its import of ${modulePath}.\nAdd the following to the dependencies in ${path.relative(
            '.',
            pkg.resolve('package.json'),
          )}: "${modulePkgName}": "${version}"`,
        );
        process.exit(1);
      }
      return (
        monorepoExternalsSet.has(modulePath) ||
        thirdPartyExternalsRegExp.test(modulePath)
      );
    },
    input: inputFile,
    onwarn(warning) {
      if (warning.code === 'CIRCULAR_DEPENDENCY') {
        // Ignored
      } else if (warning.code === 'UNUSED_EXTERNAL_IMPORT') {
        // Important, but not enough to stop the build
        console.error();
        console.error(warning.message || warning);
        console.error();
      } else if (
        warning.code === 'SOURCEMAP_ERROR' &&
        warning.message.endsWith(`Can't resolve original location of error.`)
      ) {
        // Ignored
      } else if (typeof warning.code === 'string') {
        console.error(warning);
        // This is a warning coming from Rollup itself.
        // These tend to be important (e.g. clashes in namespaced exports)
        // so we'll fail the build on any of them.
        console.error();
        console.error(warning.message || warning);
        console.error();
        process.exit(1);
      } else {
        // The warning is from one of the plugins.
        // Maybe it's not important, so just print it.
        console.warn(warning.message || warning);
      }
    },
    plugins: [
      alias({
        entries: [
          {find: 'shared', replacement: path.resolve('packages/shared/src')},
        ],
      }),
      nodeResolve({
        extensions,
      }),
      babel({
        babelHelpers: 'bundled',
        babelrc: false,
        configFile: false,
        exclude: '**/node_modules/**',
        extensions,
        plugins: [
          [
            require('./error-codes/transform-error-messages'),
            {extractCodes, noMinify: !isProd},
          ],
          '@babel/plugin-transform-optional-catch-binding',
        ],
        presets: [
          [
            '@babel/preset-typescript',
            {
              tsconfig: path.resolve('./tsconfig.build.json'),
            },
          ],
          ['@babel/preset-react', {runtime: 'automatic'}],
        ],
      }),
      commonjs(),
      json(),
      replace(
        Object.assign(
          {
            __DEV__: isProd ? 'false' : 'true',
            delimiters: ['', ''],
            preventAssignment: true,
            'process.env.LEXICAL_VERSION': JSON.stringify(
              `${version}+${isProd ? 'prod' : 'dev'}.${format}`,
            ),
          },
          isWWW && strictWWWMappings,
        ),
      ),
      // terser is used because @ampproject/rollup-plugin-closure-compiler
      // doesn't compile `export default function X()` correctly and hasn't
      // been updated since Aug 2021
      isProd && terser({ecma: 2019, module: format === 'esm'}),
      {
        renderChunk(source) {
          // Assets pipeline might use "export" word in the beginning of the line
          // as a dependency, avoiding it with empty comment in front
          const patchedSource = isWWW
            ? source.replace(/^(export(?!s))/gm, '/**/$1')
            : source;
          return `${getComment()}\n${patchedSource}`;
        },
      },
    ],
    // Lexical Code: this ensures PrismJS imports get included in the bundle
    // Lexical Code Shiki: 'recommended' preset has treeshake.tryCatchDeoptimization: true which avoids
    //                     feature detection of oniguruma-to-es to be optimized out and cause a bug
    treeshake: ['smallest', false, 'recommended'][
      1 + ['Lexical Code', 'Lexical Code Shiki'].indexOf(name)
    ],
  };
  /** @type {import('rollup').OutputOptions} */
  const outputOptions = {
    esModule: false,
    exports:
      // Special case for lexical-eslint-plugin which is written in cjs and
      // requires a default export. Default exports in all other modules are
      // deprecated.
      name === 'Lexical Eslint Plugin' ? 'auto' : 'named',
    externalLiveBindings: false,
    file: outputFile,
    format, // change between es and cjs modules
    freeze: false,
    interop: format === 'esm' ? 'esModule' : undefined,
    paths: format === 'esm' ? resolveExternalEsm : undefined,
  };
  const result = await rollup.rollup(inputOptions);
  const {output} = await result.write(outputOptions);
  return output[0].exports;
}

function getComment() {
  if (!isWWW) {
    return headerTemplate;
  }
  const lines = headerTemplate.split(/\n/g);
  const idx = lines.indexOf(' */');
  if (idx === -1) {
    throw new Error(
      `Expecting scripts/www/headerTemplate.js to have a ' */' line`,
    );
  }
  lines.splice(
    idx,
    0,
    ' *',
    ' * @fullSyntaxTransform',
    ' * @es6-async_DO_NOT_USE',
    ' * @generated',
    ' * @noflow',
    ' * @nolint',
    ' * @oncall lexical_web_text_editor',
    ' * @preserve-invariant-messages',
    ' * @preserve-whitespace',
    ' * @preventMunge',
  );
  return lines.join('\n');
}

function getFileName(fileName, isProd, format) {
  const extension = getExtension(format);
  if (isWWW || isRelease) {
    return `${fileName}.${isProd ? 'prod' : 'dev'}${extension}`;
  }
  return `${fileName}${extension}`;
}

/**
 *
 * @param {string} packageName
 * @param {string} outputPath
 */
async function buildTSDeclarationFiles(packageName, outputPath) {
  await exec('tsc -p ./tsconfig.build.json');
}

/**
 *
 * @param {string} packageName
 * @param {string} outputPath
 */
function moveTSDeclarationFilesIntoDist(packageName, outputPath) {
  fs.copySync(`./.ts-temp/packages/${packageName}/src`, outputPath);
}

/**
 * @typedef {Object} ForkModuleContentOptions
 * @property {string} devFileName
 * @property {Array<string>} exports
 * @property {string} outputFileName
 * @property {string} prodFileName
 */

/**
 *
 * @param {ForkModuleContentOptions} opts
 * @param {'cjs'|'esm'|'node'} target
 * @returns {string}
 */
function forkModuleContent(
  {devFileName, exports, outputFileName, prodFileName},
  target,
) {
  const lines = [getComment()];
  if (target === 'cjs') {
    lines.push(
      `'use strict'`,
      `const ${outputFileName} = process.env.NODE_ENV !== 'production' ? require('${devFileName}') : require('${prodFileName}');`,
      `module.exports = ${outputFileName};`,
    );
  } else {
    if (target === 'esm') {
      lines.push(
        `import * as modDev from '${devFileName}';`,
        `import * as modProd from '${prodFileName}';`,
        `const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;`,
      );
    } else if (target === 'node') {
      lines.push(
        `const mod = await (process.env.NODE_ENV !== 'production' ? import('${devFileName}') : import('${prodFileName}'));`,
      );
    }
    for (const name of exports) {
      lines.push(
        name === 'default'
          ? `export default mod.default;`
          : `export const ${name} = mod.${name};`,
      );
    }
  }
  return lines.join('\n');
}

/**
 *
 * @param {string} outputPath
 * @param {string} outputFileName
 * @param {'cjs'|'esm'} format
 * @param {Array<string>} exports
 */
function buildForkModules(outputPath, outputFileName, format, exports) {
  const extension = getExtension(format);
  const devFileName = `./${outputFileName}.dev${extension}`;
  const prodFileName = `./${outputFileName}.prod${extension}`;
  const opts = {devFileName, exports, outputFileName, prodFileName};
  fs.outputFileSync(
    path.resolve(outputPath, `${outputFileName}${extension}`),
    forkModuleContent(opts, format),
  );
  if (format === 'esm') {
    fs.outputFileSync(
      path.resolve(outputPath, `${outputFileName}.node${extension}`),
      forkModuleContent(opts, 'node'),
    );
  }
}

async function buildAll() {
  if (!isWWW && (isRelease || isProduction)) {
    await buildTSDeclarationFiles();
  }

  const formats = isWWW ? ['cjs'] : ['cjs', 'esm'];
  for (const pkg of packagesManager.getPublicPackages()) {
    const {name, sourcePath, outputPath, packageName, modules} =
      pkg.getPackageBuildDefinition();
    const {version} = pkg.packageJson;
    for (const module of modules) {
      for (const format of formats) {
        const {sourceFileName, outputFileName} = module;
        const inputFile = path.resolve(sourcePath, sourceFileName);

        await build(
          `${name}${module.name ? '-' + module.name : ''}`,
          inputFile,
          outputPath,
          path.resolve(
            outputPath,
            getFileName(outputFileName, isProduction, format),
          ),
          isProduction,
          format,
          version,
          pkg,
        );

        if (isRelease) {
          const exports = await build(
            name,
            inputFile,
            outputPath,
            path.resolve(
              outputPath,
              getFileName(outputFileName, false, format),
            ),
            false,
            format,
            version,
            pkg,
          );
          buildForkModules(outputPath, outputFileName, format, exports);
        }
      }
    }

    if (!isWWW && (isRelease || isProduction)) {
      moveTSDeclarationFilesIntoDist(packageName, outputPath);
    }
  }
}

buildAll();
