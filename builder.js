const Browserify = Npm.require('browserify');
const stream = Npm.require('stream');
const stripJsonComments = Npm.require('strip-json-comments');
const npm = Npm.require('npm');
const os = Npm.require('os');
const camelCase = Npm.require('camelcase');
const {fs, path} = Plugin;

/**
 * Logs given messages to a file
 *
 * @methodName logMsg
 * @param {...Object} args - collection/map/whatever of arguments to be logged
 */
function logMsg(...args) {
    const str = `${Date.now()} => ${JSON.stringify(args, null, '\t')}\r\n`;
    console.log(str); // if its available, debug it here
    process.stdout.write(str); //not sure exactly where this goes,, to the console? so if above line needed?
    /**
     * When debugging compiler code, it can get pretty hairy. You don't always have access to the same error reporting
     * functionality, and alot of the time STDOUT/console.log/etc are redirected to somwhere you can't see. I've also found
     * that is quite a pain to use NodeInspector to debug package.js/other native js (ie: compiler plugins) this is a quick
     * hack around this issue that allows you to (synchronously) write to an error log (Something meteor doesn't support
     * out of the box. It may be ugly, slow to test, but it's quick to implement.for trivial matters. This func helped me when
     * fixing #3 @see https://github.com/vazco/meteor-universe-modules-npm/issues/3 so I will keep it arround incase someone
     * could benefit from it.
     *
     * TL;DR uncomment line directly below to log messages to a file.
     */
    //fs.appendFileSync('SOMEPATH-WHICH-REDACTED/fslog.txt', str, 'utf8');
}

const getString = Meteor.wrapAsync((bundle, cb) => {
    let string = '';
    bundle.on('data', (data) => string += data);
    bundle.once('end', () => cb(void 0, string));
    return bundle.once('error', cb);
});

class UniverseModulesNPMBuilder extends CachingCompiler {
    constructor() {
        super({
            compilerName: 'UniverseModulesNPMBuilder',
            defaultCacheSize: 1024 * 1024 * 10
        });
    }

    getCacheKey(file) {
        return file.getSourceHash() + file.getPathInPackage() + JSON.stringify(file.getFileOptions());
    }

    compileResultSize(compileResult) {
        return compileResult.length * 2;
    }

    /**
     * Gets the base directory for a given file based on file location
     *
     * @param {Object} file - handle for file that is to be compiled
     * @returns {string} the full qualified path containing given  file
     */
    getBasedir(file) {
        const basedir = path.resolve(Plugin.convertToStandardPath(os.tmpdir()), 'universe-npm');
        return path.resolve(basedir, (file.getPackageName() || '' + file.getPathInPackage()).replace(/[^a-zA-Z0-9\-]/g, '_'));
    }

    addCompileResult(file, compileResult) {
        return file.addJavaScript({
            path: file.getPathInPackage() + '.js',
            sourcePath: file.getPathInPackage(),
            data: compileResult
        });
    }

    excludeFromBundle(browserify, systemDependencies, system) {
        system._bundleIndexes = {};
        const  _reg = /(.*)\.[^.]+$/;
        if (Array.isArray(systemDependencies)) {
            systemDependencies.forEach(toImport => {
                browserify.exclude(toImport);
            });
            systemDependencies._deps = {};
            browserify.on('dep', row => {
                const file = Plugin.convertToStandardPath(row.file);
                const moduleName = (file.split('/node_modules/')).pop();
                if (!systemDependencies.some(toImport => moduleName.indexOf(toImport + '/') === 0 )) {
                    Object.keys(row.deps).forEach(dep => {
                        systemDependencies.some(toImport => {
                            if (dep.indexOf(toImport + '/') === 0) {
                                systemDependencies._deps[dep] = true;
                            }
                        });
                    });
                    system._bundleIndexes[moduleName.replace(_reg, '$1')] = row.id;
                }
            });
        } else {
            browserify.on('dep', row => {
                const file = Plugin.convertToStandardPath(row.file);
                const moduleName = (file.split('/node_modules/')).pop();
                system._bundleIndexes[moduleName.replace(_reg, '$1')] = row.id;
            });
        }
    }

    /**
     * Passes given configuration object's properties onto the module that's getting compiled.
     *
     * @param {object} sysConfig - a map object containing config info in the form of { ..., cfgName: cfgValue, ... }
     * @returns {string} - code being generated (or not) for the System.config
     */
    configureSystem(sysConfig) {
        if (typeof sysConfig === 'object' && Object.keys(sysConfig).length) {
            return `System.config(${JSON.stringify(sysConfig)});`;
        }
        return '';
    }

    compileOneFile(file) {
        const sourcePath = file.getPackageName() + '/' + file.getPathInPackage();
        Plugin.nudge && Plugin.nudge();
        logMsg('Universe NPM: ' + sourcePath);
        try {
            const {source, config, moduleId} = this.prepareSource(file);
            const optionsForBrowserify = this.getBrowserifyOptions(file, config.browserify);
            const browserify = Browserify([source], optionsForBrowserify); // eslint-disable-line new-cap
            config.system = config.system || {};
            this.excludeFromBundle(browserify, config.system.dependencies, config.system);
            this.applyTransforms(browserify, optionsForBrowserify);
            const bundle = browserify.bundle();
            bundle.setEncoding('utf8');
            return this.getCompileResult(bundle, config.system, moduleId);
        } catch (_error) {
            logMsg('error in compileOnFile ' + JSON.stringify({
                message: _error.message,
                sourcePath
            }));
            file.error({
                message: _error.message,
                sourcePath
            });
        }
    }

    /**
     * Applies supplied browserify transforms to source files
     * @param {mystery} browserify -  the browserify instance
     * @param {object} browserifyOptions - map in the format of { ..., transformName: { ...transformOptions... }, ... }
     */
    applyTransforms(browserify, browserifyOptions) {
        //var envifyOptions, transformName, transformOptions, transforms;
        //envifyOptions = browserifyOptions.transforms.envify; // and if there is no transforms set on browserifyOptions ---> kaboom
        //delete browserifyOptions.transforms.envify;
        //transforms = browserifyOptions.transforms;
        _.forEach(browserifyOptions.transforms, (transformOptions, transformName) => {
            browserify.transform(transformName, transformOptions);
        });
    }

    getCompileResult(bundle, {dependencies, config, _bundleIndexes}, moduleId) {
        const source = getString(bundle);
        if (!Array.isArray(dependencies)) {
            dependencies = [];
        }
        // adding important system deps
        if (dependencies._deps) {
            dependencies.concat(Object.keys(dependencies._deps)); // no need for ...spread here, looks akward infront of a wrapped expression
        }
        const depPromisesStr = dependencies.map(dep =>
            `"${System.normalizeSync(dep)}"`
        ).join(',') || '';
        return (
`
__UniverseNPMDynamicLoader("${moduleId}", [${depPromisesStr}], ${JSON.stringify(config)}, (function(require, _uniSysExports, _uniSysModule) {
    ${source}
}), ${JSON.stringify(_bundleIndexes)});
`
        );
    }

    getBrowserifyOptions(file, userOptions) {
        userOptions = userOptions || {};
        const defaultOptions = {
            basedir: Plugin.convertToOSPath(this.getBasedir(file)),
            debug: true,
            ignoreMissing: true,
            transforms: {
                //other default transforms would go here
            }
        };
        _.defaults(userOptions, defaultOptions);
        /**
         * forcing envify defeats the purpose of _.defaults, just use _.extend then
         *
         * AFTER, looking trough the code that used to be here, I figured out that it
         * would have the same effect as _.defaults, its just unnecessary because we
         * already use _.defaults. The only difference would be that if user passed
         * defaultOptions = {..., transforms: { envify:null }, ...}
         * your code would overwrite it and force user to use envify because it checks null
         */
        return userOptions;
    }

    getDebug() {
        var debug, key, _i, _len, _ref1;
        debug = true;
        _ref1 = process.argv;
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
            key = _ref1[_i];
            if (key === 'bundle' || key === 'build') {
                debug = __indexOf.call(process.argv, '--debug') >= 0;
                break;
            }
        }
        return debug;
    }

    /**
     * Folds System.js wrapper around given file
     *
     * @param {Object} file - handle for file that is to be compiled
     * @returns {{source: string, config: Object, moduleId: string, modulesToExport: string}}
     */
    prepareSource(file) {
        const source = new stream.PassThrough();
        const config = JSON.parse(stripJsonComments(file.getContentsAsString()));
        const moduleId = this.getModuleId(file);
        let lines = '';
        config.packages = config.packages || config.dependencies;
        if (config && config.packages) {
            _.each(config.packages, (version, packageName) => {
                const camelCasePkgName = camelCase(packageName);
                lines += (
                    `    _uniSysModule.exports["${camelCasePkgName}"] = require('${packageName}');
                    `
                );
            });
            lines += (
                `     _uniSysModule.exports._bundleRequire = require;
                `
            );
            installPackages(this.getBasedir(file), file, config.packages);
        }
        source.end(lines);
        return {source, config, moduleId};
    }

    /**
     * Gets the id of the module that given source file will be compiled into
     * @param {Object} file - handle for file that is to be compiled
     * @returns {string} the id of the module the given file will compile to
     */
    getModuleId(file) {
        // Relative path of file to the package or app root directory (always uses forward slashes)
        const filePath = file.getPathInPackage();

        // Options from api.addFile
        //const fileOptions = file.getFileOptions();

        // Name of the package or null if the file is not in a package.
        const packageName = file.getPackageName();

        // moduleId - Module name (full patch without extension)
        // ext - File extension (either js or jsx)
        let moduleId = filePath.replace(/\.npm\.json$/, '');

        // prefix module name accordingly
        if (packageName) {
            // inside package
            moduleId = '/_modules_/packages/' + packageName.replace(':', '/') + '/' + moduleId;
        } else {
            // inside main app
            moduleId = '/_modules_/app/' + moduleId;
        }
        return moduleId;
    }
}

const ensureDepsInstalled = Meteor.wrapAsync((basedir, packages, cb) => {
    logMsg('Installing npm packages: ' + packages.join(', ') + '\r\n');
    npm.load((err) => {
        err && cb(err);
        npm.commands.install(Plugin.convertToOSPath(basedir), packages, cb);
    });
});


function installPackages(basedir, file, packageList) {
    const packages = [];
    var installedCount = 0;
    _.map(packageList, (version, packageName) => {
        if (typeof version === 'object') {
            version = version.version;
        }
        if (!version) {
            file.error({
                message: 'Missing version of npm package: ' + packageName,
                sourcePath: file.getPackageName() + '/' + file.getPathInPackage()
            });
            logMsg({
                message: 'Missing version of npm package: ' + packageName,
                sourcePath: file.getPackageName() + '/' + file.getPathInPackage()
            });
            return;
        }
        const fullPkgName = packageName + '@' + version;
        const pgPath = path.resolve(basedir, 'node_modules', packageName);
        if (fs.existsSync(pgPath)) {
            try {
                const targetPkgData = fs.readFileSync(path.resolve(pgPath, 'package.json'), 'utf8');
                if (targetPkgData) {
                    const targetPkg = JSON.parse(targetPkgData);
                    if (targetPkg && version === targetPkg.version) {
                        installedCount++;
                    }
                }
            } catch (err) {
                logMsg(...err);
            }
        }
        packages.push(fullPkgName);
    });

    if (!packages.length || installedCount === packages.length) {
        return;
    }
    try {
        deleteFolderRecursive(path.resolve(basedir, 'node_modules'));
        savePackageJsnFile(file.getPackageName() + '/' + file.getPathInPackage(), basedir);
        ensureDepsInstalled(basedir, packages);
    } catch (err) {
        logMsg(...err);
        file.error({
            message: 'Couldn\'t install NPM package: ' + err.toString(),
            sourcePath: (file.getPackageName() || '') + '/' + file.getPathInPackage()
        });
    }
}

function deleteFolderRecursive(pathToDelete) { // eslint was giving me errors saying "path" was already defined within scope
    if (fs.existsSync(pathToDelete)) {
        fs.readdirSync(pathToDelete).forEach((file) => {
            const curPath = pathToDelete + '/' + file;
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(pathToDelete);
    }
}

function savePackageJsnFile(pgName, basedir) {
    const data = (
        `{
  "name": "${pgName.replace(/[^a-z]/g, '-')}",
  "version": "9.9.9",
  "description": "This is stamp only",
  "license": "UNLICENSED",
  "private": true
}`
    );

    if (!fs.existsSync(basedir)) {
        fs.mkdir(basedir, e => !e && fs.writeFile(path.resolve(basedir, 'package.json'), data, 'utf8', () => {}));
    } else {
        fs.writeFile(path.resolve(basedir, 'package.json'), data, 'utf8', () => {});
    }
}

Plugin.registerCompiler({
    extensions: ['npm.json']
}, () => {
    return new UniverseModulesNPMBuilder();
});
